import { createFrame, Frame, FrameEvent } from "./frame";

/**
 * Concatenates multiple frames into a single frame.
 * All frames must have the same timestamp. Part names must be unique across all frames.
 * Events from all frames are merged into the resulting frame.
 * @param {Frame[]} frames - Array of frames to concatenate
 * @returns {Frame} A new frame containing the concatenated data and merged events
 * @throws {Error} If frames array is empty, timestamps don't match, or part names are duplicated
 */
export function concat(frames: Frame[]): Frame {
    if (frames.length === 0) {
        throw new Error('No frames to concatenate');
    }

    const timestamp = frames[0].getTimestamp();
    const duration = frames[0].getDuration();
    const metadata: Record<string, { offset: number; size: number }> = {};
    const events: FrameEvent[] = [];
    let offset = 0;
    const dataParts: Uint8Array[] = [];

    for (const frame of frames) {
        if (frame.getTimestamp() !== timestamp) {
            throw new Error('All frames must have the same timestamp');
        }
        if (frame.getDuration() !== duration) {
            throw new Error('All frames must have the same duration');
        }
        for (const partName of frame.getPartsName()) {
            if (metadata[partName] !== undefined) {
                throw new Error(`Duplicate part name: ${partName}`);
            }
            const partData = frame.getPart(partName);
            if (partData) {
                metadata[partName] = { offset, size: partData.length };
                dataParts.push(partData);
                offset += partData.length;
            }
        }
        events.push(...frame.getEvents());
    }

    const data = new Uint8Array(offset);
    let dataOffset = 0;
    for (const partData of dataParts) {
        data.set(partData, dataOffset);
        dataOffset += partData.length;
    }

    return createFrame({ timestamp, duration, metadata, data, events });
}