"""Unit tests for encode_face_event — no MediaPipe dependency."""
import base64
import os
import struct
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Stub mediapipe so the import at module level in main.py doesn't fail
mp_stub = types.ModuleType('mediapipe')
mp_stub.solutions = types.SimpleNamespace(
    face_mesh=types.SimpleNamespace(FaceMesh=None)
)
sys.modules.setdefault('mediapipe', mp_stub)

from facemesh.main import encode_face_event


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

class TestEncodeFaceEvent:
    def test_type_is_facemesh(self):
        event = encode_face_event(make_landmarks(468))
        assert event['type'] == 'facemesh'

    def test_output_is_5616_bytes(self):
        event = encode_face_event(make_landmarks(468))
        data = base64.b64decode(event['data'])
        assert len(data) == 468 * 3 * 4  # 5616

    def test_data_field_is_valid_base64(self):
        event = encode_face_event(make_landmarks(468))
        try:
            base64.b64decode(event['data'])
        except Exception:
            assert False, "data is not valid base64"

    def test_first_landmark_x_round_trips_as_float32_le(self):
        lms = make_landmarks(468, x0=0.375)
        event = encode_face_event(lms)
        data = base64.b64decode(event['data'])
        x = struct.unpack_from('<f', data, 0)[0]
        assert abs(x - 0.375) < 1e-6

    def test_first_landmark_y_round_trips(self):
        lms = make_landmarks(468, y0=0.625)
        event = encode_face_event(lms)
        data = base64.b64decode(event['data'])
        y = struct.unpack_from('<f', data, 4)[0]
        assert abs(y - 0.625) < 1e-6

    def test_first_landmark_z_round_trips(self):
        lms = make_landmarks(468, z0=0.125)
        event = encode_face_event(lms)
        data = base64.b64decode(event['data'])
        z = struct.unpack_from('<f', data, 8)[0]
        assert abs(z - 0.125) < 1e-6

    def test_landmark_stride_is_12_bytes(self):
        # Each landmark = 3 × float32 = 12 bytes. Verify via landmark[1].x.
        lms = make_landmarks(468)
        lms[1] = FakeLandmark(x=0.999)
        event = encode_face_event(lms)
        data = base64.b64decode(event['data'])
        x1 = struct.unpack_from('<f', data, 12)[0]
        assert abs(x1 - 0.999) < 1e-5
