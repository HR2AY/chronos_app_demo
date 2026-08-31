from __future__ import annotations

from typing import Any
from uuid import uuid4

from .db import get_connection


def list_alarms() -> list[dict[str, str]]:
  with get_connection() as connection:
    rows = connection.execute(
      """
      SELECT id, activation_time, title, context, goal
      FROM alarms
      ORDER BY activation_time ASC, id ASC
      """
    ).fetchall()
  return [_row_to_alarm(dict(row)) for row in rows]


def get_alarm(alarm_id: str) -> dict[str, str] | None:
  with get_connection() as connection:
    row = connection.execute(
      """
      SELECT id, activation_time, title, context, goal
      FROM alarms
      WHERE id = ?
      """,
      (alarm_id,),
    ).fetchone()
  return _row_to_alarm(dict(row)) if row else None


def create_alarm(payload: dict[str, Any]) -> dict[str, str]:
  alarm_id = f"alarm-{uuid4().hex[:12]}"
  alarm = _normalize_alarm(payload, alarm_id)
  with get_connection() as connection:
    connection.execute(
      """
      INSERT INTO alarms (id, activation_time, title, context, goal)
      VALUES (?, ?, ?, ?, ?)
      """,
      (
        alarm["id"],
        alarm["activationTime"],
        alarm["title"],
        alarm["context"],
        alarm["goal"],
      ),
    )
  return alarm


def update_alarm(alarm_id: str, payload: dict[str, Any]) -> dict[str, str] | None:
  alarm = _normalize_alarm(payload, alarm_id)
  with get_connection() as connection:
    cursor = connection.execute(
      """
      UPDATE alarms
      SET activation_time = ?, title = ?, context = ?, goal = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M', 'now', 'localtime')
      WHERE id = ?
      """,
      (
        alarm["activationTime"],
        alarm["title"],
        alarm["context"],
        alarm["goal"],
        alarm_id,
      ),
    )
    if cursor.rowcount == 0:
      return None
  return alarm


def delete_alarm(alarm_id: str) -> bool:
  with get_connection() as connection:
    cursor = connection.execute("DELETE FROM alarms WHERE id = ?", (alarm_id,))
    return cursor.rowcount > 0


def _normalize_alarm(payload: dict[str, Any], alarm_id: str) -> dict[str, str]:
  activation_time = str(payload.get("activationTime") or "").strip()
  title = str(payload.get("title") or "").strip()
  context = str(payload.get("context") or "")
  goal = str(payload.get("goal") or "")

  if not _is_hhmm(activation_time):
    raise ValueError("activationTime must use four-digit hhmm format")
  if not 1 <= len(title) <= 120:
    raise ValueError("title must contain between 1 and 120 characters")
  if len(context) > 4000:
    raise ValueError("context must not exceed 4000 characters")
  if len(goal) > 4000:
    raise ValueError("goal must not exceed 4000 characters")

  return {
    "id": alarm_id,
    "activationTime": activation_time,
    "title": title,
    "context": context,
    "goal": goal,
  }


def _is_hhmm(value: str) -> bool:
  if len(value) != 4 or not value.isascii() or not value.isdigit():
    return False
  return 0 <= int(value[:2]) <= 23 and 0 <= int(value[2:]) <= 59


def _row_to_alarm(row: dict[str, Any]) -> dict[str, str]:
  return {
    "id": str(row["id"]),
    "activationTime": str(row["activation_time"]),
    "title": str(row["title"]),
    "context": str(row["context"] or ""),
    "goal": str(row["goal"] or ""),
  }
