import { expect, test } from '@playwright/test';
import { mockPayPalSdk, openApp } from './helpers';

test.describe('globe, time and events', () => {
  test('starts the globe in LIVE mode with a real UTC clock', async ({ page }) => {
    await openApp(page);
    const live = page.getByTestId('live-status');
    await expect(live).toContainText('LIVE');
    await expect(live).toContainText(/\d{1,2} [A-Z]{3} \d{4}/);
    await expect(live).toContainText(/\d{2}:\d{2}:\d{2} UTC/);
    const first = await live.innerText();
    await page.waitForTimeout(1500);
    expect(await live.innerText()).not.toBe(first); // the clock ticks
    await expect(page.getByTestId('globe').locator('canvas')).toBeVisible();
  });

  test('shows "Before 1800 — Coming Soon" and never goes before 1800', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('coming-soon')).toHaveText('Before 1800 — Coming Soon');
    const slider = page.getByTestId('timeline-track');
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('historical-status')).toContainText('Historical');
    await expect(page.getByTestId('historical-time')).toHaveText('1800');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('historical-time')).toHaveText('1800');
    await expect(slider).toHaveAttribute('aria-valuetext', '1800');
  });

  test('keyboard timeline navigation and Return to Live', async ({ page }) => {
    await openApp(page);
    const slider = page.getByTestId('timeline-track');
    await slider.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.getByTestId('historical-time')).toHaveText('1810');
    await page.getByTestId('return-to-live').click();
    await expect(page.getByTestId('live-status')).toBeVisible();
    await slider.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('End');
    await expect(page.getByTestId('live-status')).toBeVisible();
  });

  test('selecting a current (demo) event shows summary, sources and perspectives', async ({
    page,
  }) => {
    await openApp(page);
    await page.getByTestId('event-list-item').filter({ hasText: 'Taiwan Strait' }).click();
    await expect(page.getByTestId('event-title')).toContainText('Taiwan Strait');
    await expect(page.getByTestId('demo-banner')).toContainText('DEMO');
    await expect(page.getByTestId('source-coverage')).toContainText('Pacific Wire (demo)');
    await expect(page.getByTestId('coverage-perspectives')).toContainText('National perspective');
    await expect(page.getByTestId('coverage-perspectives')).toContainText('UNRATED');
    await page.getByTestId('compare-framing').click();
    await expect(page.getByTestId('source-framing')).toContainText('Differences in framing');
    await expect(page.getByTestId('source-framing')).toContainText(/claim|allegation/i);
    await expect(page.getByTestId('historical-context')).toContainText(
      'Third Taiwan Strait Crisis',
    );
  });

  test('THEN ↔ NOW moves both the timeline and the globe', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('event-list-item').filter({ hasText: 'Scarborough' }).click();
    await page.getByTestId('context-item').filter({ hasText: 'arbitration' }).click();
    await expect(page.getByTestId('historical-time')).toHaveText('12 JUL 2016');
    await expect(page.getByTestId('event-title')).toContainText('arbitration');
  });
});

test.describe('history and search', () => {
  test('search "Waterloo" opens the historical event with a Wikipedia link', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('search-input').fill('Waterloo');
    await expect(page.getByTestId('search-result').first()).toContainText('Battle of Waterloo');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('historical-time')).toHaveText('18 JUN 1815');
    await expect(page.getByTestId('event-title')).toHaveText('Battle of Waterloo');
    const link = page.getByTestId('learn-more').getByRole('link', { name: /Read on Wikipedia/ });
    await expect(link).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Battle_of_Waterloo');
    // Wikipedia is unreachable in CI: the curated summary still shows (history provider failure).
    await expect(page.getByTestId('event-detail')).toContainText('Wellington');
  });

  test('keyboard search: "/" focuses, "Berlin 1945" moves to 1945', async ({ page }) => {
    await openApp(page);
    await page.locator('body').click({ position: { x: 600, y: 400 } });
    await page.keyboard.press('/');
    await expect(page.getByTestId('search-input')).toBeFocused();
    await page.keyboard.type('Berlin 1945');
    await expect(page.getByTestId('search-result').first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('historical-time')).toHaveText('1945');
  });
});

test.describe('AI assistant (offline fallback — no API key in CI)', () => {
  test('"What is happening near Taiwan?" returns to live, flies and opens an event', async ({
    page,
  }) => {
    await openApp(page);
    await page.getByTestId('timeline-track').focus();
    await page.keyboard.press('Home');
    await page.getByTestId('open-assistant').click();
    await page.getByTestId('assistant-input').fill('What is happening near Taiwan?');
    await page.getByTestId('assistant-send').click();
    await expect(page.getByTestId('event-title')).toContainText('Taiwan');
    await expect(page.getByTestId('live-status')).toBeVisible();
    // The opened event takes over the context card; Ask AI brings the conversation back.
    await page.getByTestId('open-assistant').click();
    await expect(page.getByTestId('assistant-reply')).toContainText('LIVE');
  });

  test('"Ask AI" prompts on an event are sent to the assistant', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('event-list-item').filter({ hasText: 'Taiwan Strait' }).click();
    await expect(page.getByTestId('event-title')).toContainText('Taiwan Strait');
    const question = 'How are different sources covering this?';
    await page.getByRole('button', { name: question }).click();
    await expect(page.getByTestId('assistant-reply')).toBeVisible();
    // Asked once, although StrictMode runs the panel's mount effect twice in development.
    await expect(page.getByTestId('assistant').getByText(question, { exact: true })).toHaveCount(1);
  });

  test('AI failure path still answers (offline assistant notice)', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('open-assistant').click();
    await page.getByTestId('assistant-input').fill('Return to live');
    await page.getByTestId('assistant-send').click();
    await expect(page.getByTestId('assistant-reply')).toContainText(
      /Offline assistant|AI is not configured/,
    );
  });
});

test.describe('Take Action — PayPal sandbox (REST + SDK test doubles)', () => {
  test('explicit approval → server-verified capture', async ({ page }) => {
    await mockPayPalSdk(page, 'approve');
    await openApp(page);
    await page.getByTestId('event-list-item').filter({ hasText: 'Sulawesi' }).click();
    await page.getByTestId('review-action').click();
    const modal = page.getByTestId('take-action-modal');
    await expect(modal.getByTestId('sandbox-banner')).toHaveText(
      'SANDBOX DEMO — NO REAL MONEY TRANSFERRED',
    );
    await expect(modal).toContainText('WorldLens Sandbox Relief Fund');
    // PayPal is not loaded until the user acknowledges the sandbox terms.
    await expect(modal.getByTestId('paypal-button')).toHaveCount(0);
    await modal.getByTestId('amount-input').fill('25');
    await modal.getByTestId('sandbox-ack').check();
    await modal.getByTestId('paypal-button').click();
    const result = modal.getByTestId('payment-result');
    await expect(result).toHaveAttribute('data-state', 'CAPTURED');
    await expect(result).toContainText('25.00 USD');
    await expect(result).toContainText(/Capture ID/);
    await expect(result).toContainText('PayPal Orders API capture response');
  });

  test('cancellation in PayPal never reports success', async ({ page }) => {
    await mockPayPalSdk(page, 'cancel');
    await openApp(page);
    await page.getByTestId('event-list-item').filter({ hasText: 'Sylhet' }).click();
    await page.getByTestId('review-action').click();
    const modal = page.getByTestId('take-action-modal');
    await modal.getByTestId('sandbox-ack').check();
    await modal.getByTestId('paypal-button').click();
    await expect(modal.getByTestId('payment-cancelled')).toContainText('Nothing was charged');
    await expect(modal.getByTestId('payment-result')).toHaveCount(0);
  });

  test('"I have $20" opens the review screen, not a payment', async ({ page }) => {
    await mockPayPalSdk(page, 'approve');
    await openApp(page);
    await page.getByTestId('open-assistant').click();
    await page.getByTestId('quick-prompt').filter({ hasText: '$20' }).click();
    const modal = page.getByTestId('take-action-modal');
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(modal.getByTestId('amount-input')).toHaveValue('20');
    await expect(modal.getByTestId('payment-result')).toHaveCount(0);
  });
});

test.describe('provider failures', () => {
  test('news API failure keeps the globe and shows a notice', async ({ page }) => {
    await page.route('**/api/events?**', (r) =>
      r.fulfill({ status: 503, body: '{"error":"DOWN"}', contentType: 'application/json' }),
    );
    await openApp(page);
    await expect(page.getByTestId('event-list')).toContainText('could not be loaded');
    await expect(page.getByTestId('globe').locator('canvas')).toBeVisible();
  });
});
