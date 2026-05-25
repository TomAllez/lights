"""
Handpose estimation module using MediaPipe Hands.

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

import mediapipe as mp
from lights_core import cli, frame, ipc


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

    hands = mp.solutions.hands.Hands(
        static_image_mode=False,
        max_num_hands=args.max_hands,
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
            detection = hands.process(video)
            if detection.multi_hand_landmarks and detection.multi_handedness:
                for lm_set, handedness in zip(
                    detection.multi_hand_landmarks,
                    detection.multi_handedness,
                ):
                    label = handedness.classification[0].label
                    events.append(encode_hand_event(label, lm_set.landmark))

        ipc.write_response(sys.stdout, events)

    hands.close()


if __name__ == '__main__':
    main()
