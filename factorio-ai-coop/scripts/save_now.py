"""Force the running server to save over the file it is running.

A headless server only writes its save back on a clean shutdown, so anything
that stops it without this step throws away the minutes since the last
autosave. Exits non-zero when no server answers, which lets deploy.bat tell
"nothing was running" apart from "the save failed".
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402


def main() -> int:
    try:
        ai = AIBridge()
        reply = ai.save()
    except (RconError, OSError) as exc:
        print(f"      no server to save: {exc}")
        return 1
    if "error" in reply:
        print(f"      save refused: {reply['error']}")
        return 1
    print(f"      saved at tick {reply.get('tick')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
