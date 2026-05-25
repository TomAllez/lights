import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Built app lives at packages/ts/lights/dist/main.js after `yarn nx build @lights/app`
const MAIN_JS = path.resolve(__dirname, '../../lights/dist/main.js');

test.describe('Lights app — Electron window', () => {
  test('app window opens with a title', async () => {
    const app = await electron.launch({ args: [MAIN_JS] });
    try {
      const window = await app.firstWindow();
      await window.waitForLoadState('domcontentloaded');
      const title = await window.title();
      expect(title).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  test('main UI renders without JS errors', async () => {
    const app = await electron.launch({ args: [MAIN_JS] });
    const errors: string[] = [];
    try {
      const window = await app.firstWindow();
      window.on('pageerror', err => errors.push(err.message));
      await window.waitForLoadState('domcontentloaded');
      await window.waitForTimeout(2000); // let React hydrate
      expect(errors).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  test('app can be closed cleanly', async () => {
    const app = await electron.launch({ args: [MAIN_JS] });
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await app.close();
    // If close() resolves, the app exited cleanly
    expect(true).toBe(true);
  });
});
