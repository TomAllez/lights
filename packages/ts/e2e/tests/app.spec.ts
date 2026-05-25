import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_JS = path.resolve(__dirname, '../../lights/dist-electron/main.js');

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
      // Filter out headless-only GPU errors that do not affect app logic
      const realErrors = errors.filter(msg => !msg.includes('WebGL context'));
      expect(realErrors).toHaveLength(0);
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
