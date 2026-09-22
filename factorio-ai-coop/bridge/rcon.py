"""Minimal Source RCON client for Factorio. Standard library only.

Factorio speaks the Source RCON protocol and answers each command with exactly
one response packet, which keeps this much simpler than a general-purpose
client that has to handle multi-packet responses.
"""

from __future__ import annotations

import socket
import struct

SERVERDATA_AUTH = 3
SERVERDATA_EXECCOMMAND = 2


class RconError(Exception):
    pass


class AuthError(RconError):
    pass


class RconTimeout(RconError):
    """A command produced no reply.

    The connection is closed when this is raised. A late reply would otherwise
    be read as the answer to the *next* command, silently shifting every result
    from then on, which is far harder to debug than a dropped connection.
    """


class Rcon:
    def __init__(self, host: str, port: int, password: str, timeout: float = 15.0) -> None:
        self._where = (host, port, password, timeout)
        self._open()

    def _open(self) -> None:
        host, port, password, timeout = self._where
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.sock.settimeout(timeout)
        self._id = 0
        self._auth(password)

    def reconnect(self) -> None:
        """서버가 재기동되면 옛 소켓은 영영 죽어 있다.

        21회차 배포 뒤 운반·방어선·감시 고리 셋이 한 시간 넘게
        ConnectionResetError 만 찍었다. 고리는 예외를 삼키고 다음 순번으로
        넘어가지만 소켓은 스스로 살아나지 않는다 - 그 사이 돌밭 상자에 돌
        3,202 개가 쌓였다. 끊기면 다시 연다.
        """
        self.close()
        self._open()

    # -- wire format ------------------------------------------------------

    def _send(self, packet_type: int, body: str) -> int:
        self._id += 1
        payload = struct.pack("<ii", self._id, packet_type) + body.encode("utf-8") + b"\x00\x00"
        self.sock.sendall(struct.pack("<i", len(payload)) + payload)
        return self._id

    def _read_exact(self, n: int) -> bytes:
        buf = b""
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise RconError("connection closed by server")
            buf += chunk
        return buf

    def _recv(self) -> tuple[int, int, str]:
        size = struct.unpack("<i", self._read_exact(4))[0]
        data = self._read_exact(size)
        req_id, packet_type = struct.unpack("<ii", data[:8])
        return req_id, packet_type, data[8:-2].decode("utf-8", errors="replace")

    def _auth(self, password: str) -> None:
        sent = self._send(SERVERDATA_AUTH, password)
        while True:
            req_id, _, _ = self._recv()
            if req_id == -1:
                raise AuthError("RCON authentication failed (wrong password)")
            if req_id == sent:
                return

    # -- public api -------------------------------------------------------

    def command(self, cmd: str) -> str:
        try:
            sent = self._send(SERVERDATA_EXECCOMMAND, cmd)
            req_id, _, body = self._recv()
        except socket.timeout as exc:
            self.close()
            raise RconTimeout(f"no reply to: {cmd[:120]}") from exc
        except (ConnectionError, OSError) as exc:
            # 한 번은 다시 열어 본다. 재기동 직후면 이것으로 산다. 아직 안
            # 떴으면 그 예외가 그대로 올라가고 고리는 다음 순번에 또 온다.
            self.reconnect()
            sent = self._send(SERVERDATA_EXECCOMMAND, cmd)
            req_id, _, body = self._recv()
        if req_id != sent:
            self.close()
            raise RconError(f"response id mismatch: {req_id} != {sent}")
        return body

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass

    def __enter__(self) -> "Rcon":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
