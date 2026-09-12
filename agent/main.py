import os
import asyncio
import json
import logging
from typing import Literal

import aiohttp

try:
  from dotenv import load_dotenv
except ModuleNotFoundError:
  load_dotenv = None

if load_dotenv:
  load_dotenv()

from livekit.agents import Agent, AgentSession, JobContext, RunContext, WorkerOptions, cli, function_tool
from livekit.plugins import openai, silero

from prompt_context import build_agent_instructions, build_greeting, parse_session_metadata


logger = logging.getLogger("chronos-agent")


def env_flag(name: str, default: bool = False) -> bool:
  value = os.getenv(name)
  if value is None:
    return default
  return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int, minimum: int = 1, maximum: int = 10) -> int:
  value = os.getenv(name)
  if value is None:
    return default
  try:
    parsed = int(value.strip())
  except (TypeError, ValueError):
    return default
  return min(maximum, max(minimum, parsed))


async def connect_to_livekit(ctx: JobContext) -> None:
  """Retry the initial room handshake when the network route is still settling."""
  attempts = env_int("LIVEKIT_CONNECT_RETRIES", 3)
  delay = env_int("LIVEKIT_CONNECT_RETRY_DELAY", 1, minimum=1, maximum=10)

  for attempt in range(1, attempts + 1):
    try:
      logger.info("connecting to LiveKit room (attempt %s/%s)", attempt, attempts)
      await ctx.connect()
      logger.info("connected to LiveKit room")
      return
    except Exception as error:
      if attempt == attempts:
        logger.exception("failed to connect to LiveKit after %s attempts: %s", attempts, error)
        raise
      logger.warning(
        "LiveKit connection attempt %s/%s failed; retrying in %ss: %s",
        attempt,
        attempts,
        delay * attempt,
        error,
      )
      await asyncio.sleep(delay * attempt)


def _api_base_url() -> str:
  return os.getenv("CHRONOS_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


async def _publish_challenge_event(context: RunContext, payload: dict) -> None:
  # RoomIO keeps the concrete rtc.Room used by the session. Publishing a
  # structured event avoids asking the model or UI to parse spoken text.
  room_io = context.session.room_io
  room = getattr(room_io, "_room", None)
  if room is None:
    return
  await room.local_participant.publish_data(
    json.dumps(payload, ensure_ascii=False), reliable=True, topic="alarm_challenge"
  )


@function_tool()
async def start_alarm_challenge(
  context: RunContext,
  alarm_id: str,
  kind: Literal["arithmetic", "text"],
  difficulty: Literal["easy", "medium"],
  prompt: str = "抓住这次FDE机会",
) -> str:
  """Start a deterministic wake-up challenge and show it to the user.

  Call only after the user explicitly consents. For text challenges, choose a
  concise user-facing prompt of at most 15 Unicode characters. If omitted, the
  default demo text is used; the answer is never returned to the model.
  """
  context.disallow_interruptions()
  if kind == "text" and not 1 <= len(prompt.strip()) <= 15:
    raise ValueError("Text challenge prompt must contain between 1 and 15 Unicode characters")
  async with aiohttp.ClientSession() as http:
    async with http.post(
      f"{_api_base_url()}/api/alarm-challenges",
      json={"alarm_id": alarm_id, "kind": kind, "difficulty": difficulty, "prompt": prompt, "round": 1,
            "idempotency_key": f"{alarm_id}:1"},
    ) as response:
      if response.status >= 500:
        raise RuntimeError("Challenge service is temporarily unavailable")
      if response.status >= 400:
        raise RuntimeError(f"Challenge service rejected the request ({response.status})")
      result = await response.json()
  await _publish_challenge_event(context, {"event": "alarm_challenge.created", "version": 1, **result})
  return json.dumps(result, ensure_ascii=False)


@function_tool()
async def get_alarm_challenge_result(context: RunContext, challenge_id: str) -> str:
  """Read the server-validated result of a submitted wake-up challenge."""
  async with aiohttp.ClientSession() as http:
    async with http.get(f"{_api_base_url()}/api/alarm-challenges/{challenge_id}") as response:
      if response.status >= 500:
        raise RuntimeError("Challenge service is temporarily unavailable")
      if response.status == 404:
        raise RuntimeError("Challenge was not found")
      result = await response.json()
  return json.dumps(result, ensure_ascii=False)


class ChronosAgent(Agent):
  def __init__(self, instructions: str) -> None:
    super().__init__(instructions=instructions, tools=[])


async def entrypoint(ctx: JobContext) -> None:
  await connect_to_livekit(ctx)
  language = os.getenv("OPENAI_AGENT_LANGUAGE", "English")
  realtime_raw = os.getenv("OPENAI_REALTIME_ENABLED")
  realtime_enabled = env_flag("OPENAI_REALTIME_ENABLED")
  logger.info(
    "OPENAI_REALTIME_ENABLED raw=%r parsed=%s",
    realtime_raw,
    realtime_enabled,
  )
  session_context = parse_session_metadata(ctx.job.metadata)
  selected_language = session_context.annotation.get("language") if session_context.annotation else None
  if selected_language in {"中文", "Chinese", "zh", "ZH"}:
    language = "Chinese"
  elif selected_language in {"EN", "English", "en", "EN-US"}:
    language = "English"
  logger.info(
    "session context loaded location=%s coach=%s alarm=%s",
    session_context.location,
    session_context.coach_name,
    session_context.alarm.alarm_id if session_context.alarm else "none",
  )
  instructions = build_agent_instructions(session_context, language)
  realtime_http_session: aiohttp.ClientSession | None = None

  # Realtime uses a WebSocket to api.openai.com. Keep it opt-in because some
  # networks can reach LiveKit but cannot establish that long-lived socket.
  if realtime_enabled:
    logger.info("using OpenAI Realtime model")
    realtime_options = {
      "model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime"),
      "voice": os.getenv("OPENAI_REALTIME_VOICE", "cedar"),
    }
    realtime_base_url = os.getenv("OPENAI_BASE_URL")
    if realtime_base_url:
      realtime_options["base_url"] = realtime_base_url
    logger.info(
      "creating RealtimeModel model=%s voice=%s base_url=%s",
      realtime_options["model"],
      realtime_options["voice"],
      realtime_base_url or "https://api.openai.com/v1",
    )
    openai_proxy = os.getenv("OPENAI_HTTP_PROXY") or None
    if openai_proxy:
      realtime_http_session = aiohttp.ClientSession(proxy=openai_proxy)
      realtime_options["http_session"] = realtime_http_session
      logger.info("OpenAI Realtime using dedicated HTTP proxy %s", openai_proxy)
    realtime_model = openai.realtime.RealtimeModel(**realtime_options)
    logger.info("RealtimeModel created successfully")
    session = AgentSession(llm=realtime_model)
    logger.info("OpenAI Realtime voice=%s", realtime_options["voice"])
  else:
    logger.info("using OpenAI HTTPS voice pipeline")
    base_url = os.getenv("OPENAI_BASE_URL") or None
    session = AgentSession(
      vad=silero.VAD.load(),
      stt=openai.STT(
        model=os.getenv("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe"),
        language=os.getenv("OPENAI_STT_LANGUAGE", "en"),
        base_url=base_url,
      ),
      llm=openai.LLM(
        model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
        base_url=base_url,
        temperature=0.5,
        max_completion_tokens=180,
      ),
      tts=openai.TTS(
        model=os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
        voice=os.getenv("OPENAI_TTS_VOICE", "alloy"),
        base_url=base_url,
      ),
    )
    logger.info(
      "OpenAI HTTPS models stt=%s llm=%s tts=%s base_url=%s",
      os.getenv("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe"),
      os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
      os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
      base_url or "https://api.openai.com/v1",
    )

  session_started = False
  agent = ChronosAgent(instructions=instructions)
  try:
    await session.start(
      room=ctx.room,
      agent=agent,
    )
    session_started = True

    async def close_session_on_shutdown(_: str = "") -> None:
      try:
        await session.aclose()
        logger.info("agent session closed; OpenAI Realtime resources released")
      except Exception:
        logger.exception("failed to close agent session cleanly")
      finally:
        if realtime_http_session is not None and not realtime_http_session.closed:
          await realtime_http_session.close()

    # The worker invokes shutdown callbacks when the client leaves or the room ends.
    # AgentSession.aclose() closes the Realtime WebSocket and all media resources.
    ctx.add_shutdown_callback(close_session_on_shutdown)

    logger.info("agent session started; generating greeting")
    greeting = build_greeting(session_context, language)
    greeting_succeeded = False
    for attempt in range(1, 4):
      try:
        await session.generate_reply(instructions=greeting)
        greeting_succeeded = True
        logger.info("initial greeting generated")
        break
      except Exception as error:
        if attempt == 3:
          logger.exception("initial greeting failed after retries: %s", error)
        else:
          logger.warning("initial greeting failed; retrying (%s/3): %s", attempt, error)
          await asyncio.sleep(attempt)
    if not greeting_succeeded:
      logger.error("initial greeting unavailable; Realtime connection did not become ready")

    # Consent gate: challenge tools stay out of the Realtime schema until the
    # third ordinary user turn has completed and an explicit yes is heard.
    conversation_rounds = 0
    consent_state = "normal"
    consent_words = {"是", "好", "可以", "开始", "yes", "ok", "start", "yeah", "同意"}

    def normalized_consent(transcript: str) -> bool:
      compact = "".join(transcript.lower().split()).strip("。！!，,？?")
      return compact in consent_words

    def on_user_input(event) -> None:
      nonlocal conversation_rounds, consent_state
      if not event.is_final or not event.transcript.strip():
        return
      if consent_state == "awaiting_consent":
        if normalized_consent(event.transcript):
          consent_state = "granted"
          asyncio.create_task(agent.update_tools([start_alarm_challenge, get_alarm_challenge_result]))
          asyncio.create_task(session.generate_reply(
            instructions="The user explicitly consented. Start a text challenge now by calling start_alarm_challenge with the current alarm id, kind text, difficulty easy, and a concise prompt of no more than 15 Unicode characters."
          ))
        else:
          consent_state = "consent_denied"
        return
      if consent_state != "normal":
        return
      conversation_rounds += 1
      if conversation_rounds >= 3:
        consent_state = "awaiting_consent"
        asyncio.create_task(session.generate_reply(
          instructions="Ask the user whether they explicitly consent to complete the wake-up text challenge. Ask only that one question and do not call tools yet."
        ))

    session.on("user_input_transcribed", on_user_input)
  except Exception:
    if session_started:
      await session.aclose()
    if realtime_http_session is not None and not realtime_http_session.closed:
      await realtime_http_session.close()
    raise


if __name__ == "__main__":
  cli.run_app(
    WorkerOptions(
      entrypoint_fnc=entrypoint,
      agent_name=os.getenv("LIVEKIT_AGENT_NAME", os.getenv("AGENT_NAME", "chronos-agent")),
    )
  )
