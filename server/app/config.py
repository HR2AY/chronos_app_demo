import os
from dataclasses import dataclass
from pathlib import Path

try:
  from dotenv import load_dotenv
except ModuleNotFoundError:
  load_dotenv = None

BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_V3_DB_PATH = Path.home() / "Documents" / "黑客松demo" / "v3.0.01" / "SQLdatabase" / "database" / "chronos-v2.sqlite"

if load_dotenv:
  load_dotenv(BASE_DIR / ".env")


@dataclass(frozen=True)
class Settings:
  database_path: str = os.getenv(
    "CHRONOS_DB_PATH",
    os.getenv("CHRONOS_V2_DB_PATH", os.getenv("DATABASE_PATH", str(DEFAULT_V3_DB_PATH))),
  )
  livekit_url: str = os.getenv("LIVEKIT_URL", "")
  livekit_api_key: str = os.getenv("LIVEKIT_API_KEY", "")
  livekit_api_secret: str = os.getenv("LIVEKIT_API_SECRET", "")
  livekit_agent_name: str = os.getenv("LIVEKIT_AGENT_NAME", "chronos-agent")
  cors_origins: tuple[str, ...] = tuple(
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
  )


settings = Settings()
