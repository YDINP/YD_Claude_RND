@echo off
rem Start the Factorio AI coop server in its own window.
rem ASCII only on purpose: a .bat with Korean text gets read as CP949 and the
rem quoting breaks with no error message.
setlocal

title Factorio AI Coop Server

if "%FACTORIO_EXE%"=="" set "FACTORIO_EXE=G:\SteamLibrary\steamapps\common\Factorio\bin\x64\factorio.exe"
set "ROOT=%~dp0.."
set "DATA=%~dp0..\..\.factorio-bot"
set "SAVE_NAME=%~1"
if "%SAVE_NAME%"=="" set "SAVE_NAME=ai-coop-test"
set "SAVE=%DATA%\saves\%SAVE_NAME%.zip"
set "CLIENT_MODS=%APPDATA%\Factorio\mods\ai-bridge_0.3.0"

if not exist "%FACTORIO_EXE%" (
  echo Factorio not found at: %FACTORIO_EXE%
  echo Set FACTORIO_EXE and run again.
  pause
  exit /b 1
)

rem A server left running by anything else already holds these ports, and
rem Factorio's own complaint about it is buried in a wall of startup log.
netstat -ano -p tcp | findstr /r /c:"127.0.0.1:27015 .*LISTENING" >nul
if not errorlevel 1 (
  echo.
  echo   Port 27015 is already in use - another server is running.
  echo   Close that window first, or run:  taskkill /F /IM factorio.exe
  echo.
  pause
  exit /b 1
)

echo Syncing mod to the game client...
if not exist "%CLIENT_MODS%" mkdir "%CLIENT_MODS%"
copy /Y "%ROOT%\mods\ai-bridge_0.3.0\*.*" "%CLIENT_MODS%\" >nul
if errorlevel 1 echo WARNING: could not sync the client mod copy.

if not exist "%SAVE%" (
  echo Creating map %SAVE_NAME% ...
  "%FACTORIO_EXE%" --config "%ROOT%\..\factorio-bot-config.ini" --create "%SAVE%"
)

echo.
echo ====================================================
echo   Game    : 127.0.0.1:34198   ^(Multiplayer / Connect to address^)
echo   RCON    : 127.0.0.1:27015
echo   Save    : %SAVE_NAME%
echo   Close this window to stop the server.
echo ====================================================
echo.

"%FACTORIO_EXE%" ^
  --config "%ROOT%\..\factorio-bot-config.ini" ^
  --mod-directory "%ROOT%\mods" ^
  --start-server "%SAVE%" ^
  --server-settings "%ROOT%\..\factorio-server-settings.json" ^
  --bind 127.0.0.1:34198 ^
  --rcon-bind 127.0.0.1:27015 ^
  --rcon-password rcontest123 ^
  --console-log "%DATA%\ai-coop-server.log"

echo.
echo Server stopped. Press any key to close.
pause >nul
