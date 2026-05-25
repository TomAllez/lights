import { writeFileSync } from 'fs';
import { join } from 'path';

function writeSolidColorFixture(options: {
  outPath: string;
  width: number;
  height: number;
  fill: [number, number, number];
  frameCount: number;
}): void {
  const frameSize = options.width * options.height * 3;
  const total = frameSize * options.frameCount;
  const buf = Buffer.alloc(total);
  for (let i = 0; i < total; i += 3) {
    buf[i] = options.fill[0];
    buf[i + 1] = options.fill[1];
    buf[i + 2] = options.fill[2];
  }
  writeFileSync(options.outPath, buf);
  console.log(`Written ${options.outPath} (${(total / 1024).toFixed(1)} KB)`);
}

const dir = join(import.meta.dirname ?? __dirname, '.');

writeSolidColorFixture({
  outPath: join(dir, 'blank-320x240-30f.bin'),
  width: 320,
  height: 240,
  fill: [255, 255, 255],
  frameCount: 30,
});

console.log('Done. Commit the .bin files to the repository.');
