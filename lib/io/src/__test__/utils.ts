import { Frame } from "../frame";

export function createMockFrame(): Frame {
    const timestamp = Date.now();
    const duration = 20;
    const metadata = { part1: { offset: 0, size: 5 }, part2: { offset: 5, size: 5 } };
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const events = [{ type: 'detection', data: new Uint8Array([11, 12]) }];

    return new Frame({ timestamp, duration, metadata, data, events });
}