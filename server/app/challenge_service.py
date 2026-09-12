from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import uuid4

from .db import get_connection

DEFAULT_PROMPT = "抓住这次FDE机会"


def start_challenge(
  *,
  alarm_id: str,
  kind: Literal["arithmetic", "text"] = "text",
  difficulty: Literal["easy", "medium"] = "easy",
  prompt: str | None = None,
  round_number: int = 1,
  idempotency_key: str | None = None,
) -> dict[str, Any]:
  key = idempotency_key or f"{alarm_id}:{round_number}"
  now = datetime.now(timezone.utc)
  expires = now + timedelta(seconds=120)
  if kind == "text":
    prompt = (prompt or DEFAULT_PROMPT).strip()
    if not prompt or len(prompt) > 15:
      raise ValueError("text challenge prompt must contain between 1 and 15 characters")
  else:
    prompt = "7 + 5 = ?"
  expected_value = prompt if kind == "text" else "12"
  expected_hash = hashlib.sha256(expected_value.encode("utf-8")).hexdigest()
  with get_connection() as connection:
    existing = connection.execute(
      "SELECT * FROM alarm_challenges WHERE idempotency_key = ?", (key,)
    ).fetchone()
    if existing:
      return _public(dict(existing))
    challenge_id = f"challenge-{uuid4().hex[:16]}"
    connection.execute(
      """
      INSERT INTO alarm_challenges
        (id, alarm_id, kind, prompt, expected_hash, status, attempts_used,
         max_attempts, expires_at, round_number, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'presented', 0, 3, ?, ?, ?)
      """,
      (challenge_id, alarm_id, kind, prompt, expected_hash, expires.isoformat(), round_number, key),
    )
    row = connection.execute("SELECT * FROM alarm_challenges WHERE id = ?", (challenge_id,)).fetchone()
  return _public(dict(row))


def get_challenge(challenge_id: str) -> dict[str, Any] | None:
  with get_connection() as connection:
    row = connection.execute("SELECT * FROM alarm_challenges WHERE id = ?", (challenge_id,)).fetchone()
  return _public(dict(row)) if row else None


def submit_challenge(challenge_id: str, value: str) -> dict[str, Any] | None:
  with get_connection() as connection:
    row = connection.execute("SELECT * FROM alarm_challenges WHERE id = ?", (challenge_id,)).fetchone()
    if not row:
      return None
    current = dict(row)
    if current["status"] in {"passed", "expired", "cancelled"}:
      return _public(current)
    if datetime.fromisoformat(current["expires_at"]) <= datetime.now(timezone.utc):
      connection.execute("UPDATE alarm_challenges SET status = 'expired' WHERE id = ?", (challenge_id,))
      current["status"] = "expired"
      return _public(current)
    attempts = int(current["attempts_used"]) + 1
    valid = hashlib.sha256(value.strip().encode("utf-8")).hexdigest() == current["expected_hash"]
    status = "passed" if valid else ("failed" if attempts >= int(current["max_attempts"]) else "presented")
    connection.execute(
      "UPDATE alarm_challenges SET attempts_used = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      (attempts, status, challenge_id),
    )
    current.update({"attempts_used": attempts, "status": status})
  return _public(current)


def _public(row: dict[str, Any]) -> dict[str, Any]:
  attempts_remaining = max(0, int(row["max_attempts"]) - int(row["attempts_used"]))
  return {
    "ok": True,
    "challenge_id": row["id"],
    "alarm_id": row["alarm_id"],
    "kind": row["kind"],
    "prompt": row["prompt"],
    "input_mode": "text" if row["kind"] == "text" else "numeric",
    "status": row["status"],
    "expires_at": row["expires_at"],
    "attempts_remaining": attempts_remaining,
  }
