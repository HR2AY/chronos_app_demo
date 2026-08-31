import calendar
import json
import re
from datetime import date, datetime, timedelta
from typing import Any

from .db import get_connection


DEFAULT_LIMIT = 100
MAX_LIMIT = 500


def create_event(payload: dict[str, Any]) -> dict[str, Any]:
  event = {
    "title": payload["title"],
    "description": payload.get("notes") or payload.get("description") or "",
    "date": payload["starts_at"][:10],
    "startTime": payload["starts_at"][11:16],
    "endTime": payload["ends_at"][11:16],
    "tag": payload.get("tag") or payload.get("location") or "个人",
    "completionScore": payload.get("completionScore"),
    "importance": payload.get("importance", 2),
    "links": [],
  }
  return upsert_calendar_event(event)


def list_events(filters: dict[str, Any] | None = None) -> dict[str, Any]:
  filters = filters or {}
  validation = validate_database()
  page = list_calendar_event_page(filters)
  return {
    "events": page["events"],
    "tags": list_tags(),
    "telemetry": list_telemetry_logs(),
    "activity": build_half_year_activity(),
    "dbPath": database_path(),
    "draftCount": 0,
    "page": {
      "total": page["total"],
      "persistedTotal": page["total"],
      "draftCount": 0,
      "count": page["count"],
      "offset": page["offset"],
      "limit": page["limit"],
      "hasMore": page["hasMore"],
      **({"nextOffset": page["nextOffset"]} if page.get("nextOffset") is not None else {}),
    },
    "errors": validation["errors"],
  }


def render_month(year: int, month: int) -> dict[str, Any]:
  month_start = date(year, month, 1)
  month_end = date(year, month, calendar.monthrange(year, month)[1])
  grid_start = month_start - timedelta(days=(month_start.weekday() + 1) % 7)
  grid_end = month_end + timedelta(days=(6 - ((month_end.weekday() + 1) % 7)))
  page = list_calendar_event_page(
    {
      "timestampFrom": f"{grid_start.isoformat()}T00:00",
      "timestampTo": f"{grid_end.isoformat()}T23:59",
      "limit": 10000,
      "offset": 0,
    }
  )
  events = group_month_events(page["events"])
  today = date.today()

  weeks: list[list[dict[str, Any]]] = []
  cursor = grid_start
  while cursor <= grid_end:
    week: list[dict[str, Any]] = []
    for _ in range(7):
      key = cursor.isoformat()
      week.append(
        {
          "date": key,
          "inMonth": cursor.month == month,
          "isToday": cursor == today,
          "events": events.get(key, []),
        }
      )
      cursor += timedelta(days=1)
    weeks.append(week)

  return {
    "year": year,
    "month": month,
    "monthLabel": month_start.strftime("%B %Y"),
    "weeks": weeks,
    "events": page["events"],
    "tags": list_tags(),
    "dbPath": database_path(),
    "errors": validate_database()["errors"],
  }


def upsert_calendar_event(event: dict[str, Any]) -> dict[str, Any]:
  normalized = normalize_event_input(event)
  event_id = normalized.get("id") if is_six_digit_id(normalized.get("id")) else next_event_id()
  topic_id = normalize_topic_id(normalized.get("topicId"), normalized.get("tag") or normalized["title"])
  item_type = "start" if normalized["endTime"] > normalized["startTime"] else "point"
  start_timestamp = f"{normalized['date']}T{normalized['startTime']}"
  end_timestamp = f"{normalized['date']}T{normalized['endTime']}"
  now = now_minute()

  with get_connection() as connection:
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("DELETE FROM timeline_items WHERE id = ?", (event_id,))
    connection.execute(
      """
      INSERT INTO timeline_items (
        id, item_type, topic_id, brief_title, timestamp_minute, context,
        system_link, completion_score, importance, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      """,
      (
        event_id,
        item_type,
        topic_id,
        normalized["title"],
        start_timestamp,
        normalized["description"][:50],
        json.dumps(normalized.get("links") or [], ensure_ascii=False),
        normalize_completion_score(normalized.get("completionScore")),
        normalize_importance(normalized.get("importance")),
        now,
      ),
    )
    if item_type == "start":
      connection.execute(
        """
        INSERT INTO timeline_items (id, item_type, timestamp_minute, updated_at)
        VALUES (?, 'end', ?, ?)
        """,
        (event_id, end_timestamp, now),
      )

  return get_calendar_event(event_id) or {**normalized, "id": event_id, "topicId": topic_id}


def delete_calendar_event(event_id: str) -> None:
  with get_connection() as connection:
    connection.execute("DELETE FROM timeline_items WHERE id = ?", (event_id,))


def list_calendar_event_page(filters: dict[str, Any]) -> dict[str, Any]:
  limit = clamp_int(filters.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT)
  offset = clamp_int(filters.get("offset"), 0, 0, 10_000_000)
  persisted = list_persisted_events(filters)
  total = len(persisted)
  events = persisted[offset:offset + limit]
  next_offset = offset + len(events)
  return {
    "total": total,
    "count": len(events),
    "offset": offset,
    "limit": limit,
    "events": events,
    "hasMore": next_offset < total,
    **({"nextOffset": next_offset} if next_offset < total else {}),
  }


def get_calendar_event(event_id: str) -> dict[str, Any] | None:
  events = list_persisted_events({"ids": [event_id], "limit": 1})
  return events[0] if events else None


def list_persisted_events(filters: dict[str, Any]) -> list[dict[str, Any]]:
  where = ["start_item.item_type IN ('start', 'point')"]
  values: list[Any] = []

  if filters.get("ids"):
    ids = list(filters["ids"])
    where.append(f"start_item.id IN ({','.join('?' for _ in ids)})")
    values.extend(ids)
  if filters.get("topics"):
    topics = list(filters["topics"])
    placeholders = ",".join("?" for _ in topics)
    where.append(f"(start_item.topic_id IN ({placeholders}) OR topics.name IN ({placeholders}))")
    values.extend(topics)
    values.extend(topics)
  if filters.get("timestampFrom"):
    where.append("start_item.timestamp_minute >= ?")
    values.append(filters["timestampFrom"])
  if filters.get("timestampTo"):
    where.append("start_item.timestamp_minute <= ?")
    values.append(filters["timestampTo"])
  if filters.get("query"):
    needle = f"%{str(filters['query']).lower()}%"
    where.append("(lower(start_item.brief_title) LIKE ? OR lower(start_item.context) LIKE ? OR lower(topics.name) LIKE ?)")
    values.extend([needle, needle, needle])
  if filters.get("importance"):
    importance = list(filters["importance"])
    where.append(f"start_item.importance IN ({','.join('?' for _ in importance)})")
    values.extend(importance)
  if filters.get("importanceMin") is not None:
    where.append("start_item.importance >= ?")
    values.append(filters["importanceMin"])
  if filters.get("importanceMax") is not None:
    where.append("start_item.importance <= ?")
    values.append(filters["importanceMax"])
  if filters.get("completionScores") and filters.get("completionScoreNull"):
    scores = list(filters["completionScores"])
    where.append(f"(start_item.completion_score IN ({','.join('?' for _ in scores)}) OR start_item.completion_score IS NULL)")
    values.extend(scores)
  elif filters.get("completionScores"):
    scores = list(filters["completionScores"])
    where.append(f"start_item.completion_score IN ({','.join('?' for _ in scores)})")
    values.extend(scores)
  elif filters.get("completionScoreNull"):
    where.append("start_item.completion_score IS NULL")
  if filters.get("completionScoreMin") is not None:
    where.append("start_item.completion_score >= ?")
    values.append(filters["completionScoreMin"])
  if filters.get("completionScoreMax") is not None:
    where.append("start_item.completion_score <= ?")
    values.append(filters["completionScoreMax"])

  with get_connection() as connection:
    rows = connection.execute(
      f"""
      SELECT
        start_item.id,
        start_item.item_type,
        start_item.topic_id,
        topics.name AS topic_name,
        start_item.brief_title,
        start_item.timestamp_minute,
        end_item.timestamp_minute AS end_timestamp_minute,
        start_item.context,
        start_item.system_link,
        start_item.completion_score,
        start_item.importance
      FROM timeline_items AS start_item
      LEFT JOIN timeline_items AS end_item
        ON end_item.id = start_item.id
        AND end_item.item_type = 'end'
      LEFT JOIN topics
        ON topics.id = start_item.topic_id
      WHERE {" AND ".join(where)}
      ORDER BY start_item.timestamp_minute ASC, start_item.id ASC
      """,
      values,
    ).fetchall()

  return [row_to_calendar_event(dict(row)) for row in rows]


def row_to_calendar_event(row: dict[str, Any]) -> dict[str, Any]:
  timestamp = str(row["timestamp_minute"])
  end_timestamp = str(row["end_timestamp_minute"] or row["timestamp_minute"])
  links = parse_links(str(row.get("system_link") or ""))
  return {
    "id": str(row["id"]),
    "topicId": str(row["topic_id"]) if row.get("topic_id") else None,
    "title": str(row["brief_title"]),
    "description": str(row.get("context") or ""),
    "date": timestamp[:10],
    "startTime": timestamp[11:16],
    "endTime": end_timestamp[11:16],
    "tag": str(row["topic_name"] or row["topic_id"] or ""),
    "completionScore": normalize_completion_score(row.get("completion_score")),
    "importance": normalize_importance(row.get("importance")),
    "links": links,
    "starts_at": f"{timestamp}:00",
    "ends_at": f"{end_timestamp}:00",
    "notes": str(row.get("context") or ""),
    "location": str(row["topic_name"] or ""),
    "color": color_for_topic(str(row["topic_id"] or "")),
  }


def list_tags() -> list[dict[str, Any]]:
  with get_connection() as connection:
    rows = connection.execute(
      """
      SELECT
        topics.id,
        topics.name,
        topics.updated_at,
        COUNT(start_item.id) AS event_count
      FROM topics
      LEFT JOIN timeline_items AS start_item
        ON start_item.topic_id = topics.id
        AND start_item.item_type IN ('start', 'point')
      GROUP BY topics.id, topics.name, topics.updated_at
      ORDER BY topics.id ASC
      """
    ).fetchall()
  return [
    {
      "id": str(row["id"]),
      "name": str(row["name"]),
      "updated_at": str(row["updated_at"]),
      "event_count": int(row["event_count"] or 0),
    }
    for row in rows
  ]


def list_telemetry_logs() -> list[dict[str, Any]]:
  with get_connection() as connection:
    rows = connection.execute(
      """
      SELECT id, timestamp, type, message
      FROM telemetry_logs
      ORDER BY created_at DESC, id DESC
      """
    ).fetchall()
  return [dict(row) for row in rows]


def validate_database() -> dict[str, Any]:
  with get_connection() as connection:
    rows = connection.execute(
      """
      SELECT id, item_type, timestamp_minute
      FROM timeline_items
      ORDER BY id ASC, item_type ASC
      """
    ).fetchall()

  grouped: dict[str, dict[str, str]] = {}
  for row in rows:
    grouped.setdefault(str(row["id"]), {})[str(row["item_type"])] = str(row["timestamp_minute"])

  errors: list[dict[str, Any]] = []
  for event_id, group in grouped.items():
    has_point = "point" in group
    has_start = "start" in group
    has_end = "end" in group
    if has_point and (has_start or has_end):
      errors.append({"code": "MIXED_POINT_AND_RANGE", "message": f"事件 {event_id} 不能同时是 point 和 start/end", "id": event_id})
    elif has_point:
      continue
    elif not has_start:
      errors.append({"code": "MISSING_START", "message": f"时间段事件 {event_id} 缺少 start 数据", "id": event_id})
    elif not has_end:
      errors.append({"code": "MISSING_END", "message": f"时间段事件 {event_id} 缺少 end 数据", "id": event_id})
    elif group["start"] >= group["end"]:
      errors.append(
        {
          "code": "INVALID_TIME_RANGE",
          "message": f"时间段事件 {event_id} 的 start 时间不能晚于或等于 end 时间",
          "id": event_id,
          "start": group["start"],
          "end": group["end"],
        }
      )
  return {"ok": len(errors) == 0, "errors": errors}


def build_half_year_activity(base_date: date | None = None) -> dict[int, list[dict[str, Any]]]:
  base_date = base_date or date.today()
  start_month = 1 if base_date.month <= 6 else 7
  year = base_date.year
  first_day = date(year, start_month, 1)
  last_month = start_month + 5
  last_day = date(year, last_month, calendar.monthrange(year, last_month)[1])
  page = list_calendar_event_page(
    {
      "timestampFrom": f"{first_day.isoformat()}T00:00",
      "timestampTo": f"{last_day.isoformat()}T23:59",
      "limit": 10000,
      "offset": 0,
    }
  )
  by_date: dict[str, dict[str, int]] = {}
  for event in page["events"]:
    current = by_date.setdefault(event["date"], {"count": 0, "perfect": 0})
    current["count"] += 1
    if event.get("completionScore") == 5:
      current["perfect"] += 1

  result: dict[int, list[dict[str, Any]]] = {}
  for index in range(6):
    month = start_month + index
    days = calendar.monthrange(year, month)[1]
    result[index] = []
    for day_number in range(1, days + 1):
      key = f"{year}-{month:02d}-{day_number:02d}"
      counts = by_date.get(key, {"count": 0, "perfect": 0})
      result[index].append(
        {
          "date": key,
          "dataPoints": counts["count"],
          "targetPercent": round((counts["perfect"] / counts["count"]) * 100) if counts["count"] else 0,
        }
      )
  return result


def parse_events_query(params: dict[str, Any]) -> dict[str, Any]:
  date_value = params.get("date")
  from_value = params.get("from") or params.get("timestampFrom")
  to_value = params.get("to") or params.get("timestampTo")
  completion_score = parse_score_list(params.get("completedScore") or params.get("completedscore"))
  importance = parse_score_list(params.get("importance"))
  filters = {
    "ids": parse_csv(params.get("ids") or params.get("id")),
    "topics": parse_csv(params.get("topics") or params.get("tags") or params.get("tag")),
    "timestampFrom": f"{date_value}T00:00" if date_value else normalize_minute_param(from_value, "start"),
    "timestampTo": f"{date_value}T23:59" if date_value else normalize_minute_param(to_value, "end"),
    "query": params.get("q") or params.get("query"),
    "importance": importance["scores"],
    "importanceMin": parse_score_bound(params.get("importanceMin") or params.get("minImportance")),
    "importanceMax": parse_score_bound(params.get("importanceMax") or params.get("maxImportance")),
    "completionScores": completion_score["scores"],
    "completionScoreNull": completion_score["includeNull"],
    "completionScoreMin": parse_score_bound(
      params.get("completedScoreMin") or params.get("completedscoreMin") or params.get("minCompletedScore") or params.get("minCompletedscore")
    ),
    "completionScoreMax": parse_score_bound(
      params.get("completedScoreMax") or params.get("completedscoreMax") or params.get("maxCompletedScore") or params.get("maxCompletedscore")
    ),
    "limit": clamp_int(params.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT),
    "offset": clamp_int(params.get("offset"), 0, 0, 10_000_000),
  }
  return {key: value for key, value in filters.items() if value not in (None, [], "")}


def normalize_event_input(event: dict[str, Any]) -> dict[str, Any]:
  start = event.get("start")
  end = event.get("end")
  date_value = event.get("date") or str(start)[:10]
  start_time = event.get("startTime") or str(start)[11:16]
  end_time = event.get("endTime") or str(end)[11:16] or start_time
  if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(date_value)):
    raise ValueError("date must use YYYY-MM-DD")
  if not re.match(r"^\d{2}:\d{2}$", str(start_time)) or not re.match(r"^\d{2}:\d{2}$", str(end_time)):
    raise ValueError("startTime and endTime must use HH:MM")
  return {
    **event,
    "title": str(event.get("title", "")).strip()[:80],
    "description": str(event.get("description") or event.get("notes") or "")[:50],
    "date": str(date_value),
    "startTime": str(start_time),
    "endTime": str(end_time),
  }


def normalize_topic_id(topic_id: str | None, name: str) -> str:
  with get_connection() as connection:
    if topic_id and re.match(r"^\d{4}$", topic_id):
      connection.execute("INSERT INTO topics (id, name) VALUES (?, ?) ON CONFLICT(id) DO NOTHING", (topic_id, name or topic_id))
      return topic_id
    existing = connection.execute("SELECT id FROM topics WHERE name = ?", (name,)).fetchone()
    if existing:
      return str(existing["id"])
    next_id = next_topic_id(connection)
    connection.execute("INSERT INTO topics (id, name) VALUES (?, ?)", (next_id, name or next_id))
    return next_id


def next_topic_id(connection: Any) -> str:
  used = {str(row["id"]) for row in connection.execute("SELECT id FROM topics").fetchall()}
  for value in range(10_000):
    candidate = f"{value:04d}"
    if candidate not in used:
      return candidate
  raise ValueError("No four-digit topic IDs remain")


def next_event_id() -> str:
  with get_connection() as connection:
    used = {str(row["id"]) for row in connection.execute("SELECT id FROM timeline_items").fetchall()}
  for value in range(1_000_000):
    candidate = f"{value:06d}"
    if candidate not in used:
      return candidate
  raise ValueError("No six-digit event IDs remain")


def parse_links(value: str) -> list[dict[str, str]]:
  if not value.strip():
    return []
  try:
    parsed = json.loads(value)
  except json.JSONDecodeError:
    return []
  if not isinstance(parsed, list):
    return []
  links = []
  for item in parsed:
    if isinstance(item, dict) and item.get("url"):
      url = str(item["url"])
      links.append(
        {
          "id": str(item.get("id") or url),
          "title": str(item.get("title") or url.split("/")[-1] or url),
          "url": url,
        }
      )
  return links


def group_month_events(events: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
  grouped: dict[str, list[dict[str, Any]]] = {}
  for event in events:
    grouped.setdefault(event["date"], []).append(event)
  return grouped


def database_path() -> str:
  with get_connection() as connection:
    row = connection.execute("PRAGMA database_list").fetchone()
    return str(row["file"]) if row and row["file"] else ""


def is_six_digit_id(value: Any) -> bool:
  return isinstance(value, str) and re.match(r"^\d{6}$", value) is not None


def parse_csv(value: Any) -> list[str] | None:
  if not value:
    return None
  values = [item.strip() for item in str(value).split(",") if item.strip()]
  return values or None


def parse_score_list(value: Any) -> dict[str, Any]:
  if not value:
    return {"scores": None, "includeNull": False}
  scores: set[int] = set()
  include_null = False
  for item in str(value).split(","):
    token = item.strip().lower()
    if token in ("null", "unscored"):
      include_null = True
      continue
    try:
      score = int(token)
    except ValueError:
      continue
    if 1 <= score <= 5:
      scores.add(score)
  return {"scores": sorted(scores) or None, "includeNull": include_null}


def parse_score_bound(value: Any) -> int | None:
  try:
    parsed = int(str(value))
  except (TypeError, ValueError):
    return None
  return parsed if 1 <= parsed <= 5 else None


def normalize_minute_param(value: Any, boundary: str) -> str | None:
  if not value:
    return None
  text = str(value)
  if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$", text):
    return text
  if re.match(r"^\d{4}-\d{2}-\d{2}$", text):
    return f"{text}T00:00" if boundary == "start" else f"{text}T23:59"
  return None


def normalize_completion_score(value: Any) -> int | None:
  if value is None:
    return None
  try:
    parsed = round(float(value))
  except (TypeError, ValueError):
    return None
  return min(5, max(1, parsed))


def normalize_importance(value: Any) -> int:
  try:
    parsed = int(value)
  except (TypeError, ValueError):
    return 2
  return parsed if 1 <= parsed <= 5 else 2


def clamp_int(value: Any, fallback: int, minimum: int, maximum: int) -> int:
  try:
    parsed = int(value)
  except (TypeError, ValueError):
    return fallback
  return min(maximum, max(minimum, parsed))


def now_minute() -> str:
  return datetime.now().strftime("%Y-%m-%dT%H:%M")


def color_for_topic(topic_id: str) -> str:
  palette = ["#2563eb", "#0f766e", "#9333ea", "#d4a017", "#dc2626", "#0891b2", "#16a34a", "#ea580c"]
  if not topic_id.isdigit():
    return palette[0]
  return palette[int(topic_id) % len(palette)]
