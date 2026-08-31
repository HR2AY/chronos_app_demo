from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .alarm_service import create_alarm, delete_alarm, get_alarm, list_alarms, update_alarm
from .config import settings
from .db import init_db
from .livekit_service import create_participant_token

app = FastAPI(title="Chronos API", version="0.1.0")

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
  location: str = Field(min_length=1, max_length=160)
  coach_name: str = Field(min_length=1, max_length=80)


class LiveKitTokenRequest(BaseModel):
  room_name: str = Field(min_length=1, max_length=120)
  participant_name: str = Field(min_length=1, max_length=120)
  participant_identity: str = Field(min_length=1, max_length=120)
  alarm_id: str | None = Field(default=None, min_length=1, max_length=160)
  session_context: LiveKitSessionContext | None = None


DEFAULT_LIVEKIT_LOCATION = "徐汇体育馆游泳"
DEFAULT_LIVEKIT_COACH_NAME = "Chronos教练"


@app.on_event("startup")
def on_startup() -> None:
  init_db()


@app.get("/health")
def health() -> dict[str, str]:
  return {"status": "ok"}


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
    "location": DEFAULT_LIVEKIT_LOCATION,
    "coach_name": DEFAULT_LIVEKIT_COACH_NAME,
  }
  if payload.session_context:
    session_context.update(payload.session_context.model_dump())
  if payload.alarm_id:
    alarm = get_alarm(payload.alarm_id)
    if alarm is None:
      raise HTTPException(status_code=404, detail="alarm not found")
    session_context = {
      **session_context,
      "alarm_id": payload.alarm_id,
      "alarm": alarm,
    }
  try:
    return create_participant_token(
      room_name=payload.room_name,
      participant_name=payload.participant_name,
      participant_identity=payload.participant_identity,
      session_context=session_context or None,
    )
  except RuntimeError as error:
    raise HTTPException(status_code=503, detail=str(error)) from error
