from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from app.alarm_service import create_alarm, delete_alarm, list_alarms, update_alarm
from app.calendar_service import list_events, parse_events_query, render_month
from app.db import init_db


class Handler(BaseHTTPRequestHandler):
  def do_GET(self) -> None:
    parsed = urlparse(self.path)
    query = parse_qs(parsed.query)

    if parsed.path == "/health":
      self.send_json({"status": "ok"})
      return

    if parsed.path == "/calendar/month":
      try:
        year = int(query.get("year", ["2026"])[0])
        month = int(query.get("month", ["7"])[0])
        if not 1 <= month <= 12:
          raise ValueError("month must be between 1 and 12")
      except ValueError as error:
        self.send_json({"detail": str(error)}, status=422)
        return

      self.send_json(render_month(year, month))
      return

    if parsed.path == "/api/events":
      params = {key: values[0] for key, values in query.items()}
      self.send_json(list_events(parse_events_query(params)))
      return

    if parsed.path == "/api/alarms":
      self.send_json({"alarms": list_alarms()})
      return

    self.send_json({"detail": "not found"}, status=404)

  def do_POST(self) -> None:
    parsed = urlparse(self.path)
    if parsed.path != "/api/alarms":
      self.send_json({"detail": "not found"}, status=404)
      return
    try:
      alarm = create_alarm(self.read_json())
    except (ValueError, json.JSONDecodeError) as error:
      self.send_json({"detail": str(error)}, status=422)
      return
    self.send_json({"alarm": alarm}, status=201)

  def do_PUT(self) -> None:
    parsed = urlparse(self.path)
    prefix = "/api/alarms/"
    if not parsed.path.startswith(prefix):
      self.send_json({"detail": "not found"}, status=404)
      return
    try:
      alarm = update_alarm(parsed.path[len(prefix):], self.read_json())
    except (ValueError, json.JSONDecodeError) as error:
      self.send_json({"detail": str(error)}, status=422)
      return
    if alarm is None:
      self.send_json({"detail": "alarm not found"}, status=404)
      return
    self.send_json({"alarm": alarm})

  def do_DELETE(self) -> None:
    parsed = urlparse(self.path)
    prefix = "/api/alarms/"
    if not parsed.path.startswith(prefix):
      self.send_json({"detail": "not found"}, status=404)
      return
    alarm_id = parsed.path[len(prefix):]
    if not alarm_id or not delete_alarm(alarm_id):
      self.send_json({"detail": "alarm not found"}, status=404)
      return
    self.send_response(204)
    self.send_header("Access-Control-Allow-Origin", "*")
    self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    self.send_header("Access-Control-Allow-Headers", "Content-Type")
    self.end_headers()

  def do_OPTIONS(self) -> None:
    self.send_response(204)
    self.send_header("Access-Control-Allow-Origin", "*")
    self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    self.send_header("Access-Control-Allow-Headers", "Content-Type")
    self.end_headers()

  def read_json(self) -> dict:
    length = int(self.headers.get("Content-Length", "0"))
    return json.loads(self.rfile.read(length).decode("utf-8"))

  def send_json(self, payload: dict, status: int = 200) -> None:
    body = json.dumps(payload).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Access-Control-Allow-Origin", "*")
    self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    self.send_header("Access-Control-Allow-Headers", "Content-Type")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)


def main() -> None:
  init_db()
  server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
  print("Chronos dev server listening on http://127.0.0.1:8000")
  print("Try http://127.0.0.1:8000/calendar/month?year=2026&month=7")
  server.serve_forever()


if __name__ == "__main__":
  main()
