import { expect, test } from '@playwright/test';
import { noHorizontalOverflow, openApp } from './helpers';

const WIDTHS: Array<[string, number, number]> = [
  ['320', 320, 640],
  ['375', 375, 812],
  ['430', 430, 932],
  ['768', 768, 1024],
  ['desktop', 1440, 900],
  ['ultrawide', 2560, 1080],
];

for (const [name, width, height] of WIDTHS) {
  test(`layout at ${name} (${width}×${height})`, async ({ browser }) => {
    const mobile = width < 768;
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: mobile,
      isMobile: mobile,
    });
    const page = await context.newPage();
    await openApp(page);
    await noHorizontalOverflow(page);
    await expect(page.getByTestId('temporal-navigator')).toBeVisible();
    await expect(page.getByTestId('live-status')).toBeVisible();
    await expect(page.getByTestId('open-assistant')).toBeVisible();
    if (mobile) {
      // Globe stays primary: details live in a collapsed bottom sheet.
      const sheet = page.getByTestId('bottom-sheet');
      await expect(sheet).toBeVisible();
      const box = await sheet.boundingBox();
      expect(box!.height).toBeLessThan(height * 0.2);
      await page.getByTestId('sheet-handle').click();
      await expect(page.getByTestId('event-list')).toBeVisible();
      await page.getByTestId('event-list-item').first().click();
      await expect(page.getByTestId('event-detail')).toBeVisible();
      // Touch-friendly controls
      const slider = await page.getByTestId('timeline-track').boundingBox();
      expect(slider!.height).toBeGreaterThanOrEqual(40);
    } else {
      await expect(page.getByTestId('context-panel')).toBeVisible();
    }
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/layout-${name}.png` });
    await context.close();
  });
}

test('reduced motion is respected', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await openApp(page);
  const anim = await page
    .locator('.live-dot')
    .evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(anim)).toBeLessThan(0.01);
  await context.close();
});
