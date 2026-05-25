import base64
import json
import struct
import sys


def read_message(stdin) -> tuple[dict, bytes] | None:
    """Read one lights IPC message from stdin. Returns (header, raw_data) or None on EOF."""
    length_bytes = stdin.buffer.read(4)
    if len(length_bytes) < 4:
        return None
    length = struct.unpack('<I', length_bytes)[0]
    header = json.loads(stdin.buffer.read(length))
    total_size = sum(p['size'] for p in header['metadata'].values())
    raw = stdin.buffer.read(total_size)
    return header, raw


def encode_binary_event(event_type: str, data: bytes) -> dict:
    """Encode a binary event payload as base64, cutting stdout size by ~60%."""
    return {'type': event_type, 'data': base64.b64encode(data).decode('ascii')}


def write_response(stdout, events: list[dict]) -> None:
    """Write one response containing the given events."""
    payload = json.dumps({'events': events}).encode('utf-8')
    stdout.buffer.write(struct.pack('<I', len(payload)))
    stdout.buffer.write(payload)
    stdout.buffer.flush()
