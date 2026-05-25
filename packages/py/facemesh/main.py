"""
Face mesh estimation module using MediaPipe FaceLandmarker (Tasks API).

Reads RGB24 frames from stdin using the lights IPC protocol,
detects face landmarks, and writes them back as events.

Event format (type="facemesh"):
  data layout (per face, 5616 bytes):
    468 landmarks × 3 float32 LE (x, y, z each normalised 0-1)
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

_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'face_landmarker.task')
_MODEL_URL = (
    'https://storage.googleapis.com/mediapipe-models/'
    'face_landmarker/face_landmarker/float16/1/face_landmarker.task'
)


def _ensure_model() -> None:
    if not os.path.exists(_MODEL_PATH):
        urllib.request.urlretrieve(_MODEL_URL, _MODEL_PATH)


def encode_face_event(landmarks) -> dict:
    """Pack face landmarks as a base64 event: 468 × 3 float32 LE (x, y, z)."""
    buf = bytearray()
    for lm in landmarks:
        buf.extend(struct.pack('<fff', lm.x, lm.y, lm.z))
    return ipc.encode_binary_event('facemesh', bytes(buf))


def main():
    parser = cli.base_arg_parser()
    parser.add_argument('--max-faces', type=int, default=1)
    args = parser.parse_args()

    _ensure_model()
    options = vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=_MODEL_PATH),
        running_mode=vision.RunningMode.IMAGE,
        num_faces=args.max_faces,
        min_face_detection_confidence=args.min_detection_confidence,
        min_face_presence_confidence=args.min_tracking_confidence,
        min_tracking_confidence=args.min_tracking_confidence,
    )

    face_landmarker = vision.FaceLandmarker.create_from_options(options)

    while True:
        msg = ipc.read_message(sys.stdin)
        if msg is None:
            break

        header, raw = msg
        video = frame.parse_rgb24_part(raw, header['metadata'], args.width, args.height)
        events = []

        if video is not None:
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=video)
            result = face_landmarker.detect(mp_image)
            for face_landmarks in result.face_landmarks:
                events.append(encode_face_event(face_landmarks))

        ipc.write_response(sys.stdout, events)

    face_landmarker.close()


if __name__ == '__main__':
    main()
