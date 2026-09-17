#!/usr/bin/env bash
# Start a local Factorio headless server with the ai-bridge mod and RCON open.
#
#   scripts/start-test-server.sh [save-name]
#
# The server binds to loopback only. Join it from the game client with
# Multiplayer -> Connect to address -> 127.0.0.1:34198
set -euo pipefail

FACTORIO="${FACTORIO_EXE:-G:/SteamLibrary/steamapps/common/Factorio/bin/x64/factorio.exe}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="${FACTORIO_AGENT_DATA:-D:/park/YD_Claude_RND/.factorio-bot}"
SAVE_NAME="${1:-ai-coop-test}"
SAVE="$DATA/saves/$SAVE_NAME.zip"

GAME_PORT="${FACTORIO_GAME_PORT:-34198}"
RCON_PORT="${FACTORIO_RCON_PORT:-27015}"
RCON_PASSWORD="${FACTORIO_RCON_PASSWORD:-rcontest123}"

# Free the RCON port if a previous server is still holding it.
PID=$(powershell.exe -NoProfile -Command \
  "(Get-NetTCPConnection -State Listen -LocalPort $RCON_PORT -ErrorAction SilentlyContinue).OwningProcess" \
  2>/dev/null | tr -d '\r\n ' || true)
if [ -n "${PID:-}" ]; then
  echo "stopping previous server (pid $PID)"
  taskkill //PID "$PID" //F >/dev/null 2>&1 || true
fi

# Factorio compares mod script checksums, so an edited mod on the server side
# alone kicks the human with "does not match the server". Keep the client copy
# in step every time the server starts.
CLIENT_MODS="${FACTORIO_CLIENT_MODS:-$APPDATA/Factorio/mods}"
MOD_SRC="$ROOT/mods/ai-bridge_0.3.0"
if [ -d "$CLIENT_MODS" ]; then
  mkdir -p "$CLIENT_MODS/ai-bridge_0.3.0"
  cp "$MOD_SRC"/info.json "$MOD_SRC"/control.lua "$MOD_SRC"/tasks.lua \
     "$CLIENT_MODS/ai-bridge_0.3.0/"
  echo "synced ai-bridge to client mods: $CLIENT_MODS/ai-bridge_0.3.0"
fi

if [ ! -f "$SAVE" ]; then
  echo "creating map $SAVE"
  "$FACTORIO" --config "$ROOT/../factorio-bot-config.ini" --create "$SAVE" >/dev/null
fi

echo "starting server: game=$GAME_PORT rcon=$RCON_PORT save=$SAVE_NAME"
exec "$FACTORIO" \
  --config "$ROOT/../factorio-bot-config.ini" \
  --mod-directory "$ROOT/mods" \
  --start-server "$SAVE" \
  --server-settings "$ROOT/../factorio-server-settings.json" \
  --bind "127.0.0.1:$GAME_PORT" \
  --rcon-bind "127.0.0.1:$RCON_PORT" \
  --rcon-password "$RCON_PASSWORD" \
  --console-log "$DATA/ai-coop-server.log"
