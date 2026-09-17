@echo off
rem Apply mod changes to a running server without losing the world.
rem
rem Mod Lua is read once at startup, so a control.lua change needs a restart.
rem A headless server only writes its save back on a clean shutdown, and it
rem never loads the _autosave files, so the order matters:
rem
rem   1. tell the running server to save over the file it is running
rem   2. stop it
rem   3. copy the mod to the client so checksums match
rem   4. start it again on the same save
rem
rem Skipping step 1 costs whatever happened since the last autosave.
rem ASCII only: Korean in a .bat is read as CP949 and swallows quotes.

setlocal
set ROOT=D:\park\YD_Claude_RND\factorio-ai-coop
set SAVE=%1
if "%SAVE%"=="" set SAVE=ai-coop-fresh

echo [1/4] saving the running world...
python "%ROOT%\scripts\save_now.py"
if errorlevel 1 (
  echo       no server answered - nothing to save, continuing
)

echo [2/4] stopping server and daemon...
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -like '*agent.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='factorio.exe'\" | Where-Object { $_.CommandLine -like '*rcon-bind*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
timeout /t 3 /nobreak >nul

echo [3/4] restarting server on %SAVE% ...
start "factorio-server" /min cmd /c "%ROOT%\scripts\run-server.bat %SAVE%"
timeout /t 20 /nobreak >nul

echo [4/4] restarting the crew...
start "factorio-crew" /min cmd /c "%ROOT%\scripts\run-agent.bat --agents 4"

echo done. rejoin the server from the game client.
endlocal
