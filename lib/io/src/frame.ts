type PartName = string;

export type PartMetadata = {
  offset: number;
  size: number;
};

type FrameMetadata = Record<PartName, PartMetadata>;

export type FrameEvent = {
  type: string;
  data: Uint8Array;
}

/**
 * Configuration data for creating a Frame.
 * @typedef {Object} FrameData
 * @property {number} timestamp - Absolute timestamp in milliseconds since epoch
 * @property {number} duration - Relative duration in milliseconds
 * @property {FrameMetadata} metadata - Declaration of how data is composed (part names mapped to offsets and sizes)
 * @property {Uint8Array} data - Binary data in Uint8Array format
 * @property {FrameEvent[]} events - Array of events associated with this frame
 */
export type FrameData = {
  timestamp: number;
  duration: number;
  metadata: FrameMetadata;
  data: Uint8Array;
  events: FrameEvent[]
}

/**
 * Signal Frame - Instant representation of signal data (Sample).
 * @param {FrameData} data - The frame data including timestamp, duration, metadata, binary data, and events
 * @property {number} timestamp - Timestamp in milliseconds since epoch
 * @property {number} duration - Duration in milliseconds
 * @property {FrameMetadata} metadata - Declaration of how data is composed
 * @property {Uint8Array} data - Actual data in uint8 format
 * @property {FrameEvent[]} events - Array of events
 */
export class Frame {
  private timestamp: number;
  private duration: number;
  private metadata: FrameMetadata
  private data: Uint8Array;
  private events: FrameEvent[];

  /**
   * Creates a new Frame instance.
   * @param {FrameData} data - The frame data
   */
  constructor(data: FrameData) {
    this.timestamp = data.timestamp;
    this.duration = data.duration;
    this.metadata = data.metadata;
    this.data = data.data;
    this.events = data.events;
  }

  /**
   * Gets the absolute timestamp of this frame.
   * @returns {number} Timestamp in milliseconds since epoch
   */
  getTimestamp(): number {
    return this.timestamp;
  }

  /**
   * Gets the duration of this frame.
   * @returns {number} Duration in milliseconds
   */
  getDuration(): number {
    return this.duration;
  }

  /**
   * Gets the names of all parts in this frame's metadata.
   * @returns {PartName[]} Array of part names
   */
  getPartsName(): PartName[] {
    return Object.keys(this.metadata);
  }

  /**
   * Retrieves a specific part's data by name.
   * @param {PartName} partName - The name of the part to retrieve
   * @returns {Uint8Array | null} The part's data as a Uint8Array subarray, or null if part not found
   */
  getPart(partName: PartName): Uint8Array | null {
    const part = this.metadata[partName];
    if (part === undefined) {
      return null;
    }
    return this.data.subarray(part.offset, part.offset + part.size);
  }

  /**
   * Gets all events associated with this frame.
   * @returns {FrameEvent[]} Array of frame events
   */
  getEvents(): FrameEvent[] {
    return this.events;
  }

  age(): number {
    return Date.now() - this.timestamp;
  }
}

/**
 * Factory function to create a new Frame instance.
 * @param {FrameData} data - The frame data
 * @returns {Frame} A new Frame instance
 */
export function createFrame(data: FrameData): Frame {
  return new Frame(data);
}