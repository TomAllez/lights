"""
Handpose estimation module.
Reads frames from stdin using the lights IPC protocol and writes events to stdout.

Protocol (stdin):
  [4 bytes LE uint32] header JSON length
  [N bytes]           JSON: {timestamp, duration, metadata: {partName: {offset, size}}}
  [M bytes]           binary frame data (total size derived from metadata)

Protocol (stdout):
  [4 bytes LE uint32] response JSON length
  [N bytes]           JSON: {events: [{type, data: number[]}]}
"""

import sys
import json
import struct


def read_frame():
    header_len_bytes = sys.stdin.buffer.read(4)
    if len(header_len_bytes) < 4:
        return None

    header_len = struct.unpack('<I', header_len_bytes)[0]
    header_bytes = sys.stdin.buffer.read(header_len)
    header = json.loads(header_bytes)

    total_data_size = sum(p['size'] for p in header['metadata'].values())
    data = sys.stdin.buffer.read(total_data_size)

    return header, data


def write_response(events):
    payload = json.dumps({'events': events}).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def process(header, data):
    # TODO: run actual hand pose estimation here
    # For now, return empty events as a passthrough stub
    return []


def main():
    while True:
        result = read_frame()
        if result is None:
            break
        header, data = result
        events = process(header, data)
        write_response(events)


if __name__ == '__main__':
    main()
