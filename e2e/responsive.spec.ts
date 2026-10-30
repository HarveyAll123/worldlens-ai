import { expect, test } from '@playwright/test';
import { noHorizontalOverflow, openApp } from './helpers';

const WIDTHS: Array<[string, number, number]> = [
  ['320', 320, 640],
  ['fold-cover', 344, 882],
  ['375', 375, 812],
  ['430', 430, 932],
  ['fold-inner', 707, 823],
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
    // Hour then Day: Day zooms in while LIVE (it used to fall back to the 1800–now overview), and
    // tick labels neither overlap nor run off the track (they piled up on phones).
    const zoom = page.getByRole('group', { name: 'Time resolution' });
    for (const name of [/^(H|Hour)$/, /^(D|Day)$/]) {
      const button = zoom.getByRole('button', { name });
      if (await button.isDisabled()) continue;
      await button.click();
      await expect(page.getByTestId('coming-soon')).toBeHidden();
      const layout = await page.getByTestId('timeline-track').evaluate((track) => {
        const end = track.getBoundingClientRect().right;
        const boxes = [...track.querySelectorAll('span.tabular')].map((s) =>
          s.getBoundingClientRect(),
        );
        return {
          count: boxes.length,
          overlaps: boxes.filter((b, i) => i > 0 && b.left < boxes[i - 1]!.right).length,
          pastEnd: boxes.filter((b) => b.right > end + 0.5).length,
        };
      });
      expect(layout.count).toBeGreaterThan(0);
      expect(layout.overlaps).toBe(0);
      expect(layout.pastEnd).toBe(0);
    }
    if (mobile) {
      // Globe stays primary: details live in a collapsed bottom sheet.
      const sheet = page.getByTestId('bottom-sheet');
      await expect(sheet).toBeVisible();
      const box = await sheet.boundingBox();
      expect(box!.height).toBeLessThan(height * 0.2);
      // Touch-friendly controls. The time dock sits above the collapsed sheet and gives way
      // to the expanded one.
      const track = page.getByTestId('timeline-track');
      const slider = await track.boundingBox();
      expect(slider!.height).toBeGreaterThanOrEqual(40);
      await page.getByTestId('sheet-handle').click();
      await expect(track).toBeHidden();
      await expect(page.getByTestId('event-list')).toBeVisible();
      await page.getByTestId('event-list-item').first().click();
      await expect(page.getByTestId('event-detail')).toBeVisible();
      // Layers is a tab of the same sheet, like Events (phones used to get a popover off screen).
      await page.getByTestId('layers-button').click();
      await expect(page.getByRole('tab', { name: 'Layers' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const layers = page.getByTestId('layers-panel');
      await expect(layers).toBeVisible();
      const panel = (await layers.boundingBox())!;
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(width);
      await layers.getByText('Labels', { exact: true }).click();
      await expect(page.getByTestId('layer-labels')).not.toBeChecked();
      // Each top-bar button has its own tab: the panel button goes back to the events (it used
      // to reopen whatever tab showed last), and tapping it again closes the sheet.
      const eventsButton = page.getByTestId('toggle-context-card');
      await eventsButton.click();
      await expect(page.getByRole('tab', { name: 'Events' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(eventsButton).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByTestId('layers-button')).toHaveAttribute('aria-pressed', 'false');
      await eventsButton.click();
      await expect(page.getByRole('tab', { name: 'Events' })).toBeHidden();
    } else {
      await expect(page.getByTestId('context-panel')).toBeVisible();
      // The Layers popover stays on screen and a click on the globe's canvas closes it (in
      // space, so no country is picked).
      await page.getByTestId('layers-button').click();
      const menu = page.getByRole('dialog', { name: 'Layers and settings' });
      await expect(menu).toBeVisible();
      const box = (await menu.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await page.mouse.click(4, 64);
      await expect(menu).toBeHidden();
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
