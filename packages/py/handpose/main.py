"""
Handpose estimation module using MediaPipe Hands.

Reads RGB24 frames from stdin using the lights IPC protocol,
detects hand landmarks, and writes them back as events.

stdin protocol:
  [4 bytes LE uint32] JSON header length
  [N bytes]           JSON: {timestamp, duration, metadata: {partName: {offset, size}}}
  [M bytes]           binary RGB24 frame data

stdout protocol:
  [4 bytes LE uint32] JSON response length
  [N bytes]           JSON: {events: [{type, data: number[]}]}

Event format (type="handpose"):
  data layout (per hand, 253 bytes):
    [0]       handedness: 0=Left, 1=Right
    [1..252]  21 landmarks × 3 float32 LE (x, y, z each normalised 0-1)
"""

import sys
import json
import struct
import argparse
import numpy as np
import mediapipe as mp


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--width', type=int, default=640)
    parser.add_argument('--height', type=int, default=480)
    parser.add_argument('--max-hands', type=int, default=2)
    parser.add_argument('--min-detection-confidence', type=float, default=0.5)
    parser.add_argument('--min-tracking-confidence', type=float, default=0.5)
    return parser.parse_args()


def read_frame(width, height):
    header_len_bytes = sys.stdin.buffer.read(4)
    if len(header_len_bytes) < 4:
        return None

    header_len = struct.unpack('<I', header_len_bytes)[0]
    header_bytes = sys.stdin.buffer.read(header_len)
    header = json.loads(header_bytes)

    total_size = sum(p['size'] for p in header['metadata'].values())
    raw = sys.stdin.buffer.read(total_size)

    # Find the video part (first part whose size matches an RGB24 frame)
    expected_size = width * height * 3
    video_data = None
    for part in header['metadata'].values():
        if part['size'] == expected_size:
            video_data = np.frombuffer(
                raw[part['offset']:part['offset'] + part['size']],
                dtype=np.uint8,
            ).reshape((height, width, 3))
            break

    return header, video_data


def encode_hand_event(handedness_label, landmarks):
    """Pack hand data as bytes: 1 byte handedness + 21×3 float32 landmarks."""
    buf = bytearray()
    buf.append(1 if handedness_label == 'Right' else 0)
    for lm in landmarks:
        buf.extend(struct.pack('<fff', lm.x, lm.y, lm.z))
    return list(buf)


def write_response(events):
    payload = json.dumps({'events': events}).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def main():
    args = parse_args()

    hands = mp.solutions.hands.Hands(
        static_image_mode=False,
        max_num_hands=args.max_hands,
        min_detection_confidence=args.min_detection_confidence,
        min_tracking_confidence=args.min_tracking_confidence,
    )

    while True:
        result = read_frame(args.width, args.height)
        if result is None:
            break

        _, video_data = result
        events = []

        if video_data is not None:
            detection = hands.process(video_data)
            if detection.multi_hand_landmarks and detection.multi_handedness:
                for landmarks, handedness in zip(
                    detection.multi_hand_landmarks,
                    detection.multi_handedness,
                ):
                    label = handedness.classification[0].label
                    events.append({
                        'type': 'handpose',
                        'data': encode_hand_event(label, landmarks.landmark),
                    })

        write_response(events)

    hands.close()


if __name__ == '__main__':
    main()
