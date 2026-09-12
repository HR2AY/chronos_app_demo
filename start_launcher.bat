@echo off
setlocal
cd /d "%~dp0"
title Chronos Launcher
where pythonw >nul 2>&1
if not errorlevel 1 (
  start "" pythonw launcher.py
  exit /b 0
)
python launcher.py
if errorlevel 1 echo Chronos launcher could not start. Make sure Python 3.10+ is installed.
