import { describe, expect, it } from "vitest";
import { concat } from "../concat";
import { createFrame } from "../frame";

describe("concat frames", () => {
    it("should concat two frames", () => {
        const timestamp = Date.now();
        const duration = 20;
        const frame1 = createFrame({
            timestamp,
            duration,
            metadata: { part1: { offset: 0, size: 5 } },
            data: new Uint8Array([1, 2, 3, 4, 5]),
            events: [{ type: 'detection', data: new Uint8Array([11, 12]) }]
        });
        const frame2 = createFrame({
            timestamp,
            duration,
            metadata: { part2: { offset: 0, size: 5 } },
            data: new Uint8Array([6, 7, 8, 9, 10]),
            events: [{ type: 'detection', data: new Uint8Array([11, 12]) }]
        });

        const result = concat([frame1, frame2]);

        expect(result.getTimestamp()).toBe(timestamp);
        expect(result.getDuration()).toBe(duration);
        expect(result.getPartsName()).toEqual(['part1', 'part2']);
        expect(result.getPart('part1')).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
        expect(result.getPart('part2')).toEqual(new Uint8Array([6, 7, 8, 9, 10]));
        expect(result.getEvents()).toEqual([
            { type: 'detection', data: new Uint8Array([11, 12]) },
            { type: 'detection', data: new Uint8Array([11, 12]) }
        ]);
    });
    it("should throw error if frames have different timestamps", () => {
        const frame1 = createFrame({
            timestamp: Date.now(),
            duration: 20,
            metadata: { part1: { offset: 0, size: 5 } },
            data: new Uint8Array([1, 2, 3, 4, 5]),
            events: []
        });
        const frame2 = createFrame({
            timestamp: Date.now() + 1000,
            duration: 20,
            metadata: { part2: { offset: 0, size: 5 } },
            data: new Uint8Array([6, 7, 8, 9, 10]),
            events: []
        });

        expect(() => concat([frame1, frame2])).toThrow('All frames must have the same timestamp');
    });
    it("should throw error if frames have different durations", () => {
        const timestamp = Date.now();
        const frame1 = createFrame({
            timestamp,
            duration: 20,
            metadata: { part1: { offset: 0, size: 5 } },
            data: new Uint8Array([1, 2, 3, 4, 5]),
            events: []
        });
        const frame2 = createFrame({
            timestamp,
            duration: 30,
            metadata: { part2: { offset: 0, size: 5 } },
            data: new Uint8Array([6, 7, 8, 9, 10]),
            events: []
        });

        expect(() => concat([frame1, frame2])).toThrow('All frames must have the same duration');
    })
}); 