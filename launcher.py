"""Chronos local development launcher.

Run with ``python launcher.py`` or double-click ``start_launcher.bat``.
The launcher intentionally uses only Python's standard library so it can be
used before the project's optional dependencies are installed.
"""

from __future__ import annotations

import os
import queue
import socket
import subprocess
import threading
import urllib.request
import webbrowser
from dataclasses import dataclass
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, ttk


ROOT = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Service:
    key: str
    name: str
    detail: str
    port: int
    cwd: Path
    command: tuple[str, ...]
    url: str | None = None


def python_executable(folder: Path) -> str:
    candidate = folder / ".venv" / "Scripts" / "python.exe"
    return str(candidate) if candidate.exists() else "python"


SERVICES = (
    Service(
        "web",
        "日历 Web",
        "Expo Web · 8082",
        8082,
        ROOT / "mobile",
        ("cmd", "/c", "npx expo start --web --port 8082"),
        "http://127.0.0.1:8082/",
    ),
    Service(
        "api",
        "Chronos API",
        "FastAPI / Uvicorn · 8000",
        8000,
        ROOT / "server",
        (python_executable(ROOT / "server"), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"),
        "http://127.0.0.1:8000/health",
    ),
    Service(
        "agent",
        "Realtime Agent",
        "LiveKit Worker · 8081",
        8081,
        ROOT / "agent",
        (python_executable(ROOT / "agent"), "main.py", "start"),
        None,
    ),
)


class LauncherApp(tk.Tk):
    BG = "#f5f7fb"
    CARD = "#ffffff"
    TEXT = "#172033"
    MUTED = "#667085"
    BLUE = "#315efb"
    GREEN = "#1a9b67"
    RED = "#d64545"
    AMBER = "#bb7b12"

    def __init__(self) -> None:
        super().__init__()
        self.title("Chronos 启动器")
        self.geometry("920x680")
        self.minsize(760, 560)
        self.configure(bg=self.BG)
        self.processes: dict[str, subprocess.Popen[str]] = {}
        self.status_vars: dict[str, tk.StringVar] = {}
        self.status_labels: dict[str, tk.Label] = {}
        self.log_queue: queue.Queue[tuple[str, str]] = queue.Queue()
        self._build_style()
        self._build_ui()
        self.after(250, self._drain_logs)
        self.after(900, self._refresh_status)
        self.protocol("WM_DELETE_WINDOW", self._close)

    def _build_style(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TButton", font=("Segoe UI", 10), padding=(12, 7))
        style.configure("Primary.TButton", foreground="white", background=self.BLUE)
        style.map("Primary.TButton", background=[("active", "#2448cb")])
        style.configure("TScrollbar", troughcolor="#edf0f6", background="#c5ccdc")

    def _build_ui(self) -> None:
        header = tk.Frame(self, bg=self.BG)
        header.pack(fill="x", padx=30, pady=(26, 14))
        tk.Label(header, text="Chronos", font=("Segoe UI", 24, "bold"), fg=self.TEXT, bg=self.BG).pack(anchor="w")
        tk.Label(header, text="本地开发环境启动器", font=("Segoe UI", 11), fg=self.MUTED, bg=self.BG).pack(anchor="w", pady=(2, 0))

        actions = tk.Frame(self, bg=self.BG)
        actions.pack(fill="x", padx=30, pady=(0, 18))
        ttk.Button(actions, text="▶  一键启动", style="Primary.TButton", command=self.start_all).pack(side="left")
        ttk.Button(actions, text="■  停止全部", command=self.stop_all).pack(side="left", padx=(9, 0))
        ttk.Button(actions, text="打开日历", command=self.open_web).pack(side="left", padx=(9, 0))
        ttk.Button(actions, text="清空日志", command=self.clear_logs).pack(side="right")

        cards = tk.Frame(self, bg=self.BG)
        cards.pack(fill="x", padx=30)
        for service in SERVICES:
            self._service_card(cards, service)

        log_header = tk.Frame(self, bg=self.BG)
        log_header.pack(fill="x", padx=30, pady=(22, 7))
        tk.Label(log_header, text="运行日志", font=("Segoe UI", 12, "bold"), fg=self.TEXT, bg=self.BG).pack(side="left")
        tk.Label(log_header, text="启动器会持续显示三个服务的输出", font=("Segoe UI", 9), fg=self.MUTED, bg=self.BG).pack(side="right")
        log_frame = tk.Frame(self, bg="#111827")
        log_frame.pack(fill="both", expand=True, padx=30, pady=(0, 24))
        self.log_text = tk.Text(log_frame, bg="#111827", fg="#d7deed", insertbackground="white", relief="flat", wrap="word", font=("Consolas", 9), padx=12, pady=10)
        scrollbar = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=scrollbar.set)
        self.log_text.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        self._log("系统", f"项目目录：{ROOT}")
        self._log("系统", "准备就绪。可单独启动服务，也可以使用“一键启动”。")

    def _service_card(self, parent: tk.Misc, service: Service) -> None:
        card = tk.Frame(parent, bg=self.CARD, highlightbackground="#e2e7f0", highlightthickness=1)
        card.pack(side="left", fill="both", expand=True, padx=(0, 10))
        if service is SERVICES[-1]:
            card.pack_configure(padx=(0, 0))
        top = tk.Frame(card, bg=self.CARD)
        top.pack(fill="x", padx=16, pady=(15, 4))
        status = tk.Label(top, text="● 未运行", font=("Segoe UI", 9, "bold"), fg=self.MUTED, bg=self.CARD)
        status.pack(side="right")
        self.status_labels[service.key] = status
        tk.Label(card, text=service.name, font=("Segoe UI", 13, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w", padx=16)
        tk.Label(card, text=service.detail, font=("Segoe UI", 9), fg=self.MUTED, bg=self.CARD).pack(anchor="w", padx=16, pady=(3, 12))
        buttons = tk.Frame(card, bg=self.CARD)
        buttons.pack(fill="x", padx=16, pady=(0, 15))
        ttk.Button(buttons, text="启动", command=lambda s=service: self.start_service(s)).pack(side="left")
        ttk.Button(buttons, text="停止", command=lambda s=service: self.stop_service(s)).pack(side="left", padx=(6, 0))

    def _log(self, source: str, line: str) -> None:
        self.log_text.insert("end", f"[{source}] {line.rstrip()}\n")
        self.log_text.see("end")

    def clear_logs(self) -> None:
        self.log_text.delete("1.0", "end")

    def _missing_requirements(self, service: Service) -> list[str]:
        missing: list[str] = []
        if not service.cwd.exists():
            missing.append(f"目录不存在：{service.cwd}")
        if service.key in {"api", "agent"} and service.command[0] != "python" and not Path(service.command[0]).exists():
            missing.append(f"Python 虚拟环境不存在：{service.command[0]}")
        return missing

    def start_service(self, service: Service) -> None:
        existing = self.processes.get(service.key)
        if existing and existing.poll() is None:
            self._log(service.name, "已经在运行。")
            return
        missing = self._missing_requirements(service)
        if missing:
            message = "\n".join(missing) + "\n\n请先按 README_WEB.md 完成依赖安装。"
            self._log(service.name, message)
            messagebox.showwarning("无法启动服务", message)
            return
        try:
            creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            process = subprocess.Popen(
                list(service.command), cwd=service.cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace", bufsize=1, creationflags=creationflags,
            )
        except OSError as exc:
            self._log(service.name, f"启动失败：{exc}")
            messagebox.showerror("启动失败", f"{service.name}\n{exc}")
            return
        self.processes[service.key] = process
        self._log(service.name, f"已启动（PID {process.pid}）")
        threading.Thread(target=self._read_output, args=(service, process), daemon=True).start()

    def _read_output(self, service: Service, process: subprocess.Popen[str]) -> None:
        if process.stdout:
            for line in process.stdout:
                self.log_queue.put((service.name, line))
        code = process.wait()
        self.log_queue.put((service.name, f"进程已退出，代码 {code}"))

    def stop_service(self, service: Service) -> None:
        process = self.processes.get(service.key)
        if not process or process.poll() is not None:
            self._log(service.name, "当前没有运行中的进程。")
            return
        self._log(service.name, "正在停止…")
        try:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, check=False)
        except OSError:
            process.terminate()

    def start_all(self) -> None:
        for service in SERVICES:
            self.start_service(service)

    def stop_all(self) -> None:
        for service in SERVICES:
            self.stop_service(service)

    def open_web(self) -> None:
        webbrowser.open("http://127.0.0.1:8082/")

    def _is_port_open(self, port: int) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.25):
                return True
        except OSError:
            return False

    def _api_healthy(self) -> bool:
        try:
            with urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=0.5) as response:
                return response.status == 200
        except Exception:
            return False

    def _refresh_status(self) -> None:
        for service in SERVICES:
            process = self.processes.get(service.key)
            running = bool(process and process.poll() is None)
            reachable = self._api_healthy() if service.key == "api" else self._is_port_open(service.port)
            label = self.status_labels[service.key]
            if running and reachable:
                label.configure(text="● 运行中", fg=self.GREEN)
            elif running:
                label.configure(text="● 启动中", fg=self.AMBER)
            elif reachable:
                label.configure(text="● 已占用", fg=self.AMBER)
            else:
                label.configure(text="● 未运行", fg=self.MUTED)
        self.after(1000, self._refresh_status)

    def _drain_logs(self) -> None:
        try:
            while True:
                source, line = self.log_queue.get_nowait()
                self._log(source, line)
        except queue.Empty:
            pass
        self.after(250, self._drain_logs)

    def _close(self) -> None:
        active = [s for s in SERVICES if (p := self.processes.get(s.key)) and p.poll() is None]
        if active and not messagebox.askyesno("退出启动器", "仍有服务在运行，是否停止并退出？"):
            return
        self.stop_all()
        self.destroy()


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    LauncherApp().mainloop()
