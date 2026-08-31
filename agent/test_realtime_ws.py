"""Minimal OpenAI Realtime WebSocket connectivity check.

Run with the agent virtual environment from this directory. The script never
prints credentials or event payloads; it reports only connection status and
the type of the first server event.
"""

import asyncio
import os
import sys

import aiohttp

try:
  from dotenv import load_dotenv
except ModuleNotFoundError:
  load_dotenv = None

if load_dotenv:
  load_dotenv()


async def main() -> int:
  api_key = os.getenv("OPENAI_API_KEY")
  if not api_key:
    print("RESULT missing OPENAI_API_KEY")
    return 2

  model = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime")
  base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
  url = f"{base_url}/realtime?model={model}"
  headers = {
    "Authorization": f"Bearer {api_key}",
    "User-Agent": "chronos-realtime-diagnostic",
  }
  proxy = os.getenv("OPENAI_HTTP_PROXY") or None

  timeout = aiohttp.ClientTimeout(total=20, connect=12)
  try:
    async with aiohttp.ClientSession(timeout=timeout) as client:
      async with client.ws_connect(url, headers=headers, heartbeat=10, proxy=proxy) as ws:
        print(f"RESULT connected model={model} proxy={'enabled' if proxy else 'disabled'}")
        try:
          message = await asyncio.wait_for(ws.receive(), timeout=8)
        except asyncio.TimeoutError:
          print("RESULT connected but no server event within 8s")
          return 0
        if message.type == aiohttp.WSMsgType.TEXT:
          try:
            event = message.json()
            event_type = event.get("type", "unknown")
          except Exception:
            event = {}
            event_type = "non-json-text"
          if event_type == "error":
            details = event.get("error") or {}
            print(
              "RESULT first_event=error "
              f"error_type={details.get('type', 'unknown')} "
              f"code={details.get('code', 'unknown')} "
              f"message={details.get('message', 'unknown')}"
            )
          else:
            print(f"RESULT first_event={event_type}")
        else:
          print(f"RESULT first_message={message.type.name}")
        return 0
  except Exception as error:
    print(f"RESULT failed error_type={type(error).__name__} message={error}")
    return 1


if __name__ == "__main__":
  sys.exit(asyncio.run(main()))
