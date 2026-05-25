"""Unit tests for lights_core.ipc — no MediaPipe dependency."""
import base64
import io
import json
import struct
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from lights_core import ipc


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_stdin(raw_bytes: bytes):
    """Wrap bytes in a fake stdin-like object with a .buffer attribute."""
    class FakeStdin:
        buffer = io.BytesIO(raw_bytes)
    return FakeStdin()


def pack_message(header_str: str, raw_data: bytes) -> bytes:
    """Build a complete lights IPC message."""
    header_bytes = header_str.encode('utf-8')
    length = struct.pack('<I', len(header_bytes))
    return length + header_bytes + raw_data


def make_header(width=2, height=2, part_name='video') -> str:
    size = width * height * 3
    return json.dumps({
        'timestamp': 100,
        'duration': 33,
        'metadata': {part_name: {'offset': 0, 'size': size}},
    })


# ── read_message ─────────────────────────────────────────────────────────────


class TestReadMessage:
    def test_returns_none_on_eof(self):
        stdin = make_stdin(b'')
        assert ipc.read_message(stdin) is None

    def test_returns_none_when_header_length_truncated(self):
        stdin = make_stdin(b'\x05\x00')  # only 2 bytes, not 4
        assert ipc.read_message(stdin) is None

    def test_reads_header_and_data(self):
        raw_data = bytes(range(12))  # 2×2×3 = 12
        header_str = make_header(2, 2)
        msg = pack_message(header_str, raw_data)
        stdin = make_stdin(msg)

        result_header, result_raw = ipc.read_message(stdin)
        assert result_header['timestamp'] == 100
        assert result_raw == raw_data

    def test_reads_zero_byte_payload(self):
        header_str = json.dumps({'timestamp': 0, 'duration': 16, 'metadata': {}})
        msg = pack_message(header_str, b'')
        stdin = make_stdin(msg)

        result_header, result_raw = ipc.read_message(stdin)
        assert result_raw == b''

    def test_header_metadata_preserved(self):
        header_str = make_header(4, 4, 'camera')
        raw = b'\xab' * (4 * 4 * 3)
        stdin = make_stdin(pack_message(header_str, raw))

        header, _ = ipc.read_message(stdin)
        assert 'camera' in header['metadata']
        assert header['metadata']['camera']['size'] == 4 * 4 * 3


# ── encode_binary_event ───────────────────────────────────────────────────────


class TestEncodeBinaryEvent:
    def test_type_field_is_preserved(self):
        event = ipc.encode_binary_event('facemesh', b'\x01\x02\x03')
        assert event['type'] == 'facemesh'

    def test_data_is_valid_base64(self):
        payload = bytes(range(32))
        event = ipc.encode_binary_event('test', payload)
        assert base64.b64decode(event['data']) == payload

    def test_empty_payload_encodes_to_empty_string(self):
        event = ipc.encode_binary_event('test', b'')
        assert event['data'] == ''

    def test_round_trip_preserves_all_byte_values(self):
        payload = bytes(range(256))
        event = ipc.encode_binary_event('x', payload)
        assert base64.b64decode(event['data']) == payload

    def test_data_field_is_ascii_string(self):
        event = ipc.encode_binary_event('test', b'\xff\xfe\xfd')
        assert isinstance(event['data'], str)
        assert all(ord(c) < 128 for c in event['data'])


# ── write_response ────────────────────────────────────────────────────────────


class TestWriteResponse:
    def _capture(self, events):
        buf = io.BytesIO()

        class FakeStdout:
            buffer = buf

        ipc.write_response(FakeStdout(), events)
        buf.seek(0)
        return buf

    def test_writes_length_prefixed_json(self):
        buf = self._capture([{'type': 'x', 'data': 'abc'}])
        length = struct.unpack('<I', buf.read(4))[0]
        body = json.loads(buf.read(length))
        assert body['events'][0]['type'] == 'x'

    def test_empty_events_list_is_valid(self):
        buf = self._capture([])
        length = struct.unpack('<I', buf.read(4))[0]
        body = json.loads(buf.read(length))
        assert body['events'] == []

    def test_multiple_events_are_preserved_in_order(self):
        events = [{'type': 'first', 'data': ''}, {'type': 'second', 'data': ''}]
        buf = self._capture(events)
        length = struct.unpack('<I', buf.read(4))[0]
        body = json.loads(buf.read(length))
        assert [e['type'] for e in body['events']] == ['first', 'second']

    def test_length_prefix_matches_actual_payload_length(self):
        buf = self._capture([{'type': 'test', 'data': 'aGVsbG8='}])
        length = struct.unpack('<I', buf.read(4))[0]
        payload = buf.read()
        assert len(payload) == length
