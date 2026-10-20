import { type Browser, chromium, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { GAME_VERSION } from '../src/sim/game.ts';

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
    await page.locator('[data-a=notebook]').click();
    expect(await journal.evaluate((el) => el.scrollTop)).toBe(0);
    await page.locator('[data-a=notebook]').click();
    // A long notebook remains usable and keeps the newest log entry in view.
    await journal.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.locator('[data-a=notebook]').click();
    expect(
      await journal.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 1),
    ).toBe(true);
    await page.locator('.sheet [data-a=export]').scrollIntoViewIfNeeded();
    await visibleInViewport(page, '.top button, .sheet [data-a=export]');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await visibleInViewport(page, '.day');
  } finally {
    await page.close();
  }
});
