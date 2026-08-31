import os
import asyncio
import logging

import aiohttp

try:
  from dotenv import load_dotenv
except ModuleNotFoundError:
  load_dotenv = None

if load_dotenv:
  load_dotenv()

from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
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


class ChronosAgent(Agent):
  def __init__(self, instructions: str) -> None:
    super().__init__(instructions=instructions)


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
  try:
    await session.start(
      room=ctx.room,
      agent=ChronosAgent(instructions=instructions),
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
