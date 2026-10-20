import { type Browser, chromium, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { fingerprint, GAME_VERSION, replay } from '../src/sim/game.ts';

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
});

async function visibleInViewport(page: Page, selector: string) {
  const viewport = page.viewportSize();
  for (const element of await page.locator(selector).all()) {
    const box = await element.boundingBox();
    expect(box).not.toBeNull();
    if (!box || !viewport) continue;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(
      await element.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [r.top + 1, r.bottom - 1].every((y) =>
          el.contains(document.elementFromPoint(r.left + r.width / 2, y)),
        );
      }),
    ).toBe(true);
  }
}

it.each([
  [360, 780, 150],
  [412, 891, 220],
  [1440, 900, 220],
])('gives the log room at %ix%i while keeping controls visible', async (width, height, minLogHeight) => {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.clock.install();
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    // A public, deterministic notebook with a long day's history and a resident at the door.
    await page.locator('input[type=file]').setInputFiles({
      name: 'layout.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          game: GAME_VERSION,
          seed: 7,
          inputs: [{ kind: 'go', to: 'door:nermin', at: 420 }],
          minute: 1254,
        }),
      ),
    });
    await page.locator('.verbs').waitFor();
    const journal = page.locator('.journal');
    expect((await journal.boundingBox())?.height).toBeGreaterThanOrEqual(minLogHeight);
    expect(await journal.locator(':scope > div').count()).toBeGreaterThan(4);
    await visibleInViewport(page, '.top button, .scene, .board, .verbs button, .who .x');
    const scroll = await journal.evaluate((el) => {
      const atEnd = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 1;
      el.scrollTop = 0;
      const first = el.firstElementChild?.getBoundingClientRect();
      return { atEnd, firstVisible: !!first && first.top >= el.getBoundingClientRect().top };
    });
    expect(scroll).toEqual({ atEnd: true, firstVisible: true });
    // Reading earlier entries should not be interrupted by opening the notebook.
    await openResidentsNotebook(page);
    expect(await journal.evaluate((el) => el.scrollTop)).toBe(0);
    await page.locator('.sheet [data-a=close]').click();
    // A long notebook remains usable and keeps the newest log entry in view.
    await journal.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await openResidentsNotebook(page);
    expect(
      await journal.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 1),
    ).toBe(true);
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await visibleInViewport(page, '.lk-notebook button');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await visibleInViewport(page, '.day');
  } finally {
    await page.close();
  }
});

async function openResidentsNotebook(page: Page) {
  await page.getByRole('button', { name: 'Game menu', exact: true }).click();
  await page.getByRole('button', { name: 'Read the residents’ notebook', exact: true }).click();
  await page.locator('.sheet .nb').waitFor();
}

async function importNotebook(page: Page, minute = 440) {
  await page.clock.install();
  await page.goto(url);
  await page.locator('input[type=file]').setInputFiles({
    name: 'clarity.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        game: GAME_VERSION,
        seed: 7,
        inputs: [{ kind: 'go', to: 'door:nermin', at: 420 }],
        minute,
      }),
    ),
  });
}

it('explains exhausted news beside Anything new and resets it on a new day', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await importNotebook(page);
    const news = page.locator('[data-a=news]');
    expect(await news.isEnabled()).toBe(true);
    await news.click();
    expect(await news.isDisabled()).toBe(true);
    expect(await news.textContent()).toContain('Already asked today');
    await visibleInViewport(page, '[data-a=news]');
    await page.reload();
    await page.locator('[data-a=continue]').click();
    expect(await page.locator('[data-a=news]').textContent()).toContain('Already asked today');
    await importNotebook(page, 1254);
    await page.locator('[data-a=news]').click();
    await page.clock.runFor(10_000);
    await page.locator('[data-a=next]').click();
    await page.locator('.scene [data-go="door:nermin"]').click();
    await page.clock.runFor(30_000);
    expect(await page.locator('[data-a=news]').isEnabled()).toBe(true);
    expect(await page.locator('[data-a=news]').textContent()).not.toContain('Already asked today');
  } finally {
    await page.close();
  }
});

it.each([
  [360, 690],
  [1280, 800],
])('accents one full task instead of speed at %ix%i', async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.clock.install();
    await page.goto(url);
    await page.locator('[data-a=new]').click();
    expect(await page.locator('.task.current').count()).toBe(1);
    expect(await page.locator('.task.current').textContent()).toContain('bakery');
    await visibleInViewport(page, '.task.current');
    const colors = await page.evaluate(() => ({
      speed: getComputedStyle(document.querySelector('.speed .on') as Element).color,
      task: getComputedStyle(document.querySelector('.task.current') as Element).borderColor,
      ink: getComputedStyle(document.body).color,
    }));
    expect(colors.speed).toBe(colors.ink);
    expect(colors.task).not.toBe(colors.ink);
    expect(await page.locator('.task.current').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  } finally {
    await page.close();
  }
});

it('keeps download and send in one Game menu and resumes the saved day exactly', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await importNotebook(page);
    const before = await page.evaluate(() => localStorage.getItem('stairwell:notebook'));
    await page.reload();
    expect(await page.locator('[data-a=continue]').textContent()).toBe('Continue');
    expect(await page.locator('[data-save-summary]').textContent()).toContain('Monday · 07:20 · flat 1');
    await page.locator('[data-a=continue]').click();
    expect(await page.evaluate(() => localStorage.getItem('stairwell:notebook'))).toBe(before);
    expect(await page.getByRole('button', { name: 'Game menu', exact: true }).count()).toBe(1);
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Game menu', exact: true });
    expect(await menu.getByRole('button', { name: 'Download this run', exact: true }).isVisible()).toBe(true);
    expect(
      await menu.getByRole('button', { name: 'Send this run to the notebook', exact: true }).isVisible(),
    ).toBe(true);
    const downloaded = page.waitForEvent('download');
    await menu.getByRole('button', { name: 'Download this run', exact: true }).click();
    const download = await downloaded;
    const { readFile } = await import('node:fs/promises');
    const run = JSON.parse(await readFile((await download.path()) as string, 'utf8'));
    expect(run.seed).toBe(7);
    expect(run.minute).toBe(440);
    expect(run.inputs).toEqual(JSON.parse(before ?? '{}').inputs);
    expect(run.state.day).toBe(1);
    await menu.getByRole('button', { name: 'Send this run to the notebook', exact: true }).click();
    const send = page.getByRole('dialog', { name: 'Send this run to the notebook', exact: true });
    await send.waitFor();
    expect(await page.getByRole('dialog').count()).toBe(1);
    const compact = (await page.evaluate(
      `import('/src/ui/lab.ts').then(({compactRun}) => compactRun(${JSON.stringify(run)}))`,
    )) as typeof run;
    expect(compact.state).toBeUndefined();
    expect(fingerprint(replay(compact.seed, compact.inputs, compact.minute))).toBe(
      fingerprint(replay(run.seed, run.inputs, run.minute)),
    );
    await page.clock.runFor(10_000);
    expect(await page.locator('.clock').textContent()).toBe('Mon 07:20');
    await page.keyboard.press('Escape');
    expect(
      await page
        .getByRole('button', { name: 'Game menu', exact: true })
        .evaluate((el) => el === document.activeElement),
    ).toBe(true);
    expect(await page.locator('#lab-controls').count()).toBe(0);
  } finally {
    await page.close();
  }
});

it('keeps the mandatory opening short and preserves the original story on request', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const opening = await page.locator('.title > p:not(.soft)').allTextContents();
    expect(opening.join(' ').trim().split(/\s+/).length).toBeLessThanOrEqual(28);
    await page.getByText('More about the job', { exact: true }).click();
    expect(await page.getByText(/Rıza Efendi kept the door/).isVisible()).toBe(true);
  } finally {
    await page.close();
  }
});

it('does not offer Continue for a malformed saved notebook', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    await page.evaluate(
      (game) => localStorage.setItem('stairwell:notebook', JSON.stringify({ game, seed: 7, inputs: null })),
      GAME_VERSION,
    );
    await page.reload();
    expect(await page.locator('[data-a=continue]').count()).toBe(0);
    expect(await page.locator('[data-a=new]').isVisible()).toBe(true);
  } finally {
    await page.close();
  }
});

it('saves the current minute before returning through Game menu to Title page', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await importNotebook(page);
    await page.clock.runFor(2_000);
    expect(await page.locator('.clock').textContent()).toBe('Mon 07:21');
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await page.getByRole('button', { name: 'Title page', exact: true }).click();
    await page.locator('[data-save-summary]').waitFor();
    expect(await page.locator('[data-save-summary]').textContent()).toContain('Monday · 07:21 · flat 1');
    await page.locator('[data-a=continue]').click();
    expect(await page.locator('.clock').textContent()).toBe('Mon 07:21');
  } finally {
    await page.close();
  }
});
