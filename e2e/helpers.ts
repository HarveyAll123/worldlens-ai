import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE_SDK = readFileSync(path.join(here, 'fixtures/fake-paypal-sdk.js'), 'utf8');

/** Serve the PayPal v6 SDK test double instead of the real script (no network in CI). */
export async function mockPayPalSdk(
  page: Page,
  outcome: 'approve' | 'cancel' | 'error' = 'approve',
) {
  await page.addInitScript((o) => {
    (window as unknown as { __FAKE_PAYPAL_OUTCOME: string }).__FAKE_PAYPAL_OUTCOME = o;
  }, outcome);
  await page.route('https://www.sandbox.paypal.com/web-sdk/v6/core**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SDK }),
  );
}

export async function openApp(page: Page, url = '/') {
  await page.goto(url);
  await expect(page.getByTestId('temporal-navigator')).toBeVisible();
  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        __worldlens?: { diagnostics: () => { framesRendered: number } };
      };
      const frames = w.__worldlens?.diagnostics().framesRendered ?? 0;
      return frames > 0 || !!document.querySelector('[data-testid="event-list"]');
    },
    undefined,
    { timeout: 30_000 },
  );
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
