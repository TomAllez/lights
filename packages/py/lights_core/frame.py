import numpy as np


def parse_rgb24_part(raw: bytes, metadata: dict, width: int, height: int) -> np.ndarray | None:
    """Extract and reshape the video part from a raw binary blob. Returns HxWx3 uint8 or None."""
    expected_size = width * height * 3
    for part in metadata.values():
        if part['size'] == expected_size:
            return np.frombuffer(
                raw[part['offset']:part['offset'] + part['size']],
                dtype=np.uint8,
            ).reshape((height, width, 3))
    return None
