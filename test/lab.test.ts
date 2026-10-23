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
  browser = await chromium.launch();
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
  await page.evaluate("import('/src/ui/lab.ts').then(m => window.testLab = m)");
  return page;
}

it('blocks recording-off sends, then queues linked feedback with a trimmed remembered name', async () => {
  const page = await feedbackPage();
  try {
    const result = await page.evaluate(async () => {
      const { lab, openFeedback } = (window as unknown as { testLab: typeof import('../src/ui/lab.ts') })
        .testLab;
      const calls: unknown[] = [];
      lab.sendFeedback = async (note: string, options: unknown) => {
        calls.push({ note, options });
        return 'queued-test';
      };
      localStorage.setItem('hf-lab-recording-off', '1');
      const dialog = openFeedback(() => ({ seed: 1, inputs: [], minute: 420 }));
      const send = dialog.querySelector<HTMLButtonElement>('button[type=submit]')!;
      const blocked = send.disabled;
      dialog.querySelector<HTMLInputElement>('.sw-recording input')!.click();
      const enabled = !send.disabled;
      dialog.querySelector<HTMLTextAreaElement>('textarea')!.value = 'Wanted to see the trip.';
      dialog.querySelector<HTMLInputElement>('input[type=text]')!.value = '  tester  ';
      dialog.querySelector<HTMLInputElement>('input[value=keep]')!.click();
      dialog.querySelector('form')!.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const status = dialog.querySelector('[role=status]')!.textContent;
      const actionBottom = send.getBoundingClientRect().bottom;
      dialog.close();
      const reopened = openFeedback(() => ({}));
      const prefill = reopened.querySelector<HTMLInputElement>('input[type=text]')!.value;
      reopened.close();
      return {
        blocked,
        enabled,
        calls,
        status,
        prefill,
        actionBottom,
        scroll: document.scrollingElement!.scrollHeight,
      };
    });
    expect(result.blocked).toBe(true);
    expect(result.enabled).toBe(true);
    expect(result.calls).toEqual([
      { note: 'Verdict: keep\n\nWanted to see the trip.', options: { name: 'tester' } },
    ]);
    expect(result.status).toBe('Sent. Thank you.');
    expect(result.prefill).toBe('tester');
    expect(result.actionBottom).toBeLessThanOrEqual(690);
    expect(result.scroll).toBe(690);
  } finally {
    await page.close();
  }
});

it('requires privacy consent and sends the run with its note and name', async () => {
  const page = await feedbackPage(true);
  try {
    const result = await page.evaluate(async () => {
      const { lab, openFeedback } = (window as unknown as { testLab: typeof import('../src/ui/lab.ts') })
        .testLab;
      const calls: unknown[] = [];
      lab.sendRun = async (run: unknown, options: unknown) => {
        calls.push({ run, options });
        return 'test';
      };
      const dialog = openFeedback(() => ({ seed: 3, inputs: [], minute: 500 }));
      const blocked = dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled;
      dialog.querySelector<HTMLInputElement>('.sw-recording input')!.click();
      dialog.querySelector<HTMLTextAreaElement>('textarea')!.value = 'Private note';
      dialog.querySelector<HTMLInputElement>('input[type=text]')!.value = 'Private tester';
      dialog.querySelector('form')!.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 10));
      dialog.close();
      return { blocked, calls };
    });
    expect(result.blocked).toBe(true);
    expect(result.calls).toEqual([
      {
        run: { seed: 3, inputs: [], minute: 500 },
        options: { note: 'Private note', name: 'Private tester' },
      },
    ]);
  } finally {
    await page.close();
  }
});

it('preserves the verdict, note and name in an interactive fallback dialog', async () => {
  const page = await feedbackPage(true);
  try {
    await page.evaluate(async () => {
      const { lab, openFeedback } = (window as unknown as { testLab: typeof import('../src/ui/lab.ts') })
        .testLab;
      lab.sendRun = async () => {
        throw new Error('Test send failure');
      };
      const dialog = openFeedback(() => ({ seed: 4, inputs: [], minute: 420 }));
      dialog.querySelector<HTMLInputElement>('.sw-recording input')!.click();
      dialog.querySelector<HTMLInputElement>('input[value=mixed]')!.click();
      dialog.querySelector<HTMLTextAreaElement>('textarea')!.value = 'Fallback note';
      dialog.querySelector<HTMLInputElement>('input[type=text]')!.value = 'Fallback tester';
      dialog.querySelector('form')!.requestSubmit();
    });
    const fallback = page.locator('dialog.sw-feedback .hflab-veil');
    await fallback.waitFor();
    expect(await fallback.locator('textarea').first().inputValue()).toBe('Verdict: mixed\n\nFallback note');
    expect(await fallback.locator('#hflab-name').inputValue()).toBe('Fallback tester');
    await fallback.getByRole('button', { name: 'Not now', exact: true }).click();
    expect(await fallback.count()).toBe(0);
    expect(await page.locator('dialog.sw-feedback').isVisible()).toBe(true);
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
      return { text: controls.textContent, speed, pressed: fast.getAttribute('aria-pressed') };
    });
    expect(result.text).toContain('Game minutes per real second: Automatic 6 · Slow 3 · Steady 6 · Fast 12.');
    expect(result.text).toContain('Your choice applies during travel, work and quiet time.');
    expect(result.text).toContain(
      'While you are idle, open orders slow time to 0.6. Your chosen rate resumes when no orders remain or you start travel or work.',
    );
    expect(result.text).toContain('Conversation and reading pause time until you close them.');
    expect(result.speed).toBe(12);
    expect(result.pressed).toBe('true');
  } finally {
    await page.close();
  }
});
