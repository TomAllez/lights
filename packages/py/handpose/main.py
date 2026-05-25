"""
Handpose estimation module using MediaPipe HandLandmarker (Tasks API).

Reads RGB24 frames from stdin using the lights IPC protocol,
detects hand landmarks, and writes them back as events.

Event format (type="handpose"):
  data layout (per hand, 253 bytes):
    [0]       handedness: 0=Left, 1=Right
    [1..252]  21 landmarks × 3 float32 LE (x, y, z each normalised 0-1)
"""

import os
import sys
import struct

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import urllib.request
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
from lights_core import cli, frame, ipc

_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'hand_landmarker.task')
_MODEL_URL = (
    'https://storage.googleapis.com/mediapipe-models/'
    'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
)


def _ensure_model() -> None:
    if not os.path.exists(_MODEL_PATH):
        urllib.request.urlretrieve(_MODEL_URL, _MODEL_PATH)


def encode_hand_event(handedness_label: str, landmarks) -> dict:
    """Pack hand data as a base64 event: 1 byte handedness + 21×3 float32 landmarks."""
    buf = bytearray()
    buf.append(1 if handedness_label == 'Right' else 0)
    for lm in landmarks:
        buf.extend(struct.pack('<fff', lm.x, lm.y, lm.z))
    return ipc.encode_binary_event('handpose', bytes(buf))


def main():
    parser = cli.base_arg_parser()
    parser.add_argument('--max-hands', type=int, default=2)
    args = parser.parse_args()

    _ensure_model()
    options = vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=_MODEL_PATH),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=args.max_hands,
        min_hand_detection_confidence=args.min_detection_confidence,
        min_hand_presence_confidence=args.min_tracking_confidence,
        min_tracking_confidence=args.min_tracking_confidence,
    )

    hand_landmarker = vision.HandLandmarker.create_from_options(options)

    while True:
        msg = ipc.read_message(sys.stdin)
        if msg is None:
            break

        header, raw = msg
        video = frame.parse_rgb24_part(raw, header['metadata'], args.width, args.height)
        events = []

        if video is not None:
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=video)
            result = hand_landmarker.detect(mp_image)
            for landmarks, handedness_list in zip(result.hand_landmarks, result.handedness):
                label = handedness_list[0].category_name
                events.append(encode_hand_event(label, landmarks))

        ipc.write_response(sys.stdout, events)

    hand_landmarker.close()


if __name__ == '__main__':
    main()
