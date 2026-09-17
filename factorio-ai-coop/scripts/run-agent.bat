@echo off
rem Start the chat-listening agent in its own window.
rem Pass --auto to let it also play by itself while nobody is giving orders.
rem ASCII only: see run-server.bat.
setlocal

title Factorio AI Coop Agent

set "ROOT=%~dp0.."
set "PYTHONIOENCODING=utf-8"

where python >nul 2>&1
if errorlevel 1 (
  echo python not found on PATH.
  pause
  exit /b 1
)

echo.
echo ====================================================
echo   Listening to in-game chat.
echo   Talk to the agent from the game chat window.
echo   Close this window to stop it.
echo ====================================================
echo.

python -u "%ROOT%\bridge\agent.py" %*

echo.
echo Agent stopped. Press any key to close.
pause >nul
