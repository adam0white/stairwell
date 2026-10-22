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

async function importNotebook(
  page: Page,
  minute = 440,
  inputs: unknown[] = [{ kind: 'go', to: 'door:nermin', at: 420 }],
  seed = 7,
) {
  page.setDefaultTimeout(5000);
  await page.clock.install();
  await page.goto(url);
  await page.evaluate((save) => localStorage.setItem('stairwell:notebook', JSON.stringify(save)), {
    game: GAME_VERSION,
    seed,
    inputs,
    minute,
  });
  await page.reload();
  await page.locator('[data-a=continue]').click();
  await page.evaluate(() => document.fonts.ready);
}
// Use the real simulation to append entries, then exercise incremental or full rendering.
async function arrive(page: Page, count: number, full = false) {
  await page.evaluate(`import('/src/sim/game.ts').then(({act}) => {
    const s = window.__st.s;
    for (let i = 0; i < ${count - (full ? 1 : 0)}; i++) act(s, { kind: 'go', to: s.k.at });
    ${full ? "window.__st.send({ kind: 'go', to: s.k.at });" : ''}
  })`);
  if (!full) await page.evaluate('window.__st.render()');
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
      if (await page.locator('.who [data-a=close]').isVisible())
        await page.locator('.who [data-a=close]').click();
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
    if (await page.locator('.who [data-a=close]').isVisible())
      await page.locator('.who [data-a=close]').click();
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
    if (await page.locator('.who [data-a=close]').isVisible())
      await page.locator('.who [data-a=close]').click();
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

// Load a real local font after rendering, without relying on Google's network timing.
// Courier New ships on macOS; Playwright's Linux dependencies include Liberation Mono.
it.each(['newest', 'older', 'pending scroll'])(
  'preserves the journal through a late font load (%s)',
  async (reading) => {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
    try {
      await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
      await importNotebook(page, 1254);
      if (await page.locator('.who [data-a=close]').isVisible())
        await page.locator('.who [data-a=close]').click();
      await page.addStyleTag({ content: '.journal { font-family: "Journal test", monospace; }' });
      await page.evaluate('window.__st.render()');
      const journal = page.locator('.journal');
      await journal.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      if (reading === 'older') {
        await journal.evaluate((el) => {
          const row = el.children[10];
          if (!row) throw new Error('Expected an older journal entry');
          el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top + 7;
        });
      }
      // Deliver the fixture's scroll before changing the font metrics.
      await page.clock.runFor(20);
      const before = await journal.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        const row = [...el.children].find((row) => row.getBoundingClientRect().bottom > bounds.top);
        if (!row) throw new Error('Expected a visible journal entry');
        return {
          height: el.scrollHeight,
          n: row.getAttribute('data-n'),
          offset: row.getBoundingClientRect().top - bounds.top,
        };
      });
      await page.evaluate(async (pending) => {
        const descriptors: FontFaceDescriptors & { sizeAdjust: string } = { sizeAdjust: '150%' };
        const font = new FontFace(
          'Journal test',
          'local("Courier New"), local("Liberation Mono")',
          descriptors,
        );
        document.fonts.add(font);
        const loaded = document.fonts.load('14px "Journal test"');
        if (pending) {
          const journal = document.querySelector<HTMLElement>('.journal');
          if (!journal) throw new Error('Expected the journal');
          journal.scrollTop = 0;
        }
        await loaded;
        await document.fonts.ready;
      }, reading === 'pending scroll');
      expect(await journal.evaluate((el) => el.scrollHeight)).toBeGreaterThan(before.height);
      if (reading === 'older') {
        const offset = await journal.evaluate((el, n) => {
          const row = [...el.children].find((row) => row.getAttribute('data-n') === n);
          if (!row) throw new Error('The entry being read should still exist');
          return row.getBoundingClientRect().top - el.getBoundingClientRect().top;
        }, before.n);
        expect(Math.abs(offset - before.offset)).toBeLessThanOrEqual(1);
      } else if (reading === 'pending scroll') {
        expect(await journal.evaluate((el) => el.scrollTop)).toBe(0);
      } else {
        expect(
          await journal.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop)),
        ).toBeLessThanOrEqual(1);
        await arrive(page, 3);
        expect(
          await journal.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop)),
        ).toBeLessThanOrEqual(1);
      }
    } finally {
      await page.close();
    }
  },
);

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

it.each([
  [360, 690],
  [1280, 800],
])('previews orders and destinations before walking at %ix%i', async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
  try {
    await importNotebook(page, 420, []);
    const inputs = await page.evaluate('window.__st.s.inputs.length');
    await page.getByRole('button', { name: /^Orders/ }).click();
    await page.locator('.sheet .task').first().click();
    expect(await page.evaluate('window.__st.s.inputs.length')).toBe(inputs);
    expect(await page.locator('.action-bar').textContent()).toMatch(/min/);
    expect(await page.locator('.action-bar').textContent()).toMatch(/there about|enough|legs|climb|stairs/);
    await page.getByRole('button', { name: 'Go to the bakery', exact: true }).click();
    expect(await page.evaluate('window.__st.s.inputs.at(-1)')).toMatchObject({ kind: 'go', to: 'bakery' });
    expect(await page.evaluate('window.__st.s.inputs.length')).toBe(Number(inputs) + 1);
    expect(await page.locator('.action-bar').textContent()).toContain('On the way to the bakery');
    expect(await page.locator('.action-bar .primary').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  } finally {
    await page.close();
  }
});

it.each([
  [360, 690],
  [1280, 800],
])('holds reading and conversation with reachable actions at %ix%i', async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await importNotebook(page);
    await visibleInViewport(page, '.verbs button');
    expect(await page.locator('.verbs button').count()).toBe(4);
    for (const b of await page.locator('.verbs button').all())
      expect((await b.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const before = await page.evaluate('window.__st.s.minute');
    await page.clock.runFor(3100);
    expect(await page.evaluate('window.__st.s.minute')).toBe(before);
    expect(await page.locator('.clock-rate').textContent()).toContain('is talking · time waits');
    await page.getByRole('button', { name: 'Residents', exact: true }).click();
    await page.clock.runFor(3100);
    expect(await page.evaluate('window.__st.s.minute')).toBe(before);
    expect(await page.locator('.clock-rate').textContent()).toContain('Reading · time waits');
    await page.locator('.resident-list button').first().click();
    expect(await page.evaluate('window.__st.s.minute')).toBe(before);
    expect(await page.locator('.action-bar').textContent()).toContain('min');
  } finally {
    await page.close();
  }
});

it('keeps Tell addressed to the departed person and pins Back and invent', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await importNotebook(page, 560, [
      { kind: 'go', to: 'door:derya', at: 420 },
      { kind: 'knock', who: 'derya', at: 560 },
    ]);
    await page.locator('[data-a=tell]').click();
    await visibleInViewport(page, '.action-bar [data-a=invent], .action-bar [data-a=back]');
    await page.evaluate('window.__st.advance(10)');
    expect(await page.locator('.sheet .who').textContent()).toContain('Derya');
    expect(await page.locator('.availability').textContent()).toContain('back to sleep');
    for (const b of await page.locator('[data-tell]').all()) expect(await b.isDisabled()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  } finally {
    await page.close();
  }
});

it.each([
  [360, 690],
  [1280, 800],
])('keeps all building destinations visible and at least 44px at %ix%i', async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await importNotebook(page, 420, []);
    for (const hit of await page.locator('.scene .hit').all()) {
      const box = await hit.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
    const boxes = await page
      .locator('.scene .hit')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1)) {
        expect(
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5,
        ).toBe(false);
      }
    expect(await page.locator('.topbar .info').count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Game menu', exact: true }).count()).toBe(1);
    await page.locator('.scene [data-go="door:tarik"]').click();
    expect(await page.evaluate('window.__st.s.inputs.length')).toBe(0);
    expect(await page.locator('.action-bar').textContent()).toContain('min');
    expect(await page.locator('select').count()).toBe(0);
  } finally {
    await page.close();
  }
});

it('keeps the optional tally outside replay state', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    const s = playWeek(11, 'honest');
    await importNotebook(page, s.minute, s.inputs, s.seed);
    const tally = page.locator('[data-week-tally]');
    expect(await tally.isVisible()).toBe(false);
    const before = await page.evaluate('JSON.stringify(window.__st.s)');
    await page.getByRole('button', { name: 'See the tally', exact: true }).click();
    expect(await tally.isVisible()).toBe(true);
    expect(await page.evaluate('JSON.stringify(window.__st.s)')).toBe(before);
    await visibleInViewport(page, '.action-bar button');
    expect(await page.getByRole('button', { name: 'Send word', exact: true }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Download this run', exact: true }).count()).toBe(1);
    expect(fingerprint(replay(s.seed, s.inputs, s.minute))).toBe(fingerprint(s));
  } finally {
    await page.close();
  }
});

async function actionTarget(page: Page, selector: string) {
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

it('keeps Tell choices and focus stable when Derya returns to sleep', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 }, hasTouch: true });
  try {
    await importNotebook(page, 560, [
      { kind: 'go', to: 'door:derya', at: 420 },
      { kind: 'knock', who: 'derya', at: 560 },
    ]);
    await page.locator('[data-a=tell]').click();
    const choice = page.locator('[data-tell]').first();
    await choice.focus();
    const node = await choice.elementHandle();
    const before = await choice.boundingBox();
    await page.evaluate('window.__st.advance(10)');
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
    await importNotebook(page);
    const before = await actionTarget(page, '[data-a=sit]');
    const node = await page.locator('[data-a=sit]').elementHandle();
    // Stress the presentation with incoming speech, then its expiry, without changing game rules.
    for (const text of ['A long answer. '.repeat(40), '']) {
      await page.evaluate((text) => {
        const s = (window as unknown as { __st: { s: GameState } }).__st.s;
        s.said = s.said.filter((line) => line.who !== 'nermin');
        if (text) s.said.push({ at: s.minute, who: 'nermin', kind: 'voice', text, n: s.lineNo++ });
      }, text);
      await page.evaluate('window.__st.render()');
      const after = await actionTarget(page, '[data-a=sit]');
      expect(after.y).toBeCloseTo(before.y, 0);
      expect(await page.locator('[data-a=sit]').evaluate((el, old) => el === old, node)).toBe(true);
    }
  } finally {
    await page.close();
  }
});

it.each([
  [360, 690],
  [1280, 800],
])('holds the clock for information and menu, with shelf-only restart at %ix%i', async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await importNotebook(page, 420, []);
    const before = await page.evaluate('window.__st.s.minute');
    await page.getByRole('button', { name: 'Information', exact: true }).click();
    const bar = await page.locator('.topbar').boundingBox();
    expect((await page.locator('#game-info').boundingBox())?.y).toBeGreaterThanOrEqual(
      (bar?.y ?? 0) + (bar?.height ?? 0),
    );
    await page.clock.runFor(3100);
    expect(await page.evaluate('window.__st.s.minute')).toBe(before);
    await page.keyboard.press('Escape');
    expect(await page.locator('#game-info').isVisible()).toBe(false);
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await page.clock.runFor(3100);
    expect(await page.evaluate('window.__st.s.minute')).toBe(before);
    const menu = page.getByRole('dialog', { name: 'Game menu', exact: true });
    expect(await menu.locator('input[type=file]').count()).toBe(0);
    expect(await menu.getByText('Download this run', { exact: true }).count()).toBe(0);
    expect(await menu.getByRole('button').last().textContent()).toBe('Back to the stairs');
    expect(
      await menu.getByRole('button', { name: 'Automatic', exact: true }).getAttribute('aria-pressed'),
    ).toBe('true');
    await menu.getByRole('button', { name: 'Fast', exact: true }).click();
    expect(await menu.getByRole('button', { name: 'Fast', exact: true }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await menu.getByRole('button', { name: 'To the title page', exact: true }).click();
    await page.locator('[data-a=new]').click();
    expect(await page.getByText('The old notebook will be replaced.', { exact: false }).isVisible()).toBe(
      true,
    );
    await page.locator('[data-a=no-new]').click();
    await page.locator('[data-a=other]').click();
    expect(await page.getByText('Load a playtest run', { exact: false }).isVisible()).toBe(true);
  } finally {
    await page.close();
  }
});

it('offers Skip only for an empty stretch and stops at its first event', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await importNotebook(page, 420, []);
    await page.evaluate(() => {
      const debug = (window as unknown as { __st: { s: GameState; render: () => void } }).__st;
      for (const task of debug.s.tasks) if (task.from <= debug.s.minute) task.done = debug.s.minute;
      debug.render();
    });
    const skip = page.getByRole('button', { name: 'Skip to the next event', exact: true });
    expect(await skip.textContent()).toBe('Skip ⏩');
    const before = await page.evaluate('({minute:window.__st.s.minute,line:window.__st.s.lineNo})');
    await skip.click();
    const after = (await page.evaluate('({minute:window.__st.s.minute,line:window.__st.s.lineNo})')) as {
      minute: number;
      line: number;
    };
    expect(after.minute).toBeGreaterThan((before as { minute: number }).minute);
    expect(await page.evaluate('JSON.parse(localStorage.getItem("stairwell:notebook")).minute')).toBe(
      after.minute,
    );
    await page.getByRole('button', { name: /^Orders/ }).click();
    expect(await skip.count()).toBe(0);
  } finally {
    await page.close();
  }
});

it('shows lateness before an order is committed', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await importNotebook(page, 420, []);
    await page.evaluate(() => {
      const d = (window as unknown as { __st: { s: GameState; render: () => void } }).__st;
      for (const t of d.s.tasks) if (t.from <= d.s.minute && !t.done) t.by = d.s.minute + 1;
      d.render();
    });
    await page.getByRole('button', { name: /^Orders/ }).click();
    await page.locator('.sheet .task').first().click();
    expect(await page.locator('.trip-line').textContent()).toContain('late by about');
    expect(await page.evaluate('window.__st.s.inputs.length')).toBe(0);
  } finally {
    await page.close();
  }
});

it('restores pinned verbs when returning from an order preview to a person', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await importNotebook(page);
    await page.getByRole('button', { name: /^Orders/ }).click();
    await page.locator('.sheet .task').first().click();
    await page.locator('[data-tab=none]').click();
    expect(await page.locator('.action-bar .verbs button').count()).toBe(4);
    await visibleInViewport(page, '.action-bar .verbs button');
  } finally {
    await page.close();
  }
});

it('includes a carried deadline when selecting its flat directly', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await importNotebook(page, 420, []);
    await page.evaluate(() => {
      const d = (window as unknown as { __st: { s: GameState; render: () => void } }).__st;
      const t = d.s.tasks.find((t) => t.for === 'tarik' && t.from <= d.s.minute);
      if (!t) throw Error('missing task');
      t.carried = true;
      t.by = d.s.minute + 1;
      d.render();
    });
    await page.locator('.scene [data-go="door:tarik"]').click();
    expect(await page.locator('.trip-line').textContent()).toContain('late by about');
    expect(await page.evaluate('window.__st.s.inputs.length')).toBe(0);
  } finally {
    await page.close();
  }
});
