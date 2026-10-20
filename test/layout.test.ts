import { type Browser, chromium, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { playWeek } from '../scripts/policy.ts';
import { fingerprint, GAME_VERSION, type GameState, replay } from '../src/sim/game.ts';

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
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
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
    await page.clock.runFor(100);
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
  await page.getByRole('button', { name: 'Game menu', exact: true }).click();
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
  await page.clock.runFor(100);
  await page.locator('.journal').waitFor();
  await page.evaluate(() => document.fonts.ready);
}

// Use the real simulation to append entries, then exercise incremental or full rendering.
async function arrive(page: Page, count: number, full = false) {
  await page.evaluate(`import('/src/sim/game.ts').then(({act}) => {
    const s = window.__st.s;
    for (let i = 0; i < ${count - (full ? 1 : 0)}; i++) act(s, { kind: 'go', to: s.k.at });
    ${full ? "window.__st.send({ kind: 'go', to: s.k.at });" : ''}
  })`);
  if (!full) await page.locator('[data-sp="0"]').click();
}

it.each([
  [360, 780, false],
  [1440, 900, false],
  [360, 780, true],
  [1440, 900, true],
])(
  'anchors the entry being read when a full log rolls over at %ix%i (full render: %s)',
  async (width, height, full) => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await importNotebook(page, 1254);
      await page.evaluate(() => document.fonts.ready);
      const journal = page.locator('.journal');
      expect(await journal.locator(':scope > div').count()).toBe(40);
      const before = await journal.evaluate((el) => {
        const row = el.children[10] as HTMLElement;
        el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top + 7;
        return {
          n: row.getAttribute('data-n'),
          text: row.textContent,
          offset: row.getBoundingClientRect().top - el.getBoundingClientRect().top,
        };
      });
      let removed = 0;
      for (const count of [1, 3]) {
        await arrive(page, count, full);
        removed += count;
        const after = await journal.evaluate((el, index) => {
          const row = el.children[index];
          if (!row) throw new Error('The entry being read should still be in the log');
          return {
            n: row.getAttribute('data-n'),
            text: row.textContent,
            offset: row.getBoundingClientRect().top - el.getBoundingClientRect().top,
          };
        }, 10 - removed);
        expect(before.n).not.toBeNull();
        expect(after.n).toBe(before.n);
        expect(after.text).toBe(before.text);
        // scrollTop rounds to whole CSS pixels while text bounds may be fractional.
        expect(Math.abs(after.offset - before.offset)).toBeLessThanOrEqual(1);
      }
    } finally {
      await page.close();
    }
  },
);

it('falls back to the oldest surviving entry when the entry being read is removed', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
  try {
    await importNotebook(page, 1254);
    const journal = page.locator('.journal');
    const oldestSurvivor = await journal.evaluate((el) => {
      el.scrollTop = 7;
      return el.children[3]?.textContent;
    });
    await arrive(page, 3);
    expect(await journal.locator(':scope > div').first().textContent()).toBe(oldestSurvivor);
    expect(await journal.evaluate((el) => el.scrollTop)).toBe(0);
  } finally {
    await page.close();
  }
});

it('follows new entries at the newest end of a full log', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
  try {
    await importNotebook(page, 1254);
    const journal = page.locator('.journal');
    const newest = await journal.locator(':scope > div').last().textContent();
    await arrive(page, 3);
    expect(await journal.locator(':scope > div').last().textContent()).not.toBe(newest);
    expect(
      await journal.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop)),
    ).toBeLessThanOrEqual(1);
  } finally {
    await page.close();
  }
});

it('explains exhausted news beside Anything new and resets it on a new day', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await importNotebook(page);
    const news = page.locator('[data-a=news]');
    expect(await news.isEnabled()).toBe(true);
    await news.click();
    expect(await news.isDisabled()).toBe(true);
    expect(await news.textContent()).toContain('Already asked · ask tomorrow');
    await visibleInViewport(page, '[data-a=news]');
    await page.reload();
    await page.locator('[data-a=continue]').click();
    expect(await page.locator('[data-a=news]').textContent()).toContain('Already asked · ask tomorrow');
    await importNotebook(page, 1254);
    await page.locator('[data-a=news]').click();
    await page.clock.runFor(10_000);
    await page.locator('[data-a=next]').click();
    await page.locator('.scene [data-go="door:nermin"]').click();
    await page.clock.runFor(30_000);
    expect(await page.locator('[data-a=news]').isEnabled()).toBe(true);
    expect(await page.locator('[data-a=news]').textContent()).not.toContain('Already asked · ask tomorrow');
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

it.each([
  { inputs: null },
  { inputs: [{ kind: 'bogus', at: 420 }] },
  { inputs: [{ kind: 'go', to: 'door:missing', at: 420 }] },
  {
    inputs: [
      { kind: 'news', who: 'nermin', at: 440 },
      { kind: 'news', who: 'nermin', at: 420 },
    ],
  },
])('does not offer Continue for malformed inputs $inputs', async ({ inputs }) => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    await page.evaluate(
      (inputs) =>
        localStorage.setItem(
          'stairwell:notebook',
          JSON.stringify({ game: 'stairwell@3', seed: 7, inputs, minute: 440 }),
        ),
      inputs,
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
    await page.clock.runFor(4_000);
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

it('keeps rewind and import inside a reachable Game menu for a completed notebook', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await page.clock.install();
    await page.goto(url);
    const s = playWeek(11, 'honest');
    await page.evaluate((saved) => localStorage.setItem('stairwell:notebook', JSON.stringify(saved)), {
      game: GAME_VERSION,
      seed: s.seed,
      inputs: s.inputs,
      minute: s.minute,
    });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.locator('.title input[type=file], .title [data-a=morning]').count()).toBe(0);
    await page.getByText('More about the job', { exact: true }).click();
    await visibleInViewport(page, '.title .game-menu');
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Game menu', exact: true });
    await menu.getByText('Turn back to a morning', { exact: true }).click();
    expect(await menu.getByRole('button', { name: 'Tuesday morning', exact: true }).isVisible()).toBe(true);
    expect(await menu.locator('input[type=file]').count()).toBe(1);
    await page.keyboard.press('Escape');
    await visibleInViewport(page, '.title .game-menu');
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await menu.getByText('Turn back to a morning', { exact: true }).click();
    await menu.getByRole('button', { name: 'Tuesday morning', exact: true }).click();
    await page.clock.runFor(100);
    await page.locator('.day').waitFor();
    expect(await page.locator('.clock').textContent()).toBe('Tue 07:00');
  } finally {
    await page.close();
  }
});

it('keeps every header control within 320px at doubled text size', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 690 } });
  try {
    await importNotebook(page);
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('*')]
        .filter((el): el is HTMLElement => el instanceof HTMLElement)
        .map((el) => [el, Number.parseFloat(getComputedStyle(el).fontSize)] as const);
      for (const [el, size] of sizes) el.style.fontSize = `${size * 2}px`;
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await visibleInViewport(page, '.top button');
  } finally {
    await page.close();
  }
});

it.each([
  [360, 690],
  [1280, 800],
])('fits conversation responses and 44px standalone targets at %ix%i', async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await importNotebook(page);
    await page.locator('[data-a=news]').click();
    await visibleInViewport(page, '.verbs button, .who .x');
    for (const control of await page.locator('.top button, .task, .verbs button, .who .x').all()) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('[data-a=sit]').click();
    await page.clock.runFor(25000);
    expect(await page.locator('[data-a=sit]').isDisabled()).toBe(true);
    expect(await page.locator('[data-a=sit]').textContent()).toContain(
      'Sat together today · return tomorrow',
    );
    await visibleInViewport(page, '.verbs button, .who .x');
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await page.getByRole('button', { name: 'Title page', exact: true }).click();
    const box = await page.getByText('More about the job', { exact: true }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  } finally {
    await page.close();
  }
});

async function load(page: Page, inputs: unknown[] = [], minute = 420) {
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(30000);
  await page.clock.install();
  await page.goto(url);
  await page.getByRole('button', { name: 'Game menu', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'clarity.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ game: GAME_VERSION, seed: 7, inputs, minute })),
  });
  await page.locator('.day').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function target(page: Page, selector: string) {
  const control = page.locator(selector);
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('Missing target');
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(
    await control.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return (
        b.top >= 0 &&
        b.bottom <= innerHeight &&
        b.left >= 0 &&
        b.right <= innerWidth &&
        el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2))
      );
    }),
  ).toBe(true);
  return box;
}

it.each([
  [360, 690],
  [1280, 800],
])('offers complete orders and readable resident targets at %ix%i', async (width, height) => {
  const page = await browser.newPage({
    viewport: { width, height },
    hasTouch: true,
    isMobile: width === 360,
  });
  try {
    await load(page);
    await page.getByRole('button', { name: /All orders/ }).click();
    const tasks = page.locator('.sheet .task');
    expect(await tasks.count()).toBe(7);
    for (const task of await tasks.all()) {
      expect(await task.textContent()).toMatch(/by \d\d:\d\d/);
      expect(
        await task.evaluate((el) => {
          const css = getComputedStyle(el);
          return (
            css.whiteSpace !== 'nowrap' && css.textOverflow !== 'ellipsis' && el.scrollWidth <= el.clientWidth
          );
        }),
      ).toBe(true);
    }
    await page.locator('.sheet [data-a=close]').click();
    await page.getByRole('button', { name: 'Residents', exact: true }).click();
    expect(await page.locator('.resident-list [data-go]').count()).toBe(7);
    const derya = '.resident-list [data-go="door:derya"]';
    const box = await target(page, derya);
    expect(await page.locator(derya).textContent()).toContain('Derya');
    expect(
      await page.locator(derya).evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(17);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    expect(await page.locator('.sheet').textContent()).toContain('On your way to flat 5');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  } finally {
    await page.close();
  }
});

it.each([
  [360, 690],
  [1280, 800],
])('keeps Derya actions in place when she returns to sleep at %ix%i', async (width, height) => {
  const page = await browser.newPage({
    viewport: { width, height },
    hasTouch: true,
    isMobile: width === 360,
  });
  try {
    await load(
      page,
      [
        { kind: 'go', to: 'bakery', at: 420 },
        { kind: 'go', to: 'door:nermin', at: 440 },
        { kind: 'go', to: 'door:derya', at: 460 },
        { kind: 'knock', who: 'derya', at: 560 },
      ],
      560,
    );
    const sit = page.locator('[data-a=sit]');
    const before = await target(page, '[data-a=sit]');
    const node = await sit.elementHandle();
    await page.locator('[data-a=news]').click();
    const afterNews = await target(page, '[data-a=sit]');
    expect(afterNews.y).toBeCloseTo(before.y, 0);
    await page.clock.runFor(11_000);
    expect(await page.locator('.who').textContent()).toContain('Derya');
    expect(await page.locator('.sheet').textContent()).toContain('back to sleep');
    expect(await sit.isDisabled()).toBe(true);
    expect(await sit.evaluate((el, old) => el === old, node)).toBe(true);
    const afterSleep = await target(page, '[data-a=sit]');
    expect(afterSleep.y).toBeCloseTo(before.y, 0);
    const inputs = await page.evaluate(() => localStorage.getItem('stairwell:notebook'));
    await page.touchscreen.tap(before.x + before.width / 2, before.y + before.height / 2);
    expect(await page.evaluate(() => localStorage.getItem('stairwell:notebook'))).toBe(inputs);
    expect(await page.locator('.sheet [data-go]').count()).toBe(0);
    await page.locator('.sheet [data-a=close]').click();
    expect(await page.locator('.sheet [data-go="door:sevim"]').count()).toBe(1);
  } finally {
    await page.close();
  }
});

it('shows the effective clock rate and keeps inspection moving', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 }, hasTouch: true });
  try {
    await load(page);
    await page.locator('[data-sp="2"]').click();
    expect(await page.locator('.clock-rate').count()).toBe(1);
    expect(await page.locator('.clock-rate').textContent()).toContain('0.3 min/s · First bread run');
    await page.clock.runFor(30_000);
    expect(await page.locator('.clock').textContent()).toBe('Mon 07:09');
    await page.getByRole('button', { name: /All orders/ }).click();
    await page.clock.runFor(10_000);
    expect(await page.locator('.clock').textContent()).toBe('Mon 07:12');
    await page.locator('.sheet [data-a=close]').click();
    await page.evaluate('window.__st.step(109)');
    expect(await page.locator('.clock-rate').textContent()).toBe('12 min/s');
    await page.getByRole('button', { name: 'Residents', exact: true }).click();
    expect(await page.locator('.clock-rate').textContent()).toBe('0.6 min/s · Reading');
    await page.clock.runFor(10_000);
    expect(await page.locator('.clock').textContent()).toBe('Mon 09:07');
    await page.locator('.sheet [data-a=close]').click();
    expect(await page.locator('.clock-rate').textContent()).toBe('12 min/s');
  } finally {
    await page.close();
  }
});

it.each(['Residents', 'All orders'])('preserves focused %s controls while time moves', async (label) => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 }, hasTouch: true });
  try {
    await load(page);
    await page
      .getByRole('button', {
        name: label === 'Residents' ? label : /All orders/,
        exact: label === 'Residents',
      })
      .click();
    const row = page.locator('.directory-items button').first();
    await row.focus();
    const node = await row.elementHandle();
    await page.clock.runFor(4000);
    expect(await row.evaluate((el, old) => el === old && el === document.activeElement, node)).toBe(true);
  } finally {
    await page.close();
  }
});

it('selects Derya by name when two residents share the step', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 }, hasTouch: true });
  try {
    await load(page);
    await page.evaluate(() => {
      const s = (window as unknown as { __st: { s: GameState } }).__st.s;
      s.k.at = 'step';
      for (const id of ['nermin', 'derya']) {
        const r = s.residents.find((r) => r.id === id);
        if (!r) throw new Error('Missing resident');
        r.where = 'step';
        r.until = 700;
      }
    });
    await page.getByRole('button', { name: 'Residents', exact: true }).click();
    await page.locator('[data-resident=derya]').click();
    expect(await page.locator('.who').textContent()).toContain('Derya');
    expect(await page.locator('.sheet').getAttribute('class')).toContain('conversation');
    await page.locator('[data-a=news]').click();
    expect(await page.locator('.door-context').textContent()).toContain(
      'Long night. Two admissions at four.',
    );
    const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('stairwell:notebook'))) ?? '{}');
    expect(saved.inputs.at(-1)).toMatchObject({ kind: 'news', who: 'derya' });
  } finally {
    await page.close();
  }
});

it('keeps Tell choices and focus stable when Derya returns to sleep', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 }, hasTouch: true });
  try {
    await load(
      page,
      [
        { kind: 'go', to: 'door:derya', at: 420 },
        { kind: 'knock', who: 'derya', at: 560 },
      ],
      560,
    );
    await page.locator('[data-a=tell]').click();
    const choice = page.locator('[data-tell]').first();
    await choice.focus();
    const node = await choice.elementHandle();
    const before = await choice.boundingBox();
    await page.clock.runFor(11_000);
    expect(await choice.count()).toBeGreaterThan(0);
    expect(await choice.evaluate((el, old) => el === old, node)).toBe(true);
    expect(await choice.isDisabled()).toBe(true);
    expect(await page.locator('.availability').textContent()).toContain('back to sleep');
    expect((await choice.boundingBox())?.y).toBeCloseTo(before?.y ?? -1, 0);
    expect(await page.locator('.sheet [data-go]').count()).toBe(0);
  } finally {
    await page.close();
  }
});

it.each([
  [360, 690],
  [1280, 800],
])('anchors actions through changing speech at %ix%i', async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
  try {
    await load(page, [{ kind: 'go', to: 'door:nermin', at: 420 }], 440);
    const before = await target(page, '[data-a=sit]');
    const node = await page.locator('[data-a=sit]').elementHandle();
    // Stress the presentation with incoming speech, then its expiry, without changing game rules.
    for (const text of ['A long answer. '.repeat(40), '']) {
      await page.evaluate((text) => {
        const s = (window as unknown as { __st: { s: GameState } }).__st.s;
        s.said = s.said.filter((line) => line.who !== 'nermin');
        if (text) s.said.push({ at: s.minute, who: 'nermin', kind: 'voice', text, n: s.lineNo++ });
      }, text);
      await page.locator('[data-sp="1"]').click();
      const after = await target(page, '[data-a=sit]');
      expect(after.y).toBeCloseTo(before.y, 0);
      expect(await page.locator('[data-a=sit]').evaluate((el, old) => el === old, node)).toBe(true);
    }
  } finally {
    await page.close();
  }
});
