"""Unit tests for lights_core.frame — no MediaPipe dependency."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

import numpy as np
from lights_core import frame


class TestParseRgb24Part:
    def test_returns_array_when_size_matches(self):
        # 2×2 frame = 12 bytes
        raw = bytes(range(12))
        meta = {'video': {'offset': 0, 'size': 12}}
        result = frame.parse_rgb24_part(raw, meta, 2, 2)
        assert result is not None
        assert result.shape == (2, 2, 3)

    def test_returns_none_when_no_part_matches_expected_size(self):
        raw = b'\xff' * 8
        meta = {'video': {'offset': 0, 'size': 8}}
        # 2×2×3 = 12, but size is 8 → no match
        result = frame.parse_rgb24_part(raw, meta, 2, 2)
        assert result is None

    def test_uses_correct_offset_when_multiple_parts_present(self):
        # First 6 bytes = audio, next 12 = video (2×2×3)
        audio = b'\xaa' * 6
        video = bytes(range(12))
        raw = audio + video
        meta = {
            'audio': {'offset': 0, 'size': 6},
            'video': {'offset': 6, 'size': 12},
        }
        result = frame.parse_rgb24_part(raw, meta, 2, 2)
        assert result is not None
        assert result[0, 0, 0] == 0  # first byte of video data

    def test_returns_none_on_empty_metadata(self):
        result = frame.parse_rgb24_part(b'\x00' * 12, {}, 2, 2)
        assert result is None

    def test_returned_array_has_correct_dtype(self):
        raw = bytes(range(12))
        meta = {'video': {'offset': 0, 'size': 12}}
        result = frame.parse_rgb24_part(raw, meta, 2, 2)
        assert result.dtype == np.uint8

    def test_pixel_values_are_read_correctly(self):
        # Construct a 1×1 frame with a known pixel [R=10, G=20, B=30]
        raw = bytes([10, 20, 30])
        meta = {'video': {'offset': 0, 'size': 3}}
        result = frame.parse_rgb24_part(raw, meta, 1, 1)
        assert result is not None
        assert list(result[0, 0]) == [10, 20, 30]

    def test_1x1_frame_returns_correct_shape(self):
        raw = b'\x00\x00\x00'
        meta = {'video': {'offset': 0, 'size': 3}}
        result = frame.parse_rgb24_part(raw, meta, 1, 1)
        assert result is not None
        assert result.shape == (1, 1, 3)
