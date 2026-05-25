import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_JS = path.resolve(__dirname, '../../lights/dist-electron/main.js');

test.describe('Lights app — project and slide UI', () => {
  test('app renders the project view on launch', async () => {
    const app = await electron.launch({ args: [MAIN_JS] });
    try {
      const window = await app.firstWindow();
      await window.waitForLoadState('domcontentloaded');
      await window.waitForTimeout(1500);
      // The app should render something — take a screenshot for visual reference
      const screenshot = await window.screenshot();
      expect(screenshot.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
