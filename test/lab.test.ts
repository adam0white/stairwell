/* biome-ignore-all lint/style/noNonNullAssertion: The test must fail when required controls are missing. */
import { type Browser, chromium, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch(
    process.platform === 'darwin'
      ? {
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        }
      : {},
  );
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 30000);

async function feedbackPage(privacy = false): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  // No test can deliver an event, run or note to the real notebook.
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== new URL(url).origin) return route.abort();
    return route.continue();
  });
  if (privacy) await page.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { value: '1' }));
  await page.goto(url);
  await page.getByRole('button', { name: 'Begin on Monday', exact: true }).click();
  await page.locator('.day').waitFor();
  await page.evaluate(
    "import('/src/ui/lab.ts').then(m => { window.testLab = m; m.lab.setPersonaRecording(null); })",
  );
  return page;
}

it('sends feedback in one sheet with recording off, privacy on, or unanswered continuing history', async () => {
  const page = await feedbackPage();
  try {
    const results = await page.evaluate(async () => {
      const { lab, openFeedback } = (window as unknown as { testLab: typeof import('../src/ui/lab.ts') })
        .testLab;
      const calls: unknown[] = [];
      lab.sendFeedback = async (note, options) => {
        calls.push({ note, options });
        return 'queued';
      };
      const results = [];
      for (const off of [false, true]) {
        lab.setEventsOff(off);
        lab.setPersonaRecording('continuing-test');
        const dialog = openFeedback(() => ({
          seed: 3,
          inputs: [],
          minute: 500,
        }));
        const send = dialog.querySelector<HTMLButtonElement>('button[type=submit]')!;
        const enabled = !send.disabled;
        dialog.querySelector<HTMLTextAreaElement>('textarea')!.value = 'QA feedback-fix';
        dialog.querySelector<HTMLInputElement>('input[value=mixed]')!.click();
        dialog.querySelector('form')!.requestSubmit();
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push({
          enabled,
          status: dialog.querySelector('[role=status]')!.textContent,
          nested: dialog.querySelectorAll('.hflab-veil').length,
        });
        dialog.close();
      }
      return { calls, results };
    });
    expect(results.calls).toHaveLength(2);
    for (const result of results.results) {
      expect(result.enabled).toBe(true);
      expect(result.status).toContain('queued');
      expect(result.nested).toBe(0);
    }
  } finally {
    await page.close();
  }
});

it('keeps a failed send and its note on the original sheet', async () => {
  const page = await feedbackPage(true);
  try {
    await page.evaluate(() => {
      const { lab, openFeedback } = (window as unknown as { testLab: typeof import('../src/ui/lab.ts') })
        .testLab;
      lab.sendFeedback = async () => {
        throw new Error('Test send failure');
      };
      const dialog = openFeedback(() => ({}));
      dialog.querySelector<HTMLTextAreaElement>('textarea')!.value = 'Retained note';
      dialog.querySelector('form')!.requestSubmit();
    });
    await expect.poll(() => page.locator('[role=status]').innerText()).toContain('Test send failure');
    expect(await page.locator('.hflab-veil').count()).toBe(0);
    expect(await page.locator('textarea').inputValue()).toBe('Retained note');
  } finally {
    await page.close();
  }
});

it('explains clock rates and when protected time ends beside the speed choices', async () => {
  const page = await feedbackPage();
  try {
    const result = await page.evaluate(() => {
      const { gameMenu } = (window as unknown as { testLab: typeof import('../src/ui/lab.ts') }).testLab;
      let speed: number | null = null;
      gameMenu({
        getRun: () => ({}),
        beforeOpen: () => {},
        hasRun: true,
        speed: () => speed,
        setSpeed: (value) => {
          speed = value;
        },
      }).click();
      const controls = document.querySelector('.sw-menu-speeds')!;
      const fast = Array.from(controls.querySelectorAll('button')).find(
        (button) => button.textContent === 'Fast',
      )!;
      fast.click();
      return {
        text: controls.textContent,
        speed,
        pressed: fast.getAttribute('aria-pressed'),
      };
    });
    expect(result.text).toContain('Game minutes per real second: Automatic 6 · Slow 3 · Steady 6 · Fast 12.');
    expect(result.text).toContain('Your choice applies during travel, work and quiet time.');
    expect(result.text).toContain(
      'While you are idle, open orders slow time to 0.6. Your chosen rate resumes when no orders remain or you start travel or work.',
    );
    expect(result.text).toContain('Conversation and reading pause time until you close them.');
    expect(result.speed).toBe(12);
    expect(result.pressed).toBe('true');
    const explanationWidths = await page.locator('.sw-menu-speeds').evaluate((fieldset) => {
      const width = fieldset.getBoundingClientRect().width;
      return Array.from(fieldset.querySelectorAll('p'), (p) => p.getBoundingClientRect().width / width);
    });
    expect(explanationWidths).toHaveLength(2);
    for (const fraction of explanationWidths) expect(fraction).toBeGreaterThan(0.9);
  } finally {
    await page.close();
  }
});

it('keeps title-menu feedback available without a run', async () => {
  const page = await feedbackPage();
  try {
    const result = await page.evaluate(async () => {
      const { gameMenu, lab } = (window as unknown as { testLab: typeof import('../src/ui/lab.ts') }).testLab;
      let sent = false;
      lab.sendFeedback = async (_note, options) => {
        sent = true;
        if (options?.run !== undefined) throw new Error('Unexpected run');
        return 'queued';
      };
      gameMenu({
        getRun: () => {
          throw new Error('No active run');
        },
        beforeOpen: () => {},
        hasRun: false,
        speed: () => null,
        setSpeed: () => {},
      }).click();
      const button = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent === 'Send word',
      )!;
      const enabled = !button.disabled;
      button.click();
      document.querySelector<HTMLTextAreaElement>('textarea')!.value = 'Title feedback';
      document.querySelector<HTMLFormElement>('form')!.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { enabled, sent, status: document.querySelector('[role=status]')?.textContent };
    });
    expect(result.enabled).toBe(true);
    expect(result.sent).toBe(true);
    expect(result.status).toContain('Note queued');
  } finally {
    await page.close();
  }
});

it('routes inline history permission through the host and omits only optional ownership from replayable feedback', async () => {
  const page = await feedbackPage();
  try {
    const result = await page.evaluate<{
      choices: boolean[];
      direct: boolean[];
      exported: { continuity: Record<string, unknown> };
      original: { continuity: { recordingFileKey: string } };
      valid: boolean;
      seed: number;
    }>(`(async () => {
      const {lab,openFeedback} = window.testLab;
      const { isSaved } = await import('/src/ui/save.ts');
      const { replay, GAME_VERSION } = await import('/src/sim/game.ts');
      lab.setPersonaRecording('test-group');
      const choices = [];
      const direct = [];
      lab.allowPersonaRecording = (value) => { direct.push(value); };
      let sent;
      lab.sendFeedback = async (_note, extra) => { sent = extra?.run; return 'queued'; };
      const original = { game: GAME_VERSION, seed: 42, inputs: [], minute: 480, continuity: { rows: [], recordingFileKey: 'browser-consent-key' }, castReceipts: { owned: {} } };
      const dialog = openFeedback(() => original, undefined, async (value) => { choices.push(value); });
      const checkbox = dialog.querySelector('label input[type=checkbox]');
      checkbox.click();
      await Promise.resolve();
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
      await Promise.resolve();
      dialog.querySelector('form').requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const exported = sent;
      const decoded = { ...exported, oneCast: exported.continuity };
      const valid = isSaved(decoded);
      const restored = replay(decoded.seed, decoded.inputs, decoded.minute, decoded.game);
      dialog.close();
      return { choices, direct, exported, original, valid, seed: restored.seed };
    })()`);
    expect(result.choices).toEqual([true, false]);
    expect(result.direct).toEqual([]);
    expect(result.exported).not.toHaveProperty('castReceipts');
    expect(result.exported.continuity).not.toHaveProperty('recordingFileKey');
    expect(result.original.continuity.recordingFileKey).toBe('browser-consent-key');
    expect(result.valid).toBe(true);
    expect(result.seed).toBe(42);
  } finally {
    await page.close();
  }
});
