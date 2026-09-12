from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any

from .alarm_service import create_alarm, delete_alarm, get_alarm, list_alarms, update_alarm
from .config import settings
from .db import init_db
from .livekit_service import create_participant_token
from .challenge_service import get_challenge, start_challenge, submit_challenge

app = FastAPI(title="Chronos API", version="0.1.0")

DEFAULT_LIVEKIT_COACH_NAME = "Chronos教练"

app.add_middleware(
  CORSMiddleware,
  allow_origins=list(settings.cors_origins),
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.get("/")
def root_health() -> dict[str, str]:
  """Simple browser-friendly health response for the local API."""
  return {"status": "ok", "service": "chronos-api"}


class AlarmInput(BaseModel):
  activationTime: str = Field(pattern=r"^\d{4}$")
  title: str = Field(min_length=1, max_length=120)
  context: str = Field(default="", max_length=4000)
  goal: str = Field(default="", max_length=4000)


class LiveKitSessionContext(BaseModel):
  # Kept for backwards compatibility with existing clients.
  location: str = Field(default="", max_length=160)
  coach_name: str = Field(default=DEFAULT_LIVEKIT_COACH_NAME, min_length=1, max_length=80)
  # User-editable context that is not part of the alarm card itself.  The
  # object is intentionally open-ended so the visual editor can evolve.
  annotation: dict[str, Any] = Field(default_factory=dict)
  # Accept the more explicit wire name as an additive compatibility alias.
  background_context: dict[str, Any] = Field(default_factory=dict)
  # Frontend-owned alarm card for preview/local mode; database lookup remains
  # available for native deployments that send alarm_id.
  alarm: dict[str, Any] = Field(default_factory=dict)


class LiveKitTokenRequest(BaseModel):
  room_name: str = Field(min_length=1, max_length=120)
  participant_name: str = Field(min_length=1, max_length=120)
  participant_identity: str = Field(min_length=1, max_length=120)
  alarm_id: str | None = Field(default=None, min_length=1, max_length=160)
  session_context: LiveKitSessionContext | None = None


class AlarmChallengeInput(BaseModel):
  alarm_id: str = Field(min_length=1, max_length=160)
  kind: str = Field(default="text", pattern="^(arithmetic|text)$")
  difficulty: str = Field(default="easy", pattern="^(easy|medium)$")
  prompt: str | None = Field(default=None, max_length=15, description="Text challenge prompt; hard limit of 15 Unicode characters.")
  round: int = Field(default=1, ge=1, le=20)
  idempotency_key: str | None = Field(default=None, max_length=240)


class AlarmChallengeSubmitInput(BaseModel):
  value: str = Field(max_length=200)


@app.on_event("startup")
def on_startup() -> None:
  init_db()


@app.get("/health")
def health() -> dict[str, str]:
  return {"status": "ok"}


@app.post("/api/alarm-challenges")
def api_start_alarm_challenge(payload: AlarmChallengeInput) -> dict:
  try:
    return start_challenge(
      alarm_id=payload.alarm_id,
      kind=payload.kind,  # type: ignore[arg-type]
      difficulty=payload.difficulty,  # type: ignore[arg-type]
      prompt=payload.prompt,
      round_number=payload.round,
      idempotency_key=payload.idempotency_key,
    )
  except ValueError as error:
    raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/alarm-challenges/{challenge_id}")
def api_get_alarm_challenge(challenge_id: str) -> dict:
  result = get_challenge(challenge_id)
  if result is None:
    raise HTTPException(status_code=404, detail="challenge not found")
  return result


@app.post("/api/alarm-challenges/{challenge_id}/submit")
def api_submit_alarm_challenge(challenge_id: str, payload: AlarmChallengeSubmitInput) -> dict:
  result = submit_challenge(challenge_id, payload.value)
  if result is None:
    raise HTTPException(status_code=404, detail="challenge not found")
  return result


@app.get("/api/alarms")
def api_alarms() -> dict:
  return {"alarms": list_alarms()}


@app.post("/api/alarms", status_code=201)
def api_create_alarm(payload: AlarmInput) -> dict:
  try:
    return {"alarm": create_alarm(payload.model_dump(mode="json"))}
  except ValueError as error:
    raise HTTPException(status_code=422, detail=str(error)) from error


@app.put("/api/alarms/{alarm_id}")
def api_update_alarm(alarm_id: str, payload: AlarmInput) -> dict:
  try:
    alarm = update_alarm(alarm_id, payload.model_dump(mode="json"))
  except ValueError as error:
    raise HTTPException(status_code=422, detail=str(error)) from error
  if alarm is None:
    raise HTTPException(status_code=404, detail="alarm not found")
  return {"alarm": alarm}


@app.delete("/api/alarms/{alarm_id}", status_code=204)
def api_delete_alarm(alarm_id: str) -> None:
  if not delete_alarm(alarm_id):
    raise HTTPException(status_code=404, detail="alarm not found")


@app.post("/livekit/token")
def livekit_token(payload: LiveKitTokenRequest) -> dict[str, str]:
  session_context = {
    "coach_name": DEFAULT_LIVEKIT_COACH_NAME,
  }
  if payload.session_context:
    supplied = payload.session_context.model_dump()
    # Keep legacy location/coach_name fields at the top level while carrying
    # all other user-editable background context in a dedicated annotation
    # object. Alarm card fields are deliberately excluded from this object.
    location = str(supplied.get("location") or "").strip()
    if location:
      session_context["location"] = location
    coach_name = str(supplied.get("coach_name") or "").strip()
    if coach_name:
      session_context["coach_name"] = coach_name
    annotation = _sanitize_annotation(supplied.get("annotation"))
    alias_annotation = _sanitize_annotation(supplied.get("background_context"))
    if alias_annotation:
      merged_annotation = dict(alias_annotation)
      merged_annotation.update(annotation)
      annotation = merged_annotation
    if annotation:
      session_context["annotation"] = annotation
      # Emit an additive alias for agents/clients using the descriptive name.
      session_context["background_context"] = annotation
  if payload.alarm_id:
    alarm = get_alarm(payload.alarm_id)
    if alarm is None:
      raise HTTPException(status_code=404, detail="alarm not found")
    session_context = {
      **session_context,
      "alarm_id": payload.alarm_id,
      "alarm": alarm,
    }
  elif payload.session_context and payload.session_context.alarm:
    supplied_alarm = payload.session_context.alarm
    alarm_id = supplied_alarm.get("id")
    if isinstance(alarm_id, str) and alarm_id.strip():
      session_context["alarm_id"] = alarm_id.strip()
      session_context["alarm"] = supplied_alarm
  try:
    return create_participant_token(
      room_name=payload.room_name,
      participant_name=payload.participant_name,
      participant_identity=payload.participant_identity,
      session_context=session_context or None,
    )
  except RuntimeError as error:
    raise HTTPException(status_code=503, detail=str(error)) from error


_ALARM_CONTEXT_KEYS = {
  "title", "goal", "context", "brief_context", "briefContext",
  "activationTime", "activation_time", "alarm", "alarm_id",
}


def _sanitize_annotation(value: Any) -> dict[str, Any]:
  """Return a bounded, JSON-friendly annotation object without alarm fields."""
  if not isinstance(value, dict):
    return {}
  result: dict[str, Any] = {}
  for key, item in value.items():
    if not isinstance(key, str) or key in _ALARM_CONTEXT_KEYS:
      continue
    # Metadata is sent through a JWT/LiveKit dispatch; avoid unexpectedly
    # large values while preserving nested editor sections.
    if isinstance(item, (str, int, float, bool)) or item is None:
      result[key] = item
    elif isinstance(item, dict):
      nested = _sanitize_annotation(item)
      if nested:
        result[key] = nested
    elif isinstance(item, list):
      result[key] = [entry for entry in item if isinstance(entry, (str, int, float, bool))][:50]
  return result
