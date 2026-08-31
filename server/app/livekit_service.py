import json
from typing import Any

from livekit import api

from .config import settings


def create_participant_token(
  room_name: str,
  participant_name: str,
  participant_identity: str,
  session_context: dict[str, Any] | None = None,
) -> dict[str, str]:
  missing = [
    key
    for key, value in {
      "LIVEKIT_URL": settings.livekit_url,
      "LIVEKIT_API_KEY": settings.livekit_api_key,
      "LIVEKIT_API_SECRET": settings.livekit_api_secret,
    }.items()
    if not value
  ]
  if missing:
    raise RuntimeError(f"Missing LiveKit environment values: {', '.join(missing)}")

  token = (
    api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
    .with_identity(participant_identity)
    .with_name(participant_name)
    .with_grants(
      api.VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
      )
    )
    .with_room_config(
      api.RoomConfiguration(
        agents=[
          api.RoomAgentDispatch(
            agent_name=settings.livekit_agent_name,
            metadata=json.dumps(session_context or {}, ensure_ascii=False),
          )
        ]
      )
    )
    .to_jwt()
  )

  return {
    "server_url": settings.livekit_url,
    "participant_token": token,
  }
