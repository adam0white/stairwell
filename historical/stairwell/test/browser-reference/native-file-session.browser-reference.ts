/** Synthetic occupied storage, retained B source bytes. No owner receipt or SDK preservation claim. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { type Browser, chromium } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

let server: ViteDevServer;
let browser: Browser;
let url: string;
// Exact retained B notebook-raw.txt bytes, embedded to keep this six-path control portable.
const fixture =
  '{"game":"stairwell@9","seed":740488,"inputs":[],"minute":420,"oneCast":{"rows":[]},"castChapter":{"version":"stairwell-cast/1","expectedHeads":{"hf.cast.derya.stairwell":null,"hf.cast.hacer.voice":null,"hf.cast.burak.stairwell":null,"hf.cast.sevim.stairwell":null,"hf.cast.tarik.stairwell":null},"inputs":[],"initial":{},"claims":[]},"castReceipts":{"owned":{},"fileOrigin":false,"authored":true,"sources":{}}}';
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  // Match the CI browser for native file lifecycle and close-event scheduling.
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 30000);

it('foreign file preserves occupied notebook through import play hide departure and export', async () => {
  expect(Buffer.byteLength(fixture)).toBe(410);
  expect(createHash('sha256').update(fixture).digest('hex')).toBe(
    'df2e914fd66af4709509dff96df440e6ac404c23ae217137be7ddf6a3f89771f',
  );
  const page = await browser.newPage();
  const requests: string[] = [];
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== new URL(url).origin) {
      requests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    const keys = ['stairwell:notebook', 'stairwell-cast-recovery-index', 'stairwell-cast-recovery:sentinel'];
    for (const key of keys) localStorage.setItem(key, `synthetic-occupied:${key}`);
    const calls: string[] = [];
    const originalGet = Storage.prototype.getItem;
    Object.assign(window, {
      ownerCalls: calls,
      ownerSentinels: () => keys.map((key) => originalGet.call(localStorage, key)),
    });
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, {
        value: function (key: string, ...args: string[]) {
          if (key === 'stairwell:notebook' || key.startsWith('stairwell-cast-recovery'))
            calls.push(`${method}:${key}`);
          return Reflect.apply(original, this, [key, ...args]);
        },
      });
    }
  });
  try {
    await page.clock.install();
    await page.goto(`${url}file/`);
    await page.getByRole('heading', { name: 'Play a saved file', exact: true }).waitFor();
    expect(await page.evaluate(() => (window as unknown as { ownerCalls: string[] }).ownerCalls)).toEqual([]);
    expect(await page.evaluate("import('/src/ui/cast-continuity.ts').then(m => m.shelf === null)")).toBe(
      true,
    );
    const choose = async (text: string) => {
      await page
        .locator('input[type=file]')
        .setInputFiles({ name: 'notebook.json', mimeType: 'application/json', buffer: Buffer.from(text) });
      await expect.poll(() => page.locator('[data-file-status]').textContent()).toMatch(/Loaded|could not/);
    };
    await choose(fixture);
    expect(await page.locator('[data-file-status]').textContent()).toContain('Loaded');
    await page.evaluate(
      `Promise.all([import('/src/ui/app.ts'), import('/src/ui/cast-continuity.ts'), import('/src/sim/game.ts'), import('/src/ui/lab.ts')]).then(([host, cast, sim, {lab}]) => { window.fileModules = {host, cast, sim, lab}; })`,
    );
    await page.evaluate(
      `{ const {host,sim} = window.fileModules; const initial = host.fileSessionExport(); const s = host._debug.s; const expected = sim.replay(s.seed,s.inputs,s.minute,s.version,s.oneCast?.admission,s.castChapter); if(s.oneCast) expected.oneCast=structuredClone(s.oneCast); if(JSON.stringify(initial.current.state)!==JSON.stringify(expected)) throw new Error('Loaded complete fixture differs'); host._debug.send({kind:'go',to:'bakery'}); host._debug.step(20); host._debug.send({kind:'one-cast-depart'}); host._debug.step(39); }`,
    );
    await page.clock.runFor(20000);
    expect(await page.evaluate('window.fileModules.host._debug.s.oneCast.departure.at')).toBe(480);
    const result = await page.evaluate(async () => {
      const { host, cast, sim, lab } = (
        window as unknown as {
          fileModules: {
            host: typeof import('../src/ui/app.ts');
            cast: typeof import('../src/ui/cast-continuity.ts');
            sim: typeof import('../src/sim/game.ts');
            lab: typeof import('../src/ui/lab.ts')['lab'];
          };
        }
      ).fileModules;
      const captured: unknown[] = [];
      const capture = lab.captureSave.bind(lab);
      lab.captureSave = (value) => {
        captured.push(value);
        capture(value);
      };
      const state = host._debug.s;
      if (!state) throw new Error('No installed run');
      const initial = host.fileSessionExport();
      const replayed = sim.replay(
        state.seed,
        state.inputs,
        state.minute,
        state.version,
        state.oneCast?.admission,
        state.castChapter,
      );
      if (state.oneCast) replayed.oneCast = structuredClone(state.oneCast);
      if (JSON.stringify(replayed) !== JSON.stringify(initial.current.state))
        throw new Error('Initial complete replay differs');
      const before = JSON.stringify(initial);
      const forged = structuredClone(initial);
      const firstPerson = forged.current.state.people[0];
      if (!firstPerson) throw new Error('Missing complete Person fixture');
      firstPerson.now++;
      const invalid = [
        '{',
        JSON.stringify({ game: 'stairwell@10', seed: 1, inputs: [], minute: 420 }),
        JSON.stringify(forged),
        '{"__proto__":{}}',
        JSON.stringify({ extra: 'x'.repeat(4 * 1024 * 1024) }),
        `${'['.repeat(66)}0${']'.repeat(66)}`,
      ];
      for (const text of invalid) {
        await host.importFileText(text).catch(() => {});
        if (JSON.stringify(host.fileSessionExport()) !== before) throw new Error('Bad import changed run');
      }
      // The real RAF loop crossed the departure boundary above; page events capture the complete current state.
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      window.dispatchEvent(new Event('pagehide'));
      await cast.checkpointContinuity();
      const exported = host.fileSessionExport();
      const text = JSON.stringify(exported);
      const unchanged = JSON.stringify(exported);
      if (JSON.stringify(captured.at(-1)) !== unchanged)
        throw new Error('Capture omitted complete file state');
      await host.importFileText(text);
      const reimport = host.fileSessionExport();
      const current = host._debug.s;
      if (!current) throw new Error('Reimport did not install');
      const expected = sim.replay(
        current.seed,
        current.inputs,
        current.minute,
        current.version,
        current.oneCast?.admission,
        current.castChapter,
      );
      if (current.oneCast) expected.oneCast = structuredClone(current.oneCast);
      sim.act(expected, { kind: 'go', to: 'shop' });
      host._debug.send({ kind: 'go', to: 'shop' });
      return {
        initial,
        exported,
        reimport,
        unchanged,
        equalContinuation: JSON.stringify(current) === JSON.stringify(expected),
        captured: captured.length,
        metrics: (() => {
          let nodes = 0;
          let depth = 0;
          const visit = (v: unknown, d: number) => {
            nodes++;
            depth = Math.max(depth, d);
            if (v && typeof v === 'object') for (const child of Object.values(v)) visit(child, d + 1);
          };
          visit(exported, 0);
          return { bytes: new TextEncoder().encode(JSON.stringify(exported)).length, nodes, depth };
        })(),
        owned: cast.castReceipts(current).owned,
      };
    });
    if (process.env.STAIRWELL_FILE_PROOF_PATH)
      writeFileSync(process.env.STAIRWELL_FILE_PROOF_PATH, JSON.stringify(result, null, 2));
    expect(result.initial.original.text).toBe(fixture);
    expect(result.initial.original.sha256).toBe(
      'df2e914fd66af4709509dff96df440e6ac404c23ae217137be7ddf6a3f89771f',
    );
    expect(result.exported).toEqual(result.reimport);
    expect(result.equalContinuation).toBe(true);
    expect(result.owned).toEqual({});
    expect(result.captured).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    expect(await page.getByRole('button', { name: 'New game', exact: true }).count()).toBe(0);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download this run', exact: true }).click();
    const download = await downloadEvent;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    if (!stream) throw new Error('No download bytes');
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const downloadBytes = Buffer.concat(chunks);
    if (process.env.STAIRWELL_FILE_PROOF_PATH) {
      const retained = `${process.env.STAIRWELL_FILE_PROOF_PATH}.download.json`;
      writeFileSync(retained, downloadBytes);
      expect(readFileSync(retained)).toEqual(downloadBytes);
    }
    const downloaded = JSON.parse(downloadBytes.toString('utf8'));
    expect(downloaded.format).toBe('stairwell-file-session/1');
    expect(downloaded.current.state.people.length).toBe(result.exported.current.state.people.length);
    expect(downloaded.original.text).toBe(fixture);
    await download.delete();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await page.getByRole('button', { name: 'Choose another file', exact: true }).click();
    await page.getByRole('heading', { name: 'Play a saved file', exact: true }).waitFor();
    const activeBefore = await page.evaluate('JSON.stringify(window.fileModules.host.fileSessionExport())');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('heading', { name: 'Play a saved file', exact: true }).waitFor();
    await page.clock.runFor(2000);
    expect(await page.evaluate('JSON.stringify(window.fileModules.host.fileSessionExport())')).toBe(
      activeBefore,
    );
    const invalidUtf8 = Buffer.concat([
      Buffer.from(`${fixture.trimEnd().slice(0, -1)},"extra":"`),
      Buffer.from([255]),
      Buffer.from('"}'),
    ]);
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'invalid-utf8.json', mimeType: 'application/json', buffer: invalidUtf8 });
    await expect.poll(() => page.locator('[data-file-status]').textContent()).toContain('could not');
    expect(await page.evaluate('JSON.stringify(window.fileModules.host.fileSessionExport())')).toBe(
      activeBefore,
    );
    await choose('{');
    expect(await page.evaluate('JSON.stringify(window.fileModules.host.fileSessionExport())')).toBe(
      activeBefore,
    );
    await page.getByRole('button', { name: 'Resume current file', exact: true }).click();
    await page.evaluate(
      `{ const {host,sim} = window.fileModules; const s = host._debug.s; host._debug.step(sim.dayStart(sim.dayOf(s.minute)) + sim.DAY_END - 1 - s.minute); host._debug.send({kind:'go',to:'bakery'}); }`,
    );
    await page.clock.runFor(20000);
    expect(await page.evaluate('window.fileModules.host._debug.s.phase')).toBe('night');
    // Real phase/complete callbacks after ordinary day stepping; no Person or clock patching.
    const ending = await page.evaluate(async () => {
      const { host, cast } = (
        window as unknown as {
          fileModules: {
            host: typeof import('../src/ui/app.ts');
            cast: typeof import('../src/ui/cast-continuity.ts');
          };
        }
      ).fileModules;
      host._debug.send({ kind: 'one-cast-depart' });
      for (let day = 0; day < 32 && host._debug.s?.phase !== 'end'; day++) {
        host._debug.step(1600);
        window.dispatchEvent(new Event('pagehide'));
        await cast.checkpointContinuity();
        if (host._debug.s?.phase === 'night' || host._debug.s?.phase === 'sunday')
          host._debug.send({ kind: 'next' });
      }
      window.dispatchEvent(new Event('pagehide'));
      const saved = host.fileSessionExport();
      await host.importFileText(JSON.stringify(saved));
      return {
        phase: host._debug.s?.phase,
        equal: JSON.stringify(saved) === JSON.stringify(host.fileSessionExport()),
      };
    });
    expect(ending.phase).toBe('end');
    expect(ending.equal).toBe(true);
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await page.getByRole('button', { name: 'Choose another file', exact: true }).click();
    await page.getByRole('heading', { name: 'Play a saved file', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Play a saved file', exact: true })
      .waitFor({ state: 'detached' });
    expect(await page.evaluate('window.fileModules.host._debug.s.phase')).toBe('end');
    // Check the entire import/play/menu/phase lifecycle BEFORE reload replaces the instrumentation.
    expect(await page.evaluate(() => (window as unknown as { ownerCalls: string[] }).ownerCalls)).toEqual([]);
    expect(await page.evaluate('window.ownerSentinels()')).toEqual(
      ['stairwell:notebook', 'stairwell-cast-recovery-index', 'stairwell-cast-recovery:sentinel'].map(
        (key) => `synthetic-occupied:${key}`,
      ),
    );
    await page.reload();
    await page.getByRole('heading', { name: 'Play a saved file', exact: true }).waitFor();
    expect(await page.evaluate(() => (window as unknown as { ownerCalls: string[] }).ownerCalls)).toEqual([]);
    expect(requests.filter((value) => /persona|consent/.test(value))).toEqual([]);
    await page
      .getByRole('link', { name: 'Leave file play and open my saved local game', exact: true })
      .click();
    await page.locator('[data-a=new]').waitFor();
    expect(await page.evaluate('window.ownerSentinels()')).toEqual(
      ['stairwell:notebook', 'stairwell-cast-recovery-index', 'stairwell-cast-recovery:sentinel'].map(
        (key) => `synthetic-occupied:${key}`,
      ),
    );
  } finally {
    await page.close();
  }
});

it('native entry keeps the saved packet and current client run identity without a file parameter', async () => {
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort(),
  );
  await page.addInitScript((text) => {
    localStorage.setItem('stairwell:notebook', text);
    sessionStorage.setItem('hf-lab-run:stairwell', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    sessionStorage.setItem('hf-lab-session:stairwell', `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:${Date.now()}`);
  }, fixture);
  try {
    await page.clock.install();
    await page.goto(url);
    await page.getByRole('button', { name: 'Continue', exact: true }).waitFor();
    expect(await page.locator('h1').textContent()).toBe('The Stairwell');
    expect(await page.locator('[data-file-status]').count()).toBe(0);
    expect(await page.evaluate("sessionStorage.getItem('hf-lab-run:stairwell')")).toBe(
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.locator('.day').waitFor();
    const result = await page.evaluate<{
      s: unknown;
      expected: unknown;
      saved: { castReceipts: unknown; game: string };
      receipts: unknown;
      shelf: boolean;
      runId: string;
    }>(
      `Promise.all([import('/src/ui/app.ts'),import('/src/ui/cast-continuity.ts'),import('/src/sim/game.ts')]).then(([host,cast,sim]) => { const saved = JSON.parse(localStorage.getItem('stairwell:notebook')); const expected = sim.replay(saved.seed,saved.inputs,saved.minute,saved.game,saved.oneCast?.admission,saved.castChapter); if(saved.oneCast) expected.oneCast=structuredClone(saved.oneCast); return {s:host._debug.s, expected, saved, receipts:cast.castReceipts(host._debug.s), shelf:cast.shelf !== null, runId:sessionStorage.getItem('hf-lab-run:stairwell')}; })`,
    );
    expect(result.s).toEqual(result.expected);
    expect(result.saved.castReceipts).toEqual(result.receipts);
    expect(result.shelf).toBe(true);
    // Shipped client11 syncRun rotates only when the existing title→seed key changes.
    expect(result.runId).toMatch(/^[a-f0-9]{32}$/);
    expect(result.runId).not.toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await page.evaluate("sessionStorage.getItem('hf-lab-run:stairwell')")).toBe(result.runId);
    expect(result.saved.game).toBe(JSON.parse(fixture).game);
  } finally {
    await page.close();
  }
});

it('latest chooser selection cancels older reads hashes errors and pending lifecycle work', async () => {
  // B is the exact retained notebook. A is a distinct synthetic native packet over the same public replay contract.
  const aText = JSON.stringify({ ...JSON.parse(fixture), seed: 740489 });
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort(),
  );
  try {
    await page.clock.install();
    await page.goto(`${url}file/`);
    await page.getByRole('heading', { name: 'Play a saved file', exact: true }).waitFor();
    await page.evaluate(`Promise.all([import('/src/ui/app.ts'),import('/src/ui/lab.ts'),import('/src/ui/cast-continuity.ts')]).then(([host,{lab},cast]) => {
      window.race = {host,cast,reads:{},hashes:[],metadata:[],activeHashes:0};
      const originalRead = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function() {
        const read = originalRead.call(this);
        if (!this.name.startsWith('slow-')) return read;
        return read.then(bytes => new Promise((resolve,reject) => { window.race.reads[this.name] = {resolve:()=>resolve(bytes),reject:()=>reject(new Error('source read failure'))}; }));
      };
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = function(algorithm,data) {
        const text = new TextDecoder().decode(data);
        const result = digest(algorithm,data);
        const held = window.race.blockHash && text.includes('740489');
        if (held) window.race.blockHash = false;
        const completion = held ? result.then(value => new Promise((resolve,reject) => window.race.hashes.push({resolve:()=>resolve(value),reject:()=>reject(new Error('source hash failure'))}))) : result;
        window.race.activeHashes++;
        return completion.finally(() => window.race.activeHashes--);
      };
      for (const name of ['setPersonaRecording','allowPersonaRecording']) {
        const original = lab[name].bind(lab);
        lab[name] = (...args) => { window.race.metadata.push([name,...args]); return original(...args); };
      }
    })`);
    const choose = async (name: string, buffer: Buffer) => {
      await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/json', buffer });
    };
    const chooser = async () => {
      if (await page.locator('input[type=file]').count()) return;
      await page.getByRole('button', { name: 'Game menu', exact: true }).click();
      await page.getByRole('button', { name: 'Choose another file', exact: true }).click();
    };
    const acceptedB = async () => {
      await chooser();
      await choose('B.json', Buffer.from(fixture));
      await expect
        .poll(() => page.evaluate('window.race.host.fileSessionExport().original.text'))
        .toBe(fixture);
      await expect.poll(() => page.locator('[data-file-status]').textContent()).toContain('Loaded');
    };
    const pendingRead = async (name: string) => {
      await chooser();
      await choose(name, Buffer.from(aText));
      await expect
        .poll(() => page.evaluate(`Boolean(window.race.reads[${JSON.stringify(name)}])`))
        .toBe(true);
    };
    const snapshot = () =>
      page.evaluate<{ packet: string; status: string; metadata: string; receipts: string }>(
        `({packet:JSON.stringify(window.race.host.fileSessionExport()),status:document.querySelector('[data-file-status]').textContent,metadata:JSON.stringify(window.race.metadata),receipts:JSON.stringify(window.race.cast.castReceipts(window.race.host._debug.s))})`,
      );
    const settle = async () => {
      await expect.poll(() => page.evaluate('window.race.activeHashes')).toBe(0);
      await page.evaluate(() => Promise.resolve());
    };
    // Exact review ordering: select A with its real read withheld; B installs; then release A.
    await pendingRead('slow-A.json');
    await choose('B.json', Buffer.from(fixture));
    await expect
      .poll(() => page.evaluate('window.race.host.fileSessionExport().original.text'))
      .toBe(fixture);
    const b = await snapshot();
    await page.evaluate("window.race.reads['slow-A.json'].resolve()");
    await settle();
    const afterA = await snapshot();
    if (process.env.STAIRWELL_RACE_PROOF_PATH)
      writeFileSync(
        `${process.env.STAIRWELL_RACE_PROOF_PATH}.ordering.json`,
        JSON.stringify({ b, afterA }, null, 2),
      );
    expect(afterA).toEqual(b);
    // Invalid later selections still cancel a pending read; they do not replace accepted B.
    const invalidUtf8 = Buffer.concat([
      Buffer.from(`${fixture.slice(0, -1)},"extra":"`),
      Buffer.from([255]),
      Buffer.from('"}'),
    ]);
    for (const [name, bytes] of [
      ['malformed.json', Buffer.from('{')],
      ['oversize.json', Buffer.alloc(4 * 1024 * 1024 + 1, 120)],
      ['invalid-utf8.json', invalidUtf8],
      ['bom.json', Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from(fixture)])],
    ] as const) {
      await acceptedB();
      await pendingRead(`slow-${name}`);
      await choose(name, bytes);
      await expect.poll(() => page.locator('[data-file-status]').textContent()).toContain('could not');
      const rejected = await snapshot();
      await page.evaluate(`window.race.reads[${JSON.stringify(`slow-${name}`)}].resolve()`);
      await settle();
      expect(await snapshot()).toEqual(rejected);
    }
    // A stale rejected read must not overwrite B's success status or continuity metadata.
    await acceptedB();
    await pendingRead('slow-error.json');
    await choose('B.json', Buffer.from(fixture));
    await expect.poll(() => page.locator('[data-file-status]').textContent()).toContain('Loaded');
    const beforeError = await snapshot();
    await page.evaluate("window.race.reads['slow-error.json'].reject()");
    await settle();
    expect(await snapshot()).toEqual(beforeError);
    // Withhold a real SHA256 result after A's read; an invalid newer selection cancels it too.
    await acceptedB();
    await chooser();
    await page.evaluate('window.race.blockHash = true');
    await choose('hash-A.json', Buffer.from(aText));
    await expect.poll(() => page.evaluate('window.race.hashes.length')).toBe(1);
    await choose('oversize.json', Buffer.alloc(4 * 1024 * 1024 + 1, 120));
    const beforeHash = await snapshot();
    await page.evaluate('window.race.hashes.shift().resolve()');
    await settle();
    expect(await snapshot()).toEqual(beforeHash);
    // A stale digest failure after a newer accepted B cannot change success status or metadata.
    await acceptedB();
    await chooser();
    await page.evaluate('window.race.blockHash = true');
    await choose('hash-error-A.json', Buffer.from(aText));
    await expect.poll(() => page.evaluate('window.race.hashes.length')).toBe(1);
    await choose('B.json', Buffer.from(fixture));
    await expect.poll(() => page.locator('[data-file-status]').textContent()).toContain('Loaded');
    const beforeHashError = await snapshot();
    await page.evaluate('window.race.hashes.shift().reject()');
    await settle();
    expect(await snapshot()).toEqual(beforeHashError);
    // A pending read must also stop when the chooser is left or the document departs.
    await acceptedB();
    await pendingRead('slow-resume.json');
    await page.getByRole('button', { name: 'Resume current file', exact: true }).click();
    const resumed = await snapshot();
    await page.evaluate("window.race.reads['slow-resume.json'].resolve()");
    await settle();
    expect(await snapshot()).toEqual(resumed);
    const menuAccepted = await snapshot();
    await pendingRead('slow-menu-resume.json');
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    const menuResumed = await snapshot();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.evaluate("window.race.reads['slow-menu-resume.json'].resolve()");
    await settle();
    await page
      .getByRole('heading', { name: 'Play a saved file', exact: true })
      .waitFor({ state: 'detached' });
    // Compare the whole run and metadata; the completed UI restores the accepted run's status.
    expect(await snapshot()).toEqual({ ...menuResumed, status: (menuAccepted as { status: string }).status });
    await pendingRead('slow-chooser.json');
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await page.getByRole('button', { name: 'Choose another file', exact: true }).click();
    const chosenAgain = await snapshot();
    await page.evaluate("window.race.reads['slow-chooser.json'].resolve()");
    await settle();
    expect(await snapshot()).toEqual(chosenAgain);
    await pendingRead('slow-pagehide.json');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const departed = await snapshot();
    await page.evaluate("window.race.reads['slow-pagehide.json'].resolve()");
    await settle();
    expect(await snapshot()).toEqual(departed);
    if (process.env.STAIRWELL_RACE_PROOF_PATH)
      writeFileSync(
        process.env.STAIRWELL_RACE_PROOF_PATH,
        JSON.stringify(
          {
            exactFixtureSha256: createHash('sha256').update(fixture).digest('hex'),
            b,
            invalidSelections: 4,
            hashStage: true,
            resume: true,
            pagehide: true,
          },
          null,
          2,
        ),
      );
  } finally {
    await page.close();
  }
});

it('menu close actions cancel pending files before delayed close completion in Chromium', async () => {
  expect(browser.browserType().name()).toBe('chromium');
  const aText = JSON.stringify({ ...JSON.parse(fixture), seed: 740489 });
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort(),
  );
  const proofs: unknown[] = [];
  try {
    await page.clock.install();
    await page.goto(`${url}file/`);
    await page.getByRole('heading', { name: 'Play a saved file', exact: true }).waitFor();
    await page.evaluate(`Promise.all([import('/src/ui/app.ts'),import('/src/ui/lab.ts'),import('/src/ui/cast-continuity.ts')]).then(([host,{lab},cast]) => {
      const state = window.closeRace = {host,cast,reads:{},hashes:[],activeHashes:0,metadata:[],screens:0,callbacks:[],delivered:0};
      const read = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function() {
        const result = read.call(this);
        return this.name.startsWith('pending-') ? result.then(bytes => new Promise(resolve => {state.reads[this.name]=()=>resolve(bytes)})) : result;
      };
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = function(algorithm,data) {
        const result = digest(algorithm,data);
        const hold = state.blockHash && new TextDecoder().decode(data).includes('740489');
        if(hold) state.blockHash=false;
        const complete = hold ? result.then(value=>new Promise(resolve=>state.hashes.push(()=>resolve(value)))) : result;
        state.activeHashes++;
        return complete.finally(()=>state.activeHashes--);
      };
      const add = HTMLDialogElement.prototype.addEventListener;
      HTMLDialogElement.prototype.addEventListener = function(type,listener,options) {
        if(type!=='close') return add.call(this,type,listener,options);
        return add.call(this,type,event=>{
          const invoke=()=> typeof listener==='function' ? listener.call(this,event) : listener.handleEvent(event);
          if(this===state.holdDialog) state.callbacks.push(invoke); else invoke();
        },options);
      };
      state.deliver=()=>{state.holdDialog=null; for(const invoke of state.callbacks.splice(0)){state.delivered++;invoke();}};
      for(const name of ['setPersonaRecording','allowPersonaRecording']) {
        const original=lab[name].bind(lab);
        lab[name]=(...args)=>{state.metadata.push([name,...args]);return original(...args);};
      }
      const screen=lab.screen.bind(lab);lab.screen=(...args)=>{state.screens++;return screen(...args);};
    })`);
    const snapshot = () =>
      page.evaluate<{ packet: string; receipts: string; metadata: string; status: string }>(
        `({packet:JSON.stringify(window.closeRace.host.fileSessionExport()),receipts:JSON.stringify(window.closeRace.cast.castReceipts(window.closeRace.host._debug.s)),metadata:JSON.stringify(window.closeRace.metadata),status:document.querySelector('[data-file-status]').textContent})`,
      );
    const select = (name: string, text: string) =>
      page
        .locator('input[type=file]')
        .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
    const chooser = async () => {
      if (await page.locator('input[type=file]').count()) return;
      await page.getByRole('button', { name: 'Game menu', exact: true }).click();
      await page.getByRole('button', { name: 'Choose another file', exact: true }).click();
      await page.getByRole('heading', { name: 'Play a saved file', exact: true }).waitFor();
    };
    const loadB = async () => {
      await chooser();
      await select('B.json', fixture);
      await expect.poll(() => page.locator('[data-file-status]').textContent()).toContain('Loaded');
      expect(await page.evaluate('window.closeRace.host.fileSessionExport().original.text')).toBe(fixture);
      return snapshot();
    };
    const pending = async (name: string, hash: boolean) => {
      await chooser();
      if (hash) await page.evaluate('window.closeRace.blockHash=true');
      await select(name, aText);
      await expect
        .poll(() =>
          page.evaluate(
            hash
              ? 'window.closeRace.hashes.length===1'
              : `Boolean(window.closeRace.reads[${JSON.stringify(name)}])`,
          ),
        )
        .toBe(true);
    };
    const openHeldMenu = async () => {
      await page.getByRole('button', { name: 'Game menu', exact: true }).click();
      await page.evaluate(`window.closeRace.holdDialog=document.querySelector('dialog.sw-menu[open]')`);
    };
    const release = async (name: string, hash: boolean) => {
      await page.evaluate(
        hash ? 'window.closeRace.hashes.shift()()' : `window.closeRace.reads[${JSON.stringify(name)}]()`,
      );
      await expect.poll(() => page.evaluate('window.closeRace.activeHashes')).toBe(0);
      await page.evaluate(() => Promise.resolve());
    };
    for (const [action, hash] of [
      ['Resume', false],
      ['X', true],
      ['Escape', false],
    ] as const) {
      const accepted = await loadB();
      const name = hash ? 'hash-A.json' : `pending-${action}.json`;
      await pending(name, hash);
      await openHeldMenu();
      const before = await snapshot();
      if (action === 'Resume') await page.getByRole('button', { name: 'Resume', exact: true }).click();
      else if (action === 'X')
        await page.getByRole('button', { name: 'Close game menu', exact: true }).click();
      else if (action === 'Escape') await page.keyboard.press('Escape');
      else await page.mouse.click(1, 1);
      // No completion wait or delay before releasing A. This is the harmful CI interval.
      await release(name, hash);
      const afterRelease = await snapshot();
      proofs.push({ action, hash, before, afterRelease });
      if (process.env.STAIRWELL_CLOSE_PROOF_PATH)
        writeFileSync(
          process.env.STAIRWELL_CLOSE_PROOF_PATH,
          JSON.stringify({ browser: browser.version(), proofs }, null, 2),
        );
      expect(afterRelease).toEqual(before);
      await expect.poll(() => page.evaluate('window.closeRace.callbacks.length')).toBeGreaterThan(0);
      const screens = await page.evaluate<number>('window.closeRace.screens');
      await page.evaluate('window.closeRace.deliver()');
      await page
        .getByRole('heading', { name: 'Play a saved file', exact: true })
        .waitFor({ state: 'detached' });
      expect(await snapshot()).toEqual({ ...before, status: (accepted as { status: string }).status });
      expect(await page.evaluate('window.closeRace.screens')).toBe(screens + 1);
      await page.evaluate('window.closeRace.deliver()');
      expect(await page.evaluate('window.closeRace.screens')).toBe(screens + 1);
    }
    // A completed replacement UI must ignore an older menu's delayed close callback.
    await loadB();
    await pending('pending-replaced-root.json', false);
    await openHeldMenu();
    const before = await snapshot();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await release('pending-replaced-root.json', false);
    expect(await snapshot()).toEqual(before);
    await expect.poll(() => page.evaluate('window.closeRace.callbacks.length')).toBeGreaterThan(0);
    await select('new-C.json', aText);
    await expect
      .poll(() => page.evaluate('window.closeRace.host.fileSessionExport().original.text'))
      .toBe(aText);
    const replacement = await snapshot();
    const screens = await page.evaluate<number>('window.closeRace.screens');
    await page.evaluate('window.closeRace.deliver()');
    expect(await snapshot()).toEqual(replacement);
    expect(await page.evaluate('window.closeRace.screens')).toBe(screens);
    if (process.env.STAIRWELL_CLOSE_PROOF_PATH)
      writeFileSync(
        process.env.STAIRWELL_CLOSE_PROOF_PATH,
        JSON.stringify(
          { browser: browser.version(), proofs, onceOnlyCompletion: true, replacedRootIgnored: true },
          null,
          2,
        ),
      );
  } finally {
    await page.close();
  }
});
