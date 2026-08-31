-- Demo-only SQLite seed. Contains no user or secret data.

CREATE TABLE IF NOT EXISTS alarms (
  id TEXT PRIMARY KEY,
  activation_time TEXT NOT NULL,
  title TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M', 'now', 'localtime'))
);

INSERT INTO alarms (id, activation_time, title, context, goal) VALUES
  ('alarm-0001', '0630', 'Morning Routine', '', ''),
  ('alarm-0002', '0700', 'Commute Warning', '', ''),
  ('alarm-0003', '1215', 'Lunch Sync', '', ''),
  ('alarm-0004', '1700', 'Wrap Up', '', '')
ON CONFLICT(id) DO NOTHING;
