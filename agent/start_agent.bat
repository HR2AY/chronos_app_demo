@echo off
setlocal
title Chronos LiveKit Agent

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [Chronos] Python environment not found: %~dp0.venv\Scripts\python.exe
  echo [Chronos] Press any key to close.
  pause >nul
  exit /b 1
)

echo [Chronos] Starting LiveKit Agent on port 8081...
echo [Chronos] Close this window to stop the Agent process tree.
echo.

"%~dp0.venv\Scripts\python.exe" main.py start
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo [Chronos] Agent stopped with exit code %EXIT_CODE%.
exit /b %EXIT_CODE%
