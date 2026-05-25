"""Unit tests for encode_hand_event — no MediaPipe dependency."""
import base64
import os
import struct
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Stub mediapipe so the import at module level in main.py doesn't fail
mp_stub = types.ModuleType('mediapipe')
mp_stub.solutions = types.SimpleNamespace(
    hands=types.SimpleNamespace(Hands=None)
)
sys.modules.setdefault('mediapipe', mp_stub)

from handpose.main import encode_hand_event


# ── Helpers ───────────────────────────────────────────────────────────────────

class FakeLandmark:
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x = x
        self.y = y
        self.z = z


def make_landmarks(n: int, x0=0.0, y0=0.0, z0=0.0):
    lms = [FakeLandmark(i * 0.001, i * 0.002, i * 0.0003) for i in range(n)]
    if n > 0:
        lms[0] = FakeLandmark(x0, y0, z0)
    return lms


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestEncodeHandEvent:
    def test_type_is_handpose(self):
        event = encode_hand_event('Right', make_landmarks(21))
        assert event['type'] == 'handpose'

    def test_output_is_253_bytes(self):
        event = encode_hand_event('Right', make_landmarks(21))
        data = base64.b64decode(event['data'])
        assert len(data) == 1 + 21 * 3 * 4  # 253

    def test_right_handedness_byte_is_1(self):
        event = encode_hand_event('Right', make_landmarks(21))
        data = base64.b64decode(event['data'])
        assert data[0] == 1

    def test_left_handedness_byte_is_0(self):
        event = encode_hand_event('Left', make_landmarks(21))
        data = base64.b64decode(event['data'])
        assert data[0] == 0

    def test_wrist_x_round_trips_as_float32_le(self):
        event = encode_hand_event('Right', make_landmarks(21, x0=0.5))
        data = base64.b64decode(event['data'])
        x = struct.unpack_from('<f', data, 1)[0]
        assert abs(x - 0.5) < 1e-6

    def test_wrist_y_round_trips(self):
        event = encode_hand_event('Right', make_landmarks(21, y0=0.25))
        data = base64.b64decode(event['data'])
        y = struct.unpack_from('<f', data, 5)[0]
        assert abs(y - 0.25) < 1e-6

    def test_wrist_z_round_trips(self):
        event = encode_hand_event('Right', make_landmarks(21, z0=0.125))
        data = base64.b64decode(event['data'])
        z = struct.unpack_from('<f', data, 9)[0]
        assert abs(z - 0.125) < 1e-6

    def test_landmark_stride_is_12_bytes_starting_at_offset_1(self):
        # Landmark[1] starts at byte 1 + 1×12 = 13
        lms = make_landmarks(21)
        lms[1] = FakeLandmark(x=0.777)
        event = encode_hand_event('Right', lms)
        data = base64.b64decode(event['data'])
        x1 = struct.unpack_from('<f', data, 13)[0]
        assert abs(x1 - 0.777) < 1e-5

    def test_data_is_valid_base64(self):
        event = encode_hand_event('Left', make_landmarks(21))
        try:
            base64.b64decode(event['data'])
        except Exception:
            assert False, "data is not valid base64"
