import sqlite3
from pathlib import Path

from .config import settings


DEFAULT_TOPICS = (
  ("0001", "开发"),
  ("0002", "冲刺"),
  ("0003", "运维"),
  ("0004", "个人"),
  ("0005", "健康"),
)

DEFAULT_ALARMS = (
  ("alarm-0001", "0630", "Morning Routine", "", ""),
  ("alarm-0002", "0700", "Commute Warning", "", ""),
  ("alarm-0003", "1215", "Lunch Sync", "", ""),
  ("alarm-0004", "1700", "Wrap Up", "", ""),
)


def get_connection() -> sqlite3.Connection:
  path = Path(settings.database_path)
  if path.parent != Path("."):
    path.parent.mkdir(parents=True, exist_ok=True)
  connection = sqlite3.connect(path)
  connection.row_factory = sqlite3.Row
  connection.execute("PRAGMA foreign_keys = ON")
  return connection


def init_db() -> None:
  with get_connection() as connection:
    connection.executescript(
      """
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY
          CHECK (id GLOB '[0-9][0-9][0-9][0-9]'),
        name TEXT NOT NULL UNIQUE
          CHECK (length(trim(name)) BETWEEN 1 AND 64),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M', 'now', 'localtime'))
          CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]')
      );

      CREATE TABLE IF NOT EXISTS timeline_items (
        id TEXT NOT NULL
          CHECK (id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
        item_type TEXT NOT NULL
          CHECK (item_type IN ('start', 'end', 'point')),
        topic_id TEXT
          CHECK (topic_id IS NULL OR topic_id GLOB '[0-9][0-9][0-9][0-9]')
          REFERENCES topics(id)
          ON UPDATE CASCADE
          ON DELETE RESTRICT,
        brief_title TEXT,
        timestamp_minute TEXT NOT NULL
          CHECK (timestamp_minute GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]'),
        context TEXT,
        system_link TEXT,
        completion_score INTEGER
          CHECK (
            completion_score IS NULL OR
            (typeof(completion_score) = 'integer' AND completion_score BETWEEN 1 AND 5)
          ),
        importance INTEGER NOT NULL DEFAULT 2
          CHECK (typeof(importance) = 'integer' AND importance BETWEEN 1 AND 5),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M', 'now', 'localtime'))
          CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]'),
        PRIMARY KEY (id, item_type),
        CHECK (
          (
            item_type = 'end' AND
            topic_id IS NULL AND
            brief_title IS NULL AND
            context IS NULL AND
            system_link IS NULL AND
            completion_score IS NULL
          ) OR (
            item_type IN ('start', 'point') AND
            topic_id IS NOT NULL AND
            brief_title IS NOT NULL AND
            length(trim(brief_title)) BETWEEN 1 AND 80 AND
            context IS NOT NULL AND
            length(context) <= 50 AND
            system_link IS NOT NULL AND
            length(system_link) <= 2048
          )
        )
      );

      CREATE INDEX IF NOT EXISTS idx_timeline_items_topic_time
        ON timeline_items(topic_id, timestamp_minute);

      CREATE INDEX IF NOT EXISTS idx_timeline_items_type_time
        ON timeline_items(item_type, timestamp_minute);

      CREATE TABLE IF NOT EXISTS telemetry_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL
          CHECK (type IN ('git', 'system', 'cron', 'focus')),
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M', 'now', 'localtime'))
          CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]')
      );

      CREATE INDEX IF NOT EXISTS idx_telemetry_logs_created_at
        ON telemetry_logs(created_at);

      CREATE TABLE IF NOT EXISTS alarms (
        id TEXT PRIMARY KEY,
        activation_time TEXT NOT NULL
          CHECK (
            length(activation_time) = 4 AND
            activation_time NOT GLOB '*[^0-9]*' AND
            CAST(substr(activation_time, 1, 2) AS INTEGER) BETWEEN 0 AND 23 AND
            CAST(substr(activation_time, 3, 2) AS INTEGER) BETWEEN 0 AND 59
          ),
        title TEXT NOT NULL
          CHECK (length(trim(title)) BETWEEN 1 AND 120),
        context TEXT NOT NULL DEFAULT '',
        goal TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M', 'now', 'localtime'))
      );

      CREATE INDEX IF NOT EXISTS idx_alarms_activation_time
        ON alarms(activation_time, id);

      CREATE TRIGGER IF NOT EXISTS trg_timeline_items_block_point_mixed_insert
      BEFORE INSERT ON timeline_items
      FOR EACH ROW
      WHEN NEW.item_type = 'point' AND EXISTS (
        SELECT 1 FROM timeline_items
        WHERE id = NEW.id AND item_type IN ('start', 'end')
      )
      BEGIN
        SELECT RAISE(ABORT, 'point cannot share id with start/end');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_timeline_items_block_range_mixed_insert
      BEFORE INSERT ON timeline_items
      FOR EACH ROW
      WHEN NEW.item_type IN ('start', 'end') AND EXISTS (
        SELECT 1 FROM timeline_items
        WHERE id = NEW.id AND item_type = 'point'
      )
      BEGIN
        SELECT RAISE(ABORT, 'start/end cannot share id with point');
      END;

      PRAGMA user_version = 6;
      """
    )
    for topic in DEFAULT_TOPICS:
      connection.execute("INSERT INTO topics (id, name) VALUES (?, ?) ON CONFLICT(id) DO NOTHING", topic)
    for alarm in DEFAULT_ALARMS:
      connection.execute(
        """
        INSERT INTO alarms (id, activation_time, title, context, goal)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
        """,
        alarm,
      )
