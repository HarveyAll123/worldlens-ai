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
    // Who reported it and where they are based; a country shows on the globe, outlined.
    const coverage = page.getByTestId('coverage-perspectives');
    await expect(coverage.getByTestId('coverage-publisher').first()).toBeVisible();
    await expect(coverage).toContainText('Pacific Wire (demo)');
    const country = coverage.getByTestId('coverage-country').first();
    await expect(country).toHaveAttribute('aria-pressed', 'false');
    await country.click();
    await expect(country).toHaveAttribute('aria-pressed', 'true');
    await country.click();
    await expect(country).toHaveAttribute('aria-pressed', 'false');
    await expect(coverage).toContainText('Illustrative rating (demo)');
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

  test('news since 2000: its own group under the rest; a pick goes to its day', async ({
    page,
  }) => {
    // The test API has no Wikipedia: the bar's past-news answers are stubbed in the browser.
    const id = 'wnews-2011-03-14-0123456789ab';
    const title =
      'A hydrogen explosion damages a reactor building at the nuclear plant in Ōkuma, Japan.';
    const time = { start: '2011-03-14T00:00:00Z', precision: 'day', approximate: false };
    const location = {
      name: 'Ōkuma, Japan',
      lat: 37.4,
      lon: 141.03,
      precision: 'city',
      countryCode: 'JPN',
      confidence: 0.8,
    };
    const event = {
      id,
      kind: 'news',
      isDemo: false,
      title,
      summary: title,
      category: 'disaster',
      tags: ['Fukushima Daiichi nuclear disaster'],
      time,
      location,
      extraLocations: [],
      participants: [],
      references: [
        {
          title: 'Current events, 2011-03-14',
          url: 'https://en.wikipedia.org/wiki/Portal:Current_events/2011_March_14',
          publisher: 'Wikipedia',
          kind: 'encyclopedia',
          license: 'CC BY-SA 4.0',
        },
      ],
      importance: 2,
      confidence: 0.9,
      articleCount: 1,
      sourceCount: 1,
      hasTakeAction: false,
      provenance: { provider: 'wikipedia', retrievedAt: '2026-11-10T00:00:00Z' },
      updatedAt: '2011-03-14T00:00:00Z',
    };
    const searched: string[] = [];
    await page.route('**/api/config', async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { news: Record<string, unknown> };
      await route.fulfill({ response: res, json: { ...body, news: { ...body.news, past: true } } });
    });
    await page.route('**/api/search/past?*', async (route) => {
      searched.push(new URL(route.request().url()).searchParams.get('q')!);
      await route.fulfill({
        json: {
          available: true,
          results: [
            {
              type: 'NEWS',
              id,
              title,
              subtitle: location.name,
              lat: location.lat,
              lon: location.lon,
              altitude: 250_000,
              time,
              eventId: id,
              isDemo: false,
              score: 9,
            },
          ],
        },
      });
    });
    await page.route(`**/api/events/${id}`, (route) =>
      route.fulfill({ json: { event, actions: [] } }),
    );
    await openApp(page);
    await page.getByTestId('search-input').fill('Fukushima');
    await expect(page.getByTestId('search-past-heading')).toHaveText('News since 2000 · Wikipedia');
    const past = page.getByTestId('search-result-past');
    await expect(past).toContainText('hydrogen explosion');
    await expect(past).toContainText('14 Mar 2011 · Ōkuma, Japan');
    // One search after typing pauses, not one per letter.
    expect(searched).toEqual(['Fukushima']);
    await past.click();
    await expect(page.getByTestId('historical-time')).toHaveText('14 MAR 2011');
    await expect(page.getByTestId('event-title')).toContainText('hydrogen explosion');
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

test.describe('place names and clusters', () => {
  /** The app's store (Vite serves one instance of each module). */
  const store = `
    const url = performance.getEntriesByType('resource').map((e) => e.name)
      .find((n) => n.includes('/src/state/store.ts'));
    const { useAppStore } = await import(/* @vite-ignore */ url);`;

  test('cities, rivers, seas and mountains are named — never over events or each other', async ({
    page,
  }) => {
    // Jumps instead of flights: each view settles at once.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page);
    type Check = { names: number; obstacles: number; overlaps: { name: string; with: string }[] };
    // The globe loads after the page: no names until it has.
    const check = () =>
      page.evaluate(
        () =>
          (
            window as unknown as { __worldlens?: { labelCheck?: () => Check } }
          ).__worldlens?.labelCheck?.() ?? { names: 0, obstacles: 0, overlaps: [] },
      );
    await expect.poll(async () => (await check()).names, { timeout: 30_000 }).toBeGreaterThan(0);
    const views = [
      { lat: 22, lon: 60, altitudeKm: 19_000 },
      { lat: 47, lon: 10, altitudeKm: 2500 },
      { lat: 35, lon: 105, altitudeKm: 5000 },
      { lat: 40, lon: -95, altitudeKm: 4000 },
      { lat: 30, lon: 31, altitudeKm: 1200 },
      { lat: 51.5, lon: -0.1, altitudeKm: 300 },
    ];
    for (const v of views) {
      await page.evaluate(
        new Function(
          'v',
          `return (async () => { ${store} useAppStore.getState().flyTo(v); })()`,
        ) as (v: unknown) => Promise<void>,
        v,
      );
      await page.waitForTimeout(1500);
      const c = await check();
      expect(c.names, `names at ${JSON.stringify(v)}`).toBeGreaterThan(0);
      expect(c.overlaps, `overlaps at ${JSON.stringify(v)}`).toEqual([]);
    }
    // Off in the settings: no names.
    await page.evaluate(
      new Function(
        `return (async () => { ${store} useAppStore.getState().setLayer('places', false); })()`,
      ) as () => Promise<void>,
    );
    await expect.poll(async () => (await check()).names).toBe(0);
  });

  test('marking a place: shown, named under the top bar, cleared with ×', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
      const url = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .find((n) => n.includes('/src/ai/actionExecutor.ts'))!;
      const ex = (await import(/* @vite-ignore */ url)) as {
        runActions: (raw: unknown[]) => unknown;
      };
      ex.runActions([{ tool: 'highlight_place', args: { name: 'Nile', kind: 'river' } }]);
    });
    const chip = page.getByTestId('mark-chip');
    await expect(chip).toContainText('Nile');
    await expect(chip).toContainText('river');
    await page.getByTestId('mark-chip-clear').click();
    await expect(chip).toHaveCount(0);
  });

  test('a clicked cluster lists its events (news, history, battles) with Zoom in', async ({
    page,
  }) => {
    await openApp(page);
    const ids = await page
      .getByTestId('event-list-item')
      .evaluateAll((rows) => rows.slice(0, 3).map((r) => r.getAttribute('data-event-id')));
    await page.evaluate(
      new Function(
        'ids',
        `return (async () => { ${store} useAppStore.getState().setPlacePicker({ ids, x: 420, y: 320, zoomTo: { lat: 20, lon: 10, altitudeKm: 900 } }); })()`,
      ) as (ids: unknown) => Promise<void>,
      ids,
    );
    const picker = page.getByTestId('place-picker');
    await expect(picker).toBeVisible();
    await expect(picker.getByTestId('place-picker-item')).toHaveCount(ids.length);
    await picker.getByTestId('place-picker-zoom').click();
    await expect(picker).toHaveCount(0);
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
    // Wide screens: the opened event shows in the card while the chat stays docked beside it.
    await expect(page.getByTestId('assistant-dock').getByTestId('assistant-reply')).toContainText(
      'LIVE',
    );
  });

  test('wide screens: the chat docks on the left, events open beside it', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('open-assistant').click();
    const dock = page.getByTestId('assistant-dock');
    await expect(dock).toBeVisible();
    // The card on the right keeps the events; a picked event opens there, the chat stays.
    await page.getByTestId('event-list-item').filter({ hasText: 'Taiwan Strait' }).click();
    await expect(page.getByTestId('event-title')).toContainText('Taiwan Strait');
    await expect(dock).toBeVisible();
    const chat = (await dock.boundingBox())!;
    const card = (await page.getByTestId('context-panel').boundingBox())!;
    expect(chat.x + chat.width).toBeLessThan(card.x);
    // A question of the user's own about the event, asked from the card (in Chat mode, so the
    // answer cannot open another event in the card).
    await dock.getByTestId('ai-mode-chat').click();
    await page.getByTestId('ask-ai-custom').click();
    await page.getByTestId('ask-ai-custom-input').fill('Which navies are taking part?');
    await page.keyboard.press('Enter');
    await expect(dock.getByText('Which navies are taking part?', { exact: true })).toHaveCount(1);
    await expect(dock.getByTestId('forwarded-from')).toContainText('Taiwan Strait');
    await expect(dock.getByTestId('assistant-reply')).toBeVisible();
    // The card is back on the button, still showing the event.
    await expect(page.getByTestId('ask-ai-custom')).toBeVisible();
    await expect(page.getByTestId('event-title')).toContainText('Taiwan Strait');
    // Ask AI closes the docked chat again.
    await page.getByTestId('open-assistant').click();
    await expect(dock).toHaveCount(0);
  });

  test('"Ask AI" prompts on an event are sent to the assistant', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('event-list-item').filter({ hasText: 'Taiwan Strait' }).click();
    await expect(page.getByTestId('event-title')).toContainText('Taiwan Strait');
    // Three prompts fitted to the event (several sources → a coverage comparison).
    await expect(page.getByTestId('ask-ai-prompt')).toHaveCount(3);
    const question = 'How are different sources covering this?';
    await page.getByRole('button', { name: question }).click();
    await expect(page.getByTestId('assistant-reply')).toBeVisible();
    // The question shows which event it was asked from.
    await expect(page.getByTestId('forwarded-from')).toContainText('Taiwan Strait');
    // Asked once, although StrictMode runs the panel's mount effect twice in development.
    await expect(page.getByTestId('assistant').getByText(question, { exact: true })).toHaveCount(1);
  });

  test.describe('narrower screens: the chat and the events share one card', () => {
    test.use({ viewport: { width: 1100, height: 800 } });

    test('an event picked while chatting shows at once', async ({ page }) => {
      // Chat mode: an answer that opens an event would hand it the card by itself.
      await page.addInitScript(() => localStorage.setItem('worldlens.aiAgent', '0'));
      await openApp(page);
      await page.getByTestId('event-list-item').filter({ hasText: 'Taiwan Strait' }).click();
      await page.getByTestId('ask-ai-prompt').first().click();
      // The question takes the card over to the chat…
      await expect(page.getByTestId('assistant-reply')).toBeVisible();
      await expect(page.getByTestId('assistant-dock')).toHaveCount(0);
      await expect(page.getByTestId('event-detail')).toHaveCount(0);
      // …and opening the event from it turns the card back (it used to need Ask AI closed).
      await page.getByTestId('forwarded-from').click();
      await expect(page.getByTestId('event-title')).toContainText('Taiwan Strait');
      await expect(page.getByTestId('open-assistant')).toHaveAttribute('aria-pressed', 'false');
    });
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

test.describe('accounts (test mailbox; accounts in memory)', () => {
  test('sign up with email, confirm the code, finish the profile; history and settings; sign in by username', async ({
    page,
  }) => {
    const stamp = `${Date.now() % 1_000_000}`;
    const email = `e2e-${stamp}@example.com`;
    const password = 'river stone lantern';
    await openApp(page, '/', { signInDialog: true });
    const dialog = page.getByTestId('auth-dialog');
    await expect(dialog.getByTestId('auth-sign-in')).toBeVisible();
    await expect(dialog.getByTestId('auth-guest')).toBeVisible();
    await dialog.getByTestId('auth-to-sign-up').click();
    await dialog.getByTestId('auth-email').fill(email);
    await dialog.getByTestId('auth-new-password').fill('short');
    await dialog.getByTestId('auth-confirm-password').fill('short');
    await dialog.getByTestId('auth-submit').click();
    await expect(dialog).toContainText('at least 12 characters');
    await dialog.getByTestId('auth-new-password').fill(password);
    await dialog.getByTestId('auth-confirm-password').fill(password);
    await dialog.getByTestId('auth-submit').click();
    await expect(dialog.getByTestId('auth-verify')).toContainText(email);
    const mail = (await (await page.request.get(`/api/test/mail?to=${email}`)).json()) as {
      code: string;
    };
    await dialog.getByTestId('auth-code').fill(mail.code);
    await dialog.getByTestId('auth-submit').click();

    // Name (last name optional) and a free username.
    await expect(dialog.getByTestId('auth-profile')).toBeVisible();
    await dialog.getByTestId('profile-first-name').fill('Ada');
    await dialog.getByTestId('profile-username').fill(`ada_${stamp}`);
    await expect(dialog).toContainText('is available');
    await dialog.getByTestId('auth-submit').click();
    await expect(dialog).toBeHidden();

    // What the account opens is its history.
    await page.getByTestId('event-list-item').filter({ hasText: 'Taiwan Strait' }).click();
    await expect(page.getByTestId('event-title')).toContainText('Taiwan Strait');
    await page.getByTestId('account-button').click();
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('history-item').first()).toContainText('Taiwan Strait');

    // Searches are kept too; the history has its own search; deleting always asks first.
    await page.keyboard.press('Escape');
    await page.getByTestId('search-input').fill('Waterloo');
    await expect(page.getByTestId('search-result').first()).toContainText('Battle of Waterloo');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('event-title')).toHaveText('Battle of Waterloo');
    await page.getByTestId('account-button').click();
    await page.getByTestId('menu-history').click();
    const items = page.getByTestId('history-item');
    await expect(items.filter({ hasText: '“Waterloo”' })).toContainText('chose Battle of Waterloo');
    await page.getByTestId('history-search').fill('taiwan');
    await expect(items).toHaveCount(1);
    await page.getByTestId('history-search').fill('');
    await page.getByTestId('history-filter-search').click();
    await expect(items).toHaveCount(1);
    await page.getByTestId('history-filter-all').click();
    // An entry takes you back to what you saw (a news story: back to LIVE).
    await items.filter({ hasText: 'Taiwan Strait' }).click();
    await expect(page.getByTestId('account-panel')).toHaveCount(0);
    await expect(page.getByTestId('event-title')).toContainText('Taiwan Strait');
    await expect(page.getByTestId('live-status')).toBeVisible();

    // Ask AI suggests from what this account did; the AI settings decide what it may read.
    await page.getByTestId('open-assistant').click();
    await expect(page.getByTestId('assistant')).toContainText('For you');
    await expect(page.getByTestId('assistant')).toContainText('Battle of Waterloo');
    await page.getByTestId('open-assistant').click();
    await page.getByTestId('account-button').click();
    await page.getByTestId('menu-ai-settings').click();
    await expect(page.getByTestId('ai-memory')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('ai-reads-history').click();
    await expect(page.getByTestId('ai-reads-history')).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('ai-reads-history').click();
    await expect(page.getByTestId('ai-reads-history')).toHaveAttribute('aria-checked', 'true');

    await page.getByTestId('account-tab-history').click();
    await page.getByTestId('history-select').click();
    await items.filter({ hasText: 'Taiwan Strait' }).click();
    await page.getByTestId('history-delete-selected').click();
    await expect(page.getByTestId('account-confirm')).toContainText('cannot be undone');
    await page.getByTestId('account-confirm-yes').click();
    await expect(items.filter({ hasText: 'Taiwan Strait' })).toHaveCount(0);
    await expect(items.filter({ hasText: 'Waterloo' }).first()).toBeVisible();
    await page.getByTestId('history-delete-all').click();
    await expect(page.getByTestId('account-confirm')).toContainText('whole history');
    await page.getByTestId('account-confirm-yes').click();
    await expect(page.getByTestId('history-empty')).toBeVisible();

    // A new username is confirmed first, then waits a month.
    await page.getByTestId('account-tab-settings').click();
    await page.getByTestId('account-new-username').fill(`ada.l_${stamp}`);
    await expect(page.getByTestId('account-settings')).toContainText('is available');
    await page.getByTestId('account-change-username').click();
    await expect(page.getByTestId('account-confirm')).toContainText('for a month');
    await page.getByTestId('account-confirm-yes').click();
    await expect(page.getByTestId('account-username')).toHaveText(`@ada.l_${stamp}`);
    await expect(page.getByTestId('account-username-wait')).toBeVisible();

    // The assistant only points in account settings: it opens them scrolled to a section, marked
    // for a moment; the user does the rest.
    await page.evaluate(async () => {
      const url = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .find((n) => n.includes('/src/ai/actionExecutor.ts'))!;
      const ex = (await import(/* @vite-ignore */ url)) as {
        runActions: (raw: unknown[]) => unknown;
      };
      ex.runActions([{ tool: 'open_panel', args: { panel: 'account', section: 'password' } }]);
    });
    const pointed = page.locator('[data-account-section="password"]');
    await expect(pointed).toHaveClass(/ring-1/);
    await expect(pointed).toBeInViewport();
    await expect(pointed).not.toHaveClass(/ring-1/, { timeout: 6000 });

    // A new email waits for its code — also after a reload — and the change can be cancelled.
    await page.getByTestId('account-change-email').click();
    await page.getByTestId('account-new-email').fill(`new-${email}`);
    await page.getByTestId('account-send-email-code').click();
    await expect(page.getByTestId('account-confirm')).toContainText('keeps using');
    await page.getByTestId('account-confirm-yes').click();
    await expect(page.getByTestId('account-email-pending')).toContainText(`new-${email}`);
    await page.reload();
    await page.getByTestId('account-button').click();
    await page.getByTestId('menu-settings').click();
    await expect(page.getByTestId('account-email-pending')).toContainText(`new-${email}`);
    await page.getByTestId('account-cancel-email').click();
    await expect(page.getByTestId('account-email-message')).toContainText('cancelled');
    await expect(page.getByTestId('account-email')).toHaveText(email);

    // Signed out, then back in with the username.
    await page.getByTestId('account-sign-out').click();
    await page.getByTestId('account-button').click();
    await dialog.getByTestId('auth-login').fill(`ada.l_${stamp}`);
    await dialog.getByTestId('auth-password').fill(password);
    await dialog.getByTestId('auth-submit').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('account-button')).toHaveAttribute('aria-label', /ada\.l_/);

    // Deleting the account asks first and needs the password; then it is gone.
    await page.getByTestId('account-button').click();
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('account-delete').click();
    await expect(page.getByTestId('account-delete-confirm')).toContainText('cannot be undone');
    await expect(page.getByTestId('account-delete-yes')).toBeDisabled();
    await page.getByTestId('account-delete-password').fill('not the password at all');
    await page.getByTestId('account-delete-yes').click();
    await expect(page.getByTestId('account-delete-message')).toContainText('not right');
    await page.getByTestId('account-delete-password').fill(password);
    await page.getByTestId('account-delete-yes').click();
    await expect(dialog).toContainText('were deleted');
    await expect(page.getByTestId('account-button')).toHaveAttribute('aria-label', 'Sign in');
  });

  test('guests: no account settings or history; the AI still answers', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    await page.getByTestId('account-button').click();
    await expect(page.getByTestId('auth-sign-in')).toBeVisible();
    await page.getByTestId('auth-guest').click();
    await page.getByTestId('open-assistant').click();
    await page.getByTestId('assistant-input').fill('Return to live');
    await page.getByTestId('assistant-send').click();
    await expect(page.getByTestId('assistant-reply')).toBeVisible();
    // Nothing is kept for the next visit.
    await page.reload();
    await page.getByTestId('open-assistant').click();
    await expect(page.getByTestId('assistant-reply')).toHaveCount(0);
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
