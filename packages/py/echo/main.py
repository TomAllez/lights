"""
Minimal echo module for IPC benchmarking.
Reads frames using the lights IPC protocol and immediately returns empty events.
Measures subprocess round-trip overhead in isolation from ML inference.
"""

import sys
import json
import struct


def main():
    while True:
        # Read 4-byte header length
        header_len_bytes = sys.stdin.buffer.read(4)
        if len(header_len_bytes) < 4:
            break
        header_len = struct.unpack('<I', header_len_bytes)[0]

        # Read JSON header
        header_bytes = sys.stdin.buffer.read(header_len)
        if len(header_bytes) < header_len:
            break
        header = json.loads(header_bytes.decode('utf-8'))

        # Read binary payload (sum of all part sizes)
        total_size = sum(p['size'] for p in header.get('metadata', {}).values())
        if total_size > 0:
            sys.stdin.buffer.read(total_size)

        # Respond with empty events
        response = json.dumps({'events': []}).encode('utf-8')
        sys.stdout.buffer.write(struct.pack('<I', len(response)))
        sys.stdout.buffer.write(response)
        sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
