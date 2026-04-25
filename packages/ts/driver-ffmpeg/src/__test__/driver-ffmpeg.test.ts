import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'child_process';
import { FfmpegDriver } from '../driver-ffmpeg.js';
import { BaseDriver } from '@lights/driver';
import { Frame } from '@lights/io';

type MockProcess = { stdout: EventEmitter; kill: ReturnType<typeof vi.fn> };

describe('FfmpegDriver', () => {
  let mockProcess: MockProcess;

  beforeEach(() => {
    mockProcess = { stdout: new EventEmitter(), kill: vi.fn() };
    vi.mocked(spawn).mockReturnValue(mockProcess as never);
  });

  it('extends BaseDriver', () => {
    expect(new FfmpegDriver()).toBeInstanceOf(BaseDriver);
  });

  it('spawns ffmpeg with default options', () => {
    const driver = new FfmpegDriver();
    driver.start();
    expect(spawn).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-f', 'avfoundation', '-i', '0', '-pix_fmt', 'rgb24']),
      expect.any(Object),
    );
  });

  it('spawns ffmpeg with custom options', () => {
    const driver = new FfmpegDriver({ device: '1', width: 1280, height: 720, fps: 60 });
    driver.start();
    expect(spawn).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-i', '1', '-framerate', '60', '-vf', 'scale=1280:720']),
      expect.any(Object),
    );
  });

  it('emits a Frame when a complete chunk arrives', () => {
    const driver = new FfmpegDriver({ width: 2, height: 2 }); // frameSize = 12
    const frames: Frame[] = [];
    driver.output.stream$.subscribe(f => frames.push(f));
    driver.start();

    mockProcess.stdout.emit('data', Buffer.alloc(2 * 2 * 3));

    expect(frames).toHaveLength(1);
    expect(frames[0].getPartsName()).toEqual(['video']);
    expect(frames[0].getPart('video')).toHaveLength(12);
  });

  it('uses a custom partName in emitted Frames', () => {
    const driver = new FfmpegDriver({ width: 2, height: 2, partName: 'camera' });
    const frames: Frame[] = [];
    driver.output.stream$.subscribe(f => frames.push(f));
    driver.start();

    mockProcess.stdout.emit('data', Buffer.alloc(2 * 2 * 3));

    expect(frames[0].getPartsName()).toEqual(['camera']);
  });

  it('buffers partial chunks and emits when complete', () => {
    const driver = new FfmpegDriver({ width: 2, height: 2 }); // frameSize = 12
    const frames: Frame[] = [];
    driver.output.stream$.subscribe(f => frames.push(f));
    driver.start();

    mockProcess.stdout.emit('data', Buffer.alloc(4));
    expect(frames).toHaveLength(0);
    mockProcess.stdout.emit('data', Buffer.alloc(4));
    expect(frames).toHaveLength(0);
    mockProcess.stdout.emit('data', Buffer.alloc(4));
    expect(frames).toHaveLength(1);
  });

  it('emits multiple frames from a single large chunk', () => {
    const driver = new FfmpegDriver({ width: 2, height: 2 }); // frameSize = 12
    const frames: Frame[] = [];
    driver.output.stream$.subscribe(f => frames.push(f));
    driver.start();

    // 2 full frames + 6 bytes leftover
    mockProcess.stdout.emit('data', Buffer.alloc(12 * 2 + 6));

    expect(frames).toHaveLength(2);
  });

  it('kills the process on stop()', () => {
    const driver = new FfmpegDriver();
    driver.start();
    driver.stop();
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('stop() is safe when not started', () => {
    const driver = new FfmpegDriver();
    expect(() => driver.stop()).not.toThrow();
  });
});
