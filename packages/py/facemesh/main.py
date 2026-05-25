"""
Face mesh estimation module using MediaPipe FaceMesh.

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

import mediapipe as mp
from lights_core import cli, frame, ipc


def encode_face_event(landmarks) -> list[int]:
    """Pack face landmarks as bytes: 468 × 3 float32 LE (x, y, z)."""
    buf = bytearray()
    for lm in landmarks:
        buf.extend(struct.pack('<fff', lm.x, lm.y, lm.z))
    return list(buf)


def main():
    parser = cli.base_arg_parser()
    parser.add_argument('--max-faces', type=int, default=1)
    args = parser.parse_args()

    face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=args.max_faces,
        refine_landmarks=False,
        min_detection_confidence=args.min_detection_confidence,
        min_tracking_confidence=args.min_tracking_confidence,
    )

    while True:
        msg = ipc.read_message(sys.stdin)
        if msg is None:
            break

        header, raw = msg
        video = frame.parse_rgb24_part(raw, header['metadata'], args.width, args.height)
        events = []

        if video is not None:
            detection = face_mesh.process(video)
            if detection.multi_face_landmarks:
                for face_landmarks in detection.multi_face_landmarks:
                    events.append({
                        'type': 'facemesh',
                        'data': encode_face_event(face_landmarks.landmark),
                    })

        ipc.write_response(sys.stdout, events)

    face_mesh.close()


if __name__ == '__main__':
    main()
