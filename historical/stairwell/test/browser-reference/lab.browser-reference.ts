/* biome-ignore-all lint/style/noNonNullAssertion: The test must fail when required controls are missing. */
import { type Browser, chromium, type Page, webkit } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  // WebKit keeps the signed-in Chrome profile out of the synthetic fixture suite.
  browser = await (process.platform === 'darwin' ? webkit : chromium).launch();
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
  // Explicit empty local fixture. This is not evidence of shared admission.
  await page.evaluate(`import('/src/ui/cast-continuity.ts').then(({shelf}) => {
    shelf.request = async (request) => request.action === 'prepareBatch' ? {
      inputs: [], blocked: [],
      expectedHeads: Object.fromEntries((request.castIds ?? []).map(id => [id, null])),
    } : undefined;
  })`);
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
        return 'stored-reference';
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
      expect(result.status).toBe('Sent. Your note is stored. Reference stored-reference.');
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
    await expect
      .poll(() => page.locator('dialog [role=status]').innerText())
      .toContain('Your note could not be sent.');
    expect(await page.locator('.hflab-veil').count()).toBe(0);
    expect(await page.locator('textarea').inputValue()).toBe('Retained note');
  } finally {
    await page.close();
  }
});

it('keeps clock choices in the play information panel, outside the menu', async () => {
  const page = await feedbackPage();
  try {
    await page.getByRole('button', { name: 'Information', exact: true }).click();
    await page.getByText('Clock speed', { exact: true }).click();
    const fast = page.getByRole('button', { name: 'Fast', exact: true });
    await fast.click();
    expect(await fast.getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('.clock-controls').textContent()).toContain(
      'Reading and conversation pause time.',
    );
    await page.getByRole('button', { name: 'Close information', exact: true }).click();
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    expect(await page.locator('dialog .sw-menu-speeds').count()).toBe(0);
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
        return 'stored-reference';
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
        (button) => button.textContent === 'Feedback',
      )!;
      const enabled = !button.disabled;
      button.click();
      document.querySelector<HTMLTextAreaElement>('textarea')!.value = 'Title feedback';
      document.querySelector<HTMLFormElement>('form')!.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { enabled, sent, status: document.querySelector('dialog [role=status]')?.textContent };
    });
    expect(result.enabled).toBe(true);
    expect(result.sent).toBe(true);
    expect(result.status).toBe('Sent. Your note is stored. Reference stored-reference.');
  } finally {
    await page.close();
  }
});

for (const checked of [false, true]) {
  it(`passes privacy share intent ${checked} only at submit`, async () => {
    const page = await feedbackPage(true);
    try {
      await page.evaluate(`(() => {
        const {lab,openFeedback} = window.testLab;
        lab.setTelemetryOff(true);
        window.sent = [];
        lab.sendFeedback = async (...args) => { window.sent.push(args); return 'queued'; };
        openFeedback(() => ({seed:42,inputs:[]}));
      })()`);
      const checkbox = page.getByRole('checkbox', {
        name: 'Share this run and my play with the lab',
        exact: true,
      });
      expect(await checkbox.isChecked()).toBe(false);
      if (checked) await checkbox.check();
      expect(await page.evaluate('window.sent')).toEqual([]);
      await page.locator('dialog[open] form').evaluate((form) => (form as HTMLFormElement).requestSubmit());
      await expect.poll(() => page.evaluate('window.sent.length')).toBe(1);
      expect(await page.evaluate('window.sent[0][1].sharePlay')).toBe(checked);
    } finally {
      await page.close();
    }
  });
}

it('quiet feedback labels send nothing until Submit, then retain run/privacy and the stored receipt', async () => {
  const page = await feedbackPage();
  try {
    const results = await page.evaluate(async () => {
      const { lab, openFeedback } = (window as unknown as { testLab: typeof import('../src/ui/lab.ts') })
        .testLab;
      const calls: { note: string; run: unknown; sharePlay: unknown }[] = [];
      lab.sendFeedback = async (note, options) => {
        calls.push({ note, run: options?.run, sharePlay: options?.sharePlay });
        return 'label-receipt';
      };
      const output = [];
      for (const off of [false, true]) {
        lab.setEventsOff(off);
        const run = { seed: 9, inputs: [], minute: 450 };
        const dialog = openFeedback(() => run);
        const button = [...dialog.querySelectorAll('button')].find((b) => b.textContent === "I'm confused");
        if (!button) throw new Error('Missing released feedback choice');
        const before = calls.length;
        button.click();
        const afterChoice = calls.length;
        dialog.querySelector<HTMLTextAreaElement>('textarea')!.value = 'I could not find the parcel.';
        dialog.querySelector('form')!.requestSubmit();
        await new Promise((resolve) => setTimeout(resolve, 10));
        output.push({
          off,
          before,
          afterChoice,
          note: calls.at(-1)?.note,
          run: calls.at(-1)?.run,
          receipt: dialog.querySelector('[role=status]')?.textContent,
        });
        dialog.close();
      }
      return output;
    });
    for (const result of results) {
      expect(result.afterChoice).toBe(result.before);
      expect(result.note).toBe("I'm confused\n\nI could not find the parcel.");
      expect(result.run).toEqual({ seed: 9, inputs: [], minute: 450 });
      expect(result.receipt).toContain('label-receipt');
    }
  } finally {
    await page.close();
  }
});
