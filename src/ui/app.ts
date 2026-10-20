/**
 * The Stairwell UI: a page from the kapıcı's notebook. Plain DOM, no framework. The sim is pure (`sim/game.ts`); this
 * file only reads it and queues inputs. The notebook (seed + inputs) is the save, kept in localStorage after every
 * input and at every page turn.
 */
import {
  act,
  canReplay,
  clockOf,
  DAY_NAMES,
  dayOf,
  dayStart,
  faceToFace,
  floorOf,
  GAME_VERSION,
  type GameState,
  INVENTABLE,
  type Input,
  legsLine,
  type NewInput,
  nameOf,
  newGame,
  openTasks,
  type Place,
  personOf,
  placeName,
  readOf,
  replay,
  rOf,
  type Said,
  SECRET_PROPS,
  step,
  type Task,
  TOP_FLOOR,
  tellables,
  travelMinutes,
  wordHint,
} from '../sim/game.ts';
import { RESIDENTS, RIDS, type Rid } from '../sim/people.ts';
import { gameMenu, labScreen } from './lab.ts';
import { playback } from './playback.ts';
import { isSaved, type Saved } from './save.ts';

const SAVE_KEY = 'stairwell:notebook';
const SPEEDS = [3, 6, 12];

interface Ui {
  s: GameState | null;
  speed: number;
  sheet: 'none' | 'tell' | 'invent' | 'notebook' | 'place' | 'orders' | 'residents';
  inventAbout: Rid | null;
  sheetFor: Rid | null;
  acc: number;
  last: number;
  pendingTo: Place | null;
  pendingPerson: Rid | null;
  lastKey: string;
  sheetKey: string;
  dismissed: string;
  grudgeSaid: Set<string>;
}

const ui: Ui = {
  s: null,
  speed: 0,
  sheet: 'none',
  inventAbout: null,
  sheetFor: null,
  acc: 0,
  last: 0,
  pendingTo: null,
  pendingPerson: null,
  lastKey: '',
  sheetKey: '',
  dismissed: '',
  grudgeSaid: new Set(),
};

const app = () => document.getElementById('app') as HTMLElement;
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- saves ----------

function save() {
  const s = ui.s;
  if (!s) return;
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ game: GAME_VERSION, seed: s.seed, inputs: s.inputs, minute: s.minute }),
    );
  } catch {}
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const x: unknown = JSON.parse(raw);
    if (!isSaved(x)) return null;
    replay(x.seed, x.inputs, x.minute);
    return x;
  } catch {
    return null;
  }
}

/** Mornings in a saved notebook: the inputs up to each page turn. */
function mornings(saved: Saved): { day: number; inputs: Input[] }[] {
  const out = [{ day: 1, inputs: [] as Input[] }];
  let day = 1;
  saved.inputs.forEach((inp, i) => {
    if (inp.kind === 'next' && day < 6) {
      day++;
      out.push({ day, inputs: saved.inputs.slice(0, i + 1) });
    }
  });
  return out;
}

function runOf(s = ui.s) {
  if (!s) return;
  return {
    game: GAME_VERSION,
    seed: s.seed,
    inputs: s.inputs,
    minute: s.minute,
    state: {
      day: dayOf(s.minute),
      clock: clockOf(s.minute),
      phase: s.phase,
      money: s.k.money,
      reports: s.reports,
      meeting: s.meeting,
      stamps: s.stamps,
      secrets: s.secrets,
      said: s.said.slice(-120),
    },
  };
}

function importRun(file: File) {
  file.text().then((t) => {
    try {
      const x = JSON.parse(t) as Saved;
      if (!canReplay(x.game)) {
        alert('This notebook is from another edition of the game.');
        return;
      }
      if (!isSaved(x)) {
        alert('Could not read that notebook. Check its inputs or choose another file.');
        return;
      }
      begin(replay(x.seed, x.inputs, x.minute));
    } catch {
      alert('Could not read that file.');
    }
  });
}

// ---------- flow ----------

function send(inp: NewInput) {
  const s = ui.s;
  if (!s) return;
  // A new morning starts at the slow speed: the bread run is where a phone player loses the most minutes.
  if (inp.kind === 'next') ui.speed = 0;
  act(s, inp);
  save();
  render(false);
}

function begin(s: GameState) {
  ui.s = s;
  ui.sheet = 'none';
  ui.sheetFor = null;
  ui.pendingPerson = null;
  ui.acc = 0;
  ui.speed = 0;
  ui.dismissed = '';
  save();
  render(true);
}

export function start() {
  titlePage();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  window.addEventListener('pagehide', save);
  requestAnimationFrame(loop);
  if ('serviceWorker' in navigator && !import.meta.env.DEV)
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function loop(t: number) {
  const s = ui.s;
  const dt = ui.last ? Math.min(0.25, (t - ui.last) / 1000) : 0;
  ui.last = t;
  if (
    s &&
    s.phase === 'day' &&
    !document.hidden &&
    !document.querySelector('dialog[open], [role=dialog][aria-modal=true]')
  ) {
    const { rate } = clockPlayback(s);
    ui.acc += dt * rate;
    let n = 0;
    while (ui.acc >= 1 && n < 30 && s.phase === 'day') {
      ui.acc -= 1;
      step(s);
      n++;
    }
    if (n > 0) render(false);
    if (n > 0 && s.minute % 10 === 0) save();
    if (s.phase !== 'day') {
      save();
      render(true);
    }
  }
  requestAnimationFrame(loop);
}

function clockPlayback(s: GameState) {
  const talking = faceToFace(s).some((f) => ui.dismissed !== `${s.k.at}:${f}`);
  const inspecting = ['notebook', 'orders', 'residents'].includes(ui.sheet);
  return playback(s, SPEEDS[ui.speed] ?? 3, talking, inspecting);
}

// ---------- pages ----------

const footer = `<div class="footer"><a href="https://human.adamwhite.work/games/">All games</a></div>`;

function mountMenu(target: Element | null, s: GameState | null) {
  if (!target) return;
  const saved = s ? { game: GAME_VERSION, seed: s.seed, inputs: s.inputs, minute: s.minute } : null;
  const entry = gameMenu({
    hasRun: !!s,
    importRun,
    mornings: saved
      ? mornings(saved).map((m) => ({
          label: `${DAY_NAMES[m.day - 1]} morning`,
          action: () => begin(replay(saved.seed, m.inputs)),
        }))
      : [],
    getRun: () => runOf(ui.s ?? s),
    beforeOpen: () => {
      ui.sheet = 'none';
      ui.sheetKey = '';
      if (ui.s?.phase === 'day') render(false);
    },
    readNotebook:
      s?.phase === 'day' && ui.s
        ? () => {
            ui.sheet = 'notebook';
            ui.sheetKey = '';
            render(false);
            app().querySelector<HTMLElement>('.sheet [data-a=close]')?.focus();
          }
        : undefined,
    title: ui.s ? titlePage : undefined,
  });
  if (target.classList.contains('page')) target.prepend(entry);
  else target.append(entry);
}

function titlePage() {
  save();
  labScreen('title');
  ui.s = null;
  const saved = loadSaved();
  const savedState = saved ? replay(saved.seed, saved.inputs, saved.minute) : null;
  app().innerHTML = `<div class="page title">
    <a class="mark" href="https://human.adamwhite.work">◇ human framework</a>
    <h1>The Stairwell</h1>
    <p>Keep seven flats supplied through Saturday. On Sunday, the residents vote on your tea money.</p>
    <p>Rıza left you his caretaker’s notebook. The job is yours.</p>
    <div class="actions">
      ${savedState ? `<button class="primary" data-a="continue" aria-describedby="saved-summary">Continue</button><span class="soft small" id="saved-summary" data-save-summary>${DAY_NAMES[dayOf(savedState.minute) - 1]} · ${clockOf(savedState.minute)} · ${esc(savedState.k.walk ? `on the way to ${placeName(savedState.k.walk.to)}` : placeName(savedState.k.at))}${savedState.phase !== 'day' ? ` · ${savedState.phase === 'night' ? 'night page' : 'the meeting'}` : ''}</span>` : ''}
      <button class="${saved ? '' : 'primary'}" data-a="new">${saved ? 'A new notebook' : 'Begin on Monday'}</button>
    </div>
    <details><summary>More about the job</summary>
      <p>Rıza Efendi kept the door of Lale Apartmanı for forty years. Now he has gone back to his village, and the job is yours: bread, bins, parcels, five flights of stairs.</p>
      <p>He left you his notebook. Seven flats. They will tell you things.</p>
      <p class="hand soft">On Sunday they vote on your tea money. — R.</p>
    </details>
    <p class="soft small">Six days and a Sunday. Nothing happens while you are away.</p>
    ${footer}
  </div>`;
  const el = app();
  mountMenu(el.querySelector('.page'), savedState);
  el.querySelector('[data-a="continue"]')?.addEventListener('click', () => {
    if (saved) begin(replay(saved.seed, saved.inputs, saved.minute));
  });
  el.querySelector('[data-a="new"]')?.addEventListener('click', () => {
    if (saved && !confirm('Start a new notebook? The old one will be replaced.')) return;
    begin(newGame((Date.now() % 1_000_000) + 1));
  });
}

function render(full: boolean) {
  labScreen('play');
  const s = ui.s;
  if (!s) return;
  if (s.phase === 'night') return nightPage(s);
  if (s.phase === 'sunday' || s.phase === 'end') return sundayPage(s);
  dayView(s, full);
}

// ---------- the day ----------

function dayView(s: GameState, full: boolean) {
  const position = journalPosition(app().querySelector<HTMLElement>('.journal'));
  let root = app().querySelector('.day') as HTMLElement | null;
  if (!root || full) {
    app().innerHTML = `<div class="day">
      <div class="top">
        <span class="clock"></span><span class="grow"></span>
        <span class="speed">${SPEEDS.map((_, i) => `<button data-sp="${i}">${'▸'.repeat(i + 1)}</button>`).join('')}</span>
        </div><div class="clock-rate"></div>
      <div class="navigation"><button data-a="residents">Residents</button><button data-a="orders">All orders</button></div>
      <div class="scene"></div>
      <div class="board"></div>
      <div class="journal"></div>
      <div class="sheet"></div>
    </div>`;
    root = app().querySelector('.day') as HTMLElement;
    for (const b of root.querySelectorAll<HTMLElement>('[data-sp]'))
      b.addEventListener('click', () => {
        ui.speed = Number(b.dataset.sp);
        render(false);
      });
    mountMenu(root.querySelector('.top'), s);
    for (const kind of ['orders', 'residents'] as const)
      root.querySelector(`[data-a=${kind}]`)?.addEventListener('click', () => {
        ui.sheet = kind;
        ui.sheetKey = '';
        render(false);
        app().querySelector<HTMLElement>('.sheet [data-a=close]')?.focus();
      });
    root.querySelector('.scene')?.addEventListener('click', (e) => {
      const t = (e.target as Element).closest('[data-go]') as HTMLElement | SVGElement | null;
      if (!t) return;
      const to = t.getAttribute('data-go') as Place;
      goTo(s, to);
    });
    ui.lastKey = '';
    ui.sheetKey = '';
  }
  const d = dayOf(s.minute);
  (root.querySelector('.clock') as HTMLElement).textContent =
    `${DAY_NAMES[d - 1]?.slice(0, 3)} ${clockOf(s.minute)}`;
  for (const b of root.querySelectorAll<HTMLElement>('[data-sp]'))
    b.classList.toggle('on', Number(b.dataset.sp) === ui.speed);
  const rate = clockPlayback(s);
  (root.querySelector('.clock-rate') as HTMLElement).textContent =
    `${rate.rate} min/s${rate.reason ? ` · ${rate.reason}` : ''}`;
  (root.querySelector('[data-a=orders]') as HTMLElement).textContent = `All orders (${openTasks(s).length})`;
  const log = root.querySelector('.journal') as HTMLElement;
  (root.querySelector('.scene') as HTMLElement).innerHTML = sceneSvg(s);
  const boardKey = JSON.stringify([
    openTasks(s).map((t) => [t.id, t.carried, s.minute > t.by]),
    s.k.at,
    s.k.walk?.to,
  ]);
  if (boardKey !== ui.lastKey) {
    ui.lastKey = boardKey;
    board(s, root.querySelector('.board') as HTMLElement);
  }
  sheet(s, root.querySelector('.sheet') as HTMLElement);
  journal(s, log, position);
}

function goTo(s: GameState, to: Place, person: Rid | null = null) {
  if (s.k.walk || s.k.busyTask !== null) return;
  ui.pendingPerson = person;
  ui.sheetFor = null;
  if (to === s.k.at) {
    ui.dismissed = '';
    ui.sheet = !person && (to === 'room' || to === 'step') ? 'place' : 'none';
    ui.sheetKey = '';
    render(false);
    return;
  }
  ui.sheet = 'none';
  ui.dismissed = '';
  send({ kind: 'go', to });
}

// The building, drawn: floors from the top, flats on each landing, the stair zigzag on the left.
const W = 360;
const FLOOR_H = 46;
const TOP_Y = 26;
const floorY = (f: number) => TOP_Y + (TOP_FLOOR + 1 - f) * FLOOR_H;

function wob(x1: number, y1: number, x2: number, y2: number, k: number): string {
  const j = (n: number) => ((Math.sin(n * 12.9898 + k * 78.233) * 43758.5453) % 1) * 1.6;
  const mx = (x1 + x2) / 2 + j(1);
  const my = (y1 + y2) / 2 + j(2);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function doorX(id: Rid): number {
  const same = RIDS.filter((r) => RESIDENTS[r].floor === RESIDENTS[id].floor);
  const i = same.indexOf(id);
  return same.length === 1 ? 196 : i === 0 ? 132 : 222;
}

function kapiciPos(s: GameState): { x: number; y: number } {
  const pos = (pl: Place) => {
    if (pl === 'bakery') return { x: 330, y: floorY(0) + 8 };
    if (pl === 'shop') return { x: 330, y: floorY(0) - 16 };
    if (pl === 'room') return { x: 70, y: floorY(-1) + 4 };
    if (pl === 'step') return { x: 100, y: floorY(0) + 4 };
    if (pl === 'roof') return { x: 200, y: floorY(TOP_FLOOR + 1) };
    if (pl.startsWith('door:')) return { x: doorX(pl.slice(5) as Rid) - 22, y: floorY(floorOf(pl)) };
    return { x: 74, y: floorY(floorOf(pl)) };
  };
  const w = s.k.walk;
  if (!w) return pos(s.k.at);
  const a = pos(w.from);
  const b = pos(w.to);
  const f = Math.min(1, Math.max(0, (s.minute - w.at0) / Math.max(1, w.at1 - w.at0)));
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function figure(x: number, y: number, cls: string, lean = 0): string {
  return `<g class="${cls}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${lean})">
    <circle cx="0" cy="-27" r="4.5"/><path d="M0 -22 L0 -9 M0 -18 L-5 -12 M0 -18 L5 -12 M0 -9 L-4 0 M0 -9 L4 0"/></g>`;
}

const guestsOf = (s: GameState, host: Rid): Rid[] =>
  RIDS.filter((id) => rOf(s, id).where === `visit:${host}`);

function sceneSvg(s: GameState): string {
  const parts: string[] = [];
  const H = floorY(-1) + 30;
  // Roof line and floors.
  parts.push(`<path class="ink" d="${wob(30, TOP_Y + 4, 300, TOP_Y + 4, 1)}"/>`);
  parts.push(
    `<rect class="hit" data-go="roof" x="40" y="${TOP_Y - 14}" width="250" height="${FLOOR_H - 8}"/>`,
  );
  parts.push(`<text class="lbl soft" x="200" y="${TOP_Y - 2}" text-anchor="middle">roof</text>`);
  for (let f = TOP_FLOOR; f >= 0; f--) {
    const y = floorY(f);
    parts.push(`<path class="ink" d="${wob(30, y, 300, y, f + 3)}"/>`);
    parts.push(`<path class="soft-ink" d="${wob(48, y, 96, y - FLOOR_H + 4, f + 9)}"/>`);
    parts.push(
      `<rect class="hit" data-go="landing:${f}" x="30" y="${y - FLOOR_H + 6}" width="80" height="${FLOOR_H - 6}"/>`,
    );
    parts.push(`<text class="lbl soft" x="34" y="${y - 4}">${f === 0 ? 'G' : f}</text>`);
  }
  // Ground: your room below, the step and the street.
  const g = floorY(0);
  parts.push(`<path class="ink" d="${wob(30, g + 28, 300, g + 28, 21)}"/>`);
  parts.push(`<rect class="hit" data-go="room" x="30" y="${g + 2}" width="90" height="26"/>`);
  parts.push(`<text class="lbl" x="44" y="${g + 20}">your room</text>`);
  parts.push(`<rect class="hit" data-go="step" x="122" y="${g + 2}" width="70" height="26"/>`);
  parts.push(`<text class="lbl" x="128" y="${g + 20}">the step</text>`);
  parts.push(
    `<path class="ink" d="${wob(300, TOP_Y + 4, 300, g + 28, 30)}"/><path class="ink" d="${wob(30, TOP_Y + 4, 30, g + 28, 31)}"/>`,
  );
  parts.push(`<rect class="hit" data-go="shop" x="304" y="${g - 36}" width="56" height="30"/>`);
  parts.push(`<text class="lbl" x="306" y="${g - 18}">shop</text>`);
  parts.push(`<rect class="hit" data-go="bakery" x="304" y="${g - 4}" width="56" height="30"/>`);
  parts.push(`<text class="lbl" x="306" y="${g + 14}">bakery</text>`);
  // Doors and residents.
  const carriedFor = new Set(
    openTasks(s)
      .filter((t) => t.carried)
      .map((t) => t.place),
  );
  const wantedAt = new Set(
    openTasks(s)
      .filter((t) => !t.carried && !t.pickup)
      .map((t) => t.place),
  );
  for (const id of RIDS) {
    const r = rOf(s, id);
    const info = RESIDENTS[id];
    const x = doorX(id);
    const y = floorY(info.floor);
    const pl = `door:${id}` as Place;
    const want = carriedFor.has(pl) || wantedAt.has(pl);
    parts.push(`<g class="door${want ? ' want' : ''}" data-go="${pl}">
      <rect class="hit" x="${x - 34}" y="${y - FLOOR_H + 6}" width="78" height="${FLOOR_H - 6}"/>
      <path class="ink" d="${wob(x, y, x, y - 30, info.flat)} ${wob(x, y - 30, x + 16, y - 30, info.flat + 1)} ${wob(x + 16, y - 30, x + 16, y, info.flat + 2)}"/>
      <text class="lbl hand" x="${x + 20}" y="${y - 18}">${info.flat} ${info.name}</text>
      ${
        r.where === 'asleep'
          ? `<text class="lbl soft" x="${x + 20}" y="${y - 4}">asleep</text>`
          : r.where === 'home'
            ? `<text class="lbl soft${guestsOf(s, id).length ? ' visit' : ''}" x="${x + 20}" y="${y - 4}">${
                guestsOf(s, id).length
                  ? `in, with ${guestsOf(s, id)
                      .map((g) => RESIDENTS[g].name)
                      .join(', ')}`
                  : 'in'
              }</text>`
            : ''
      }
      ${want ? `<circle class="dot" cx="${x + 8}" cy="${y - 36}" r="3"/>` : ''}
    </g>`);
  }
  // Residents out and about: on the step, on the roof, visiting (drawn at the host's door), on the stairs.
  const stepPeople = RIDS.filter((id) => rOf(s, id).where === 'step');
  stepPeople.forEach((id, i) => {
    const x = 128 + i * 26;
    parts.push(figure(x, g + 26, 'res'));
    parts.push(
      `<text class="lbl hand" x="${x}" y="${g - 4 - (i % 3) * 12}" text-anchor="middle">${RESIDENTS[id].name}</text>`,
    );
  });
  const roofPeople = RIDS.filter((id) => rOf(s, id).where === 'roof');
  roofPeople.forEach((id, i) => {
    parts.push(figure(170 + i * 20, TOP_Y + 4, 'res'));
    parts.push(`<text class="lbl hand" x="${190 + i * 40}" y="${TOP_Y - 4}">${RESIDENTS[id].name}</text>`);
  });
  // The kapıcı.
  const kp = kapiciPos(s);
  parts.push(figure(kp.x, kp.y, 'me', s.k.walk ? 6 : 0));
  if (s.k.busyTask !== null)
    parts.push(`<text class="lbl hand me-t" x="${kp.x + 8}" y="${kp.y - 30}">working…</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="The building">${parts.join('')}</svg>`;
}

function taskLine(s: GameState, t: Task, current: boolean): string {
  const late = s.minute > t.by;
  const who = t.kind === 'bins' ? 'Bins' : RESIDENTS[t.for].name;
  const where = t.carried
    ? `to ${placeName(t.place)}`
    : t.pickup
      ? `from ${placeName(t.pickup)}`
      : `at ${placeName(t.place)}`;
  const what = t.kind === 'bins' ? 'down from the fourth floor' : t.label;
  const when = t.kind === 'bins' ? 'by 20:45' : `by ${clockOf(t.by)}`;
  return `<button class="task${current ? ' current' : ''}${late ? ' late' : ''}${t.carried ? ' carried' : ''}" data-t="${t.id}">
    <span class="t">${t.carried ? '◼ ' : ''}${esc(who)}</span> <span>${esc(what)}</span>
    <span class="hand soft">${where}, ${when}${late ? ' · late' : ''}</span></button>`;
}

function board(s: GameState, el: HTMLElement, all = false) {
  const open = openTasks(s).sort((a, b) => Number(!!b.carried) - Number(!!a.carried) || a.by - b.by);
  const swap =
    open.some((t) => t.carried && t.for === 'nermin' && t.kind === 'bread') &&
    open.some((t) => t.carried && t.for === 'sevim' && t.kind === 'bread') &&
    s.swappedDay !== dayOf(s.minute);
  el.innerHTML = open.length
    ? `${open
        .slice(0, all ? open.length : 1)
        .map((t, i) => taskLine(s, t, i === 0))
        .join(
          '',
        )}${!all && swap ? `<button class="prank" data-a="swap">Swap Nermin’s and Sevim’s papers</button>` : ''}`
    : `<div class="soft hand">Nothing on the board. The step, or your room?</div>`;
  for (const b of el.querySelectorAll<HTMLElement>('[data-t]'))
    b.addEventListener('click', () => {
      const t = s.tasks.find((x) => x.id === Number(b.dataset.t));
      if (!t) return;
      goTo(s, t.carried || !t.pickup ? t.place : t.pickup);
    });
  el.querySelector('[data-a="swap"]')?.addEventListener('click', () => send({ kind: 'prank', what: 'swap' }));
}

function saidLine(x: Said): string {
  const id = `data-n="${x.n ?? ''}"`;
  if (x.kind === 'margin')
    return `<div ${id} class="margin hand">${esc(x.text)} <span class="soft">— R.</span></div>`;
  if (x.kind === 'voice')
    return `<div ${id}><span class="soft small">${esc(nameOf(x.who))}:</span> <span class="hand">${esc(x.text)}</span></div>`;
  if (x.kind === 'heard') return `<div ${id} class="heard">… ${esc(x.text)}</div>`;
  return `<div ${id} class="${x.kind === 'event' ? 'event' : ''}">${esc(x.text)}</div>`;
}

function journalPosition(el: HTMLElement | null) {
  const atEnd = !el || el.scrollHeight - el.clientHeight - el.scrollTop <= 2;
  const bounds = el?.getBoundingClientRect();
  const row =
    !atEnd && bounds
      ? [...el.children].find((row) => {
          const rect = row.getBoundingClientRect();
          return rect.bottom > bounds.top && rect.top < bounds.bottom;
        })
      : undefined;
  return {
    atEnd,
    n: row?.getAttribute('data-n'),
    offset: row && bounds ? row.getBoundingClientRect().top - bounds.top : 0,
  };
}

function journal(s: GameState, el: HTMLElement, position: ReturnType<typeof journalPosition>) {
  const lines = s.said.filter((x) => dayOf(x.at) === dayOf(s.minute) || x.kind === 'margin').slice(-40);
  const key = lines.map((x) => `${x.n}:${x.at}:${x.text}`).join('|');
  if (el.dataset.k !== key) {
    el.dataset.k = key;
    el.innerHTML = lines.map(saidLine).join('');
  }
  if (position.atEnd) el.scrollTop = el.scrollHeight;
  else {
    const row = [...el.children].find((row) => row.getAttribute('data-n') === position.n);
    if (row)
      el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - position.offset;
    else el.scrollTop = 0; // The entry was removed: resume at the oldest surviving entry.
  }
}

// ---------- the sheet: whoever is in front of you ----------

function sheet(s: GameState, el: HTMLElement) {
  const faces = faceToFace(s);
  const at = s.k.at;
  let key = '';
  if (ui.sheet === 'orders' || ui.sheet === 'residents') key = `${ui.sheet}:${s.minute}`;
  else if (ui.sheet === 'notebook') key = `nb:${Object.keys(s.secrets).length}:${s.minute >> 4}`;
  else if (s.k.walk) key = `walk:${s.k.walk.to}`;
  else if (s.k.busyTask !== null) key = 'busy';
  else
    key = `at:${at}:${faces.join(',')}:${ui.sheet}:${ui.sheetFor}:${ui.inventAbout}:${ui.dismissed}:${s.minute}:${lastVoice(s)}`;
  if (key === ui.sheetKey) return;
  ui.sheetKey = key;
  const directory = ui.sheet === 'orders' || ui.sheet === 'residents';
  el.classList.toggle('directory', directory);
  if (ui.sheet !== 'none' || s.k.walk || s.k.busyTask !== null) el.classList.remove('conversation');
  if (directory) {
    const kind = ui.sheet;
    const orders = kind === 'orders';
    if (el.dataset.directory !== kind) {
      el.innerHTML = `<div class="who"><b>${orders ? 'All orders' : 'Residents'}</b><button class="x" data-a="close" aria-label="Close">✕</button></div><div class="directory-items${orders ? '' : ' resident-list'}"></div>`;
      el.dataset.directory = kind;
      el.querySelector('[data-a=close]')?.addEventListener('click', () => {
        ui.sheet = 'none';
        ui.sheetKey = '';
        render(false);
        app()
          .querySelector<HTMLElement>(`.navigation [data-a=${orders ? 'orders' : 'residents'}]`)
          ?.focus();
      });
    }
    const items = el.querySelector('.directory-items') as HTMLElement;
    if (orders) {
      // Keep existing rows in place. Requests that arrive while reading append below.
      const open = openTasks(s).sort((a, b) => Number(!!b.carried) - Number(!!a.carried) || a.by - b.by);
      for (const task of open) {
        let button = items.querySelector<HTMLButtonElement>(`[data-t="${task.id}"]`);
        const fresh = document.createElement('div');
        fresh.innerHTML = taskLine(s, task, task.id === open[0]?.id);
        const next = fresh.firstElementChild as HTMLButtonElement;
        if (!button) {
          button = next;
          button.addEventListener('click', () => {
            if (!task.done) goTo(s, task.carried || !task.pickup ? task.place : task.pickup);
          });
          items.append(button);
        } else {
          button.className = next.className;
          if (button.innerHTML !== next.innerHTML) button.innerHTML = next.innerHTML;
        }
      }
      for (const button of items.querySelectorAll<HTMLButtonElement>('[data-t]')) {
        if (open.some((task) => task.id === Number(button.dataset.t))) continue;
        button.disabled = true;
        button.classList.remove('current');
        button.setAttribute('aria-label', `${button.textContent} · delivered`);
      }
      if (!items.children.length) items.textContent = 'Nothing on the board.';
    } else {
      for (const id of RIDS) {
        const info = RESIDENTS[id];
        const where = rOf(s, id).where;
        const to: Place =
          where === 'step' || where === 'roof' || where === 'shop'
            ? where
            : where.startsWith('visit:')
              ? `door:${where.slice(6) as Rid}`
              : `door:${id}`;
        const status =
          where === 'home'
            ? 'in'
            : where === 'asleep'
              ? 'asleep'
              : where === 'work'
                ? 'out'
                : `at ${placeName(to)}`;
        let button = items.querySelector<HTMLButtonElement>(`[data-resident=${id}]`);
        if (!button) {
          button = document.createElement('button');
          button.dataset.resident = id;
          button.addEventListener('click', () => {
            const row = items.querySelector<HTMLButtonElement>(`[data-resident=${id}]`);
            if (row) goTo(s, row.dataset.go as Place, id);
          });
          items.append(button);
        }
        button.dataset.go = to;
        const html = `${esc(info.name)} <span class="soft">· flat ${info.flat} · ${esc(status)}</span>`;
        if (button.innerHTML !== html) button.innerHTML = html;
      }
    }
    return;
  }
  delete el.dataset.directory;
  if (ui.sheet === 'notebook') {
    el.innerHTML = notebookHtml(s);
    el.querySelector('[data-a="close"]')?.addEventListener('click', () => {
      ui.sheet = 'none';
      ui.sheetKey = '';
      render(false);
      app().querySelector<HTMLElement>('.game-menu')?.focus();
    });
    return;
  }
  if (s.k.walk) {
    ui.sheetFor = null;
    const line = ui.pendingTo === s.k.walk.to ? '' : '';
    el.innerHTML =
      s.k.walk.from === s.k.walk.to
        ? '<div class="soft">Sitting a minute. Your legs are glad of it.</div>'
        : `<div class="soft">On your way to ${placeName(s.k.walk.to)}.</div>${line}`;
    return;
  }
  if (s.k.busyTask !== null) {
    const t = s.tasks.find((x) => x.id === s.k.busyTask);
    el.innerHTML = `<div class="soft">Working: ${esc(t?.label ?? '')}.</div>`;
    return;
  }
  if (ui.pendingPerson) {
    if (faces.includes(ui.pendingPerson) || faces.length) ui.sheetFor = ui.pendingPerson;
    ui.pendingPerson = null;
  }
  // A departure disables the chosen person's controls; only Close reveals routes.
  const who = ui.sheetFor ?? faces[0] ?? null;
  if (who) ui.sheetFor = who;
  const present = who !== null && faces.includes(who);
  const submenu = `${who}:${ui.sheet}:${ui.inventAbout}`;
  if (who && (ui.sheet === 'tell' || ui.sheet === 'invent') && el.dataset.submenu === submenu) {
    const status = el.querySelector('.availability');
    if (status) status.textContent = present ? '' : departureLine(s, who);
    for (const button of el.querySelectorAll<HTMLButtonElement>(
      'button:not([data-a=close]):not([data-a=back])',
    ))
      button.disabled = !present;
    return;
  }
  const conversation = !!who && ui.sheet === 'none' && ui.dismissed !== `${at}:${who}`;
  if (!conversation) el.classList.remove('conversation');
  if (!who) {
    el.innerHTML = placeHtml(s);
    el.querySelector('[data-a="gate"]')?.addEventListener('click', () =>
      send({ kind: 'prank', what: 'gate' }),
    );
    el.querySelector('[data-a="knock"]')?.addEventListener('click', () => {
      if (at.startsWith('door:')) send({ kind: 'knock', who: at.slice(5) as Rid });
    });
    for (const b of el.querySelectorAll<HTMLElement>('[data-go]'))
      b.addEventListener('click', () => goTo(s, b.dataset.go as Place));
    return;
  }
  if (ui.dismissed === `${at}:${who}`) {
    el.innerHTML = `<button data-a="reopen">Talk to ${esc(RESIDENTS[who].name)}</button>${placeHtml(s, true)}`;
    el.querySelector('[data-a="reopen"]')?.addEventListener('click', () => {
      ui.dismissed = '';
      ui.sheetKey = '';
      render(false);
    });
    for (const b of el.querySelectorAll<HTMLElement>('[data-go]'))
      b.addEventListener('click', () => goTo(s, b.dataset.go as Place));
    return;
  }
  const html = doorHtml(s, who, faces);
  if (conversation && el.classList.contains('conversation') && el.dataset.who === who) {
    // Preserve the actual action buttons through asynchronous speech and departures.
    const fresh = document.createElement('div');
    fresh.innerHTML = html;
    const context = el.querySelector('.door-context') as HTMLElement;
    const next = fresh.querySelector('.door-context') as HTMLElement;
    if (context.innerHTML !== next.innerHTML) {
      context.innerHTML = next.innerHTML;
      wireDoor(s, context, who);
    }
    for (const button of el.querySelectorAll<HTMLButtonElement>('.verbs button')) {
      const nextButton = fresh.querySelector<HTMLButtonElement>(`[data-a=${button.dataset.a}]`);
      if (!nextButton) continue;
      button.disabled = nextButton.disabled;
      if (button.innerHTML !== nextButton.innerHTML) button.innerHTML = nextButton.innerHTML;
    }
  } else {
    el.classList.toggle('conversation', conversation);
    el.dataset.who = who;
    el.dataset.submenu = submenu;
    el.innerHTML = html;
    wireDoor(s, el, who);
  }
}

function lastVoice(s: GameState): string {
  const x = s.said.at(-1);
  return x ? `${x.at}${x.text.length}` : '';
}

function placeHtml(s: GameState, small = false): string {
  const at = s.k.at;
  const bits: string[] = [];
  if (!small) bits.push(`<div class="soft">At ${placeName(at)}.</div>`);
  if (at.startsWith('door:')) {
    const id = at.slice(5) as Rid;
    const r = rOf(s, id);
    if (r.where === 'asleep')
      bits.push(
        `<div class="hand soft">Quiet behind the door.</div><button data-a="knock">Ring the bell anyway</button>`,
      );
    else if (r.where !== 'home') bits.push(`<div class="hand soft">${esc(RESIDENTS[id].name)} is out.</div>`);
  }
  if ((at === 'step' || at === 'room') && s.gateUntil < s.minute)
    bits.push(`<button class="prank" data-a="gate">Leave the courtyard gate on the latch</button>`);
  // A few quick destinations with the legs' forecast for a long climb.
  const tops = openTasks(s)
    .filter((t) => t.carried)
    .map((t) => t.place)
    .filter((p, i, xs) => xs.indexOf(p) === i && p !== at)
    .slice(0, 2);
  for (const p of tops) {
    const legs = legsLine(s, p);
    bits.push(
      `<button data-go="${p}">To ${placeName(p)} <span class="hand soft">${travelMinutes(s, at, p)} min${legs ? ` · ${esc(legs)}` : ''}</span></button>`,
    );
  }
  return bits.join('');
}

function departureLine(s: GameState, who: Rid) {
  return rOf(s, who).where === 'asleep'
    ? `${RESIDENTS[who].name} has gone back to sleep.`
    : `${RESIDENTS[who].name} has gone.`;
}

function doorHtml(s: GameState, who: Rid, faces: Rid[]): string {
  const info = RESIDENTS[who];
  const r = rOf(s, who);
  const read = readOf(s, who);
  const lastLine = [...s.said]
    .reverse()
    .find((x) => x.who === who && dayOf(x.at) === dayOf(s.minute) && s.minute - x.at < 30);
  const tabs =
    faces.length > 1
      ? `<div class="faces">${faces.map((f) => `<button class="${f === who ? 'on' : ''}" data-face="${f}">${RESIDENTS[f].name}</button>`).join('')}</div>`
      : '';
  const head = `${tabs}<div class="who"><b>${esc(info.call)}</b><span class="soft small">flat ${info.flat} · ${read.warmth}, ${read.word}</span><button class="x" data-a="close" aria-label="Close conversation">✕</button></div>
    <div class="availability soft" aria-live="polite"></div>${lastLine ? `<div class="hand said">${esc(lastLine.text)}</div>` : `<div class="soft small">${esc(info.blurb)}</div>`}`;
  const grudge = r.grudges.find((g) => !ui.grudgeSaid.has(`${who}:${g.at}`));
  if (ui.sheet === 'tell') {
    const items = tellables(s, who);
    return `${head}<div class="soft small">Tell ${esc(info.name)}…</div><div class="tells">${items
      .map(
        (t, i) => `<div class="tell"><span>${esc(t.words)} <span class="hand soft">${t.sure}</span></span>
        <span class="row"><button data-tell="${i}" data-sure="0">as I heard it</button><button data-tell="${i}" data-sure="1">for certain</button></span></div>`,
      )
      .join(
        '',
      )}${items.length === 0 ? '<div class="soft">Nothing in the notebook to pass on yet.</div>' : ''}</div>
      <div class="row"><button data-a="invent">Make something up…</button><button data-a="back">Back</button></div>`;
  }
  if (ui.sheet === 'invent') {
    if (!ui.inventAbout)
      return `${head}<div class="soft small">About whom?</div><div class="chips">${RIDS.filter(
        (x) => x !== who,
      )
        .map((x) => `<button data-about="${x}">${RESIDENTS[x].name}</button>`)
        .join('')}</div><button data-a="back">Back</button>`;
    const about = ui.inventAbout;
    const sweet = RESIDENTS[about].single
      ? RIDS.filter((x) => x !== about && RESIDENTS[x].single)
          .map((x) => `<button data-trait="sweet:${x}">sweet on ${RESIDENTS[x].name}</button>`)
          .join('')
      : '';
    return `${head}<div class="soft small">${esc(RESIDENTS[about].name)}…</div><div class="chips">${INVENTABLE.map(
      (t) => `<button data-trait="${t}">${INVENT_WORDS[t]}</button>`,
    ).join('')}${sweet}</div><button data-a="back">Back</button>`;
  }
  const carriedOther = openTasks(s).filter((t) => t.carried && t.kind === 'parcel' && t.for !== who);
  const present = faces.includes(who);
  const departure = departureLine(s, who);
  const asked = r.newsDay === dayOf(s.minute);
  const sat = r.sitDay === dayOf(s.minute);
  const title = `<div class="who"><b>${esc(info.call)}</b><button class="x" data-a="close" aria-label="Close conversation">✕</button></div>`;
  return `${title}<div class="door-context">${tabs}<div class="soft small">flat ${info.flat} · ${read.warmth}, ${read.word}</div>
    ${present ? (lastLine ? `<div class="hand said">${esc(lastLine.text)}</div>` : `<div class="soft small">${esc(info.blurb)}</div>`) : `<div class="hand departure">${esc(departure)}</div>`}
    ${grudge ? `<div class="hand rope">“I hear you’ve been saying things about me.”</div>` : ''}
    ${present ? carriedOther.map((t) => `<button class="prank" data-mis="${t.id}">Leave ${esc(RESIDENTS[t.for].name)}’s parcel here</button>`).join('') : ''}</div>
    <div class="verbs">
      <button data-a="news" ${asked || !present ? 'disabled' : ''}>Anything new?${asked ? '<span class="h">Already asked · ask tomorrow</span>' : ''}</button>
      <button data-a="tell" ${!present ? 'disabled' : ''}>Tell…</button>
      <button data-a="sit" ${sat || !present ? 'disabled' : ''}>Sit a minute${sat ? '<span class="h">Sat together today · return tomorrow</span>' : ''}</button>
      <button data-a="word" ${r.word || !present ? 'disabled' : ''}>A word for me on Sunday<span class="h">${r.word ? (r.word === 'yes' ? 'promised' : 'said no') : dayOf(s.minute) < 4 ? 'too early' : wordHint(s, who)}</span></button>
    </div>`;
}

const INVENT_WORDS: Record<string, string> = {
  stingy: 'tight with money',
  nosy: 'nosy',
  lazy: 'lazy',
  unreliable: 'unreliable',
  kind: 'kind',
  generous: 'generous',
  hardworking: 'hard-working',
};

function wireDoor(s: GameState, el: HTMLElement, who: Rid) {
  const on = (sel: string, f: (b: HTMLElement) => void) => {
    for (const b of el.querySelectorAll<HTMLElement>(sel)) b.addEventListener('click', () => f(b));
  };
  const reset = () => {
    ui.sheetKey = '';
    render(false);
  };
  const r = rOf(s, who);
  for (const g of r.grudges) ui.grudgeSaid.add(`${who}:${g.at}`);
  on('[data-face]', (b) => {
    ui.sheetFor = b.dataset.face as Rid;
    ui.sheet = 'none';
    reset();
  });
  on('[data-a="close"]', () => {
    ui.dismissed = `${s.k.at}:${who}`;
    ui.sheetFor = null;
    ui.sheet = 'none';
    reset();
  });
  on('[data-a="news"]', () => send({ kind: 'news', who }));
  on('[data-a="word"]', () => send({ kind: 'word', who }));
  on('[data-a="sit"]', () => send({ kind: 'sit', who }));
  on('[data-a="tell"]', () => {
    ui.sheet = 'tell';
    ui.sheetFor = who;
    reset();
  });
  on('[data-a="invent"]', () => {
    ui.sheet = 'invent';
    ui.inventAbout = null;
    reset();
  });
  on('[data-a="back"]', () => {
    ui.sheet = ui.sheet === 'invent' && ui.inventAbout ? 'invent' : ui.sheet === 'invent' ? 'tell' : 'none';
    ui.inventAbout = null;
    reset();
  });
  on('[data-about]', (b) => {
    ui.inventAbout = b.dataset.about as Rid;
    reset();
  });
  on('[data-trait]', (b) => {
    const about = ui.inventAbout;
    if (!about) return;
    ui.sheet = 'none';
    ui.inventAbout = null;
    send({ kind: 'invent', who, about, trait: b.dataset.trait as string });
  });
  const displayedTellables = tellables(s, who);
  on('[data-tell]', (b) => {
    const t = displayedTellables[Number(b.dataset.tell)];
    if (!t) return;
    ui.sheet = 'none';
    send({ kind: 'tell', who, prop: t.prop, value: t.value, sure: b.dataset.sure === '1' });
  });
  on('[data-mis]', (b) => send({ kind: 'misdeliver', who, task: Number(b.dataset.mis) }));
}

// ---------- the notebook ----------

function notebookHtml(s: GameState): string {
  const found = SECRET_PROPS.filter((x) => s.secrets[x.prop] !== undefined);
  const flats = RIDS.map((id) => {
    const rd = readOf(s, id);
    return `<div class="flatline"><b>${RESIDENTS[id].flat} ${RESIDENTS[id].name}</b> <span class="hand soft">${rd.warmth}; ${rd.word}</span></div>`;
  }).join('');
  return `<div class="who"><b>The notebook</b><button class="x" data-a="close">✕</button></div>
    <div class="nb">
    <h3>The flats</h3>${flats}
    <h3>What the building keeps <span class="soft small">${found.length} of ${SECRET_PROPS.length}</span></h3>
    ${SECRET_PROPS.map((x) => (s.secrets[x.prop] !== undefined ? `<div>· ${esc(x.title)}</div>` : `<div class="soft">· …</div>`)).join('')}
    <h3>Stamps</h3><div>${s.stamps.length ? s.stamps.map((x) => esc(STAMPS[x.id] ?? x.id)).join(' · ') : '<span class="soft">none yet</span>'}</div>
    </div>${footer}`;
}

const STAMPS: Record<string, string> = {
  caught: 'Caught in two stories',
  treat: 'Fed for news',
  wrong_door: 'The wrong door',
  gate: 'The gate on the latch',
  swap: 'Crossed crosswords',
  confided: 'Derya trusted you',
  envelope: 'Tarık’s envelope',
  kept_ring: 'Kept the ring quiet',
  raise: 'Tea money up',
  cat: 'Pamuk',
  word_back: 'It got back to them',
};

// ---------- night and Sunday ----------

function nightPage(s: GameState) {
  const d = dayOf(s.minute);
  const rep = s.reports.find((x) => x.day === d);
  const tonight = s.said.filter((x) => x.at >= dayStart(d) + 20 * 60 && x.kind !== 'heard');
  const heard = s.said.filter((x) => dayOf(x.at) === d && x.kind === 'heard').slice(-3);
  const talks = s.talks.filter((t) => dayOf(t.at) === d && t.props.length > 0).length;
  const margin = nightMargin(s, d);
  const open = OPEN_Q[d] ?? '';
  app().innerHTML = `<div class="page night">
    <h2>${DAY_NAMES[d - 1]}, night</h2>
    <p>${rep ? `${rep.done} jobs done on time${rep.late ? `, ${rep.late} late` : ''}${rep.missed ? `, ${rep.missed} not done` : ''}.` : ''} Tips: <span class="money">₺${rep?.tips ?? 0}</span>. In the tin: <span class="money">₺${s.k.money}</span>.</p>
    ${rep?.treats.length ? `<p>${rep.treats.map(esc).join('; ')}.</p>` : ''}
    <p class="soft">The residents talked ${talks === 0 ? 'about nothing much' : talks < 6 ? 'a little' : talks < 14 ? 'a fair bit' : 'all day'} on the stairs and the step.</p>
    ${heard.length ? `<div class="heardbox">${heard.map((x) => `<div class="heard">… ${esc(x.text)}</div>`).join('')}</div>` : ''}
    ${tonight.map(saidLine).join('')}
    <div class="flats">${RIDS.map((id) => {
      const rd = readOf(s, id);
      return `<div class="flatline"><b>${RESIDENTS[id].name}</b> <span class="hand soft">${rd.warmth}; ${rd.word}</span></div>`;
    }).join('')}</div>
    ${margin ? `<div class="margin hand">${esc(margin)} <span class="soft">— R.</span></div>` : ''}
    ${open ? `<p class="open hand">${esc(open)}</p>` : ''}
    <div class="actions"><button class="primary" data-a="next">${d === 6 ? 'Sunday: the meeting' : `Turn the page: ${DAY_NAMES[d]}`}</button>
    <button data-a="title">Close the notebook</button></div>
    ${footer}
  </div>`;
  mountMenu(app().querySelector('.page'), s);
  app()
    .querySelector('[data-a="next"]')
    ?.addEventListener('click', () => send({ kind: 'next' }));
  app().querySelector('[data-a="title"]')?.addEventListener('click', titlePage);
}

const OPEN_Q: Record<number, string> = {
  1: 'Tomorrow a courier comes. Rıza wrote: “Read the labels. Everyone does.”',
  2: 'The radiators ticked and went quiet around midnight.',
  3: 'Who is the man at flat 5?',
  4: 'Tomorrow is Friday. Tarık Bey has been wanting a word with you.',
  5: 'Burak asked what the weather will be on Saturday evening. On the roof.',
  6: 'Tomorrow at eleven: the meeting, and the vote on your tea money.',
};

function nightMargin(s: GameState, d: number): string {
  const told = s.residents.filter((r) => r.told.some((x) => dayOf(x.at) === d)).map((r) => r.id);
  const caught = s.residents.some(
    (r) => r.caught.some((m) => dayOf(m) === d) || r.grudges.some((g) => dayOf(g.at) === d),
  );
  if (caught) return 'It came back to you. It always does, in a building. Lie low a day.';
  if (told.includes('nermin')) return 'Whatever you tell Nermin, the step hears by six.';
  if (told.length === 0 && d === 1)
    return 'You said nothing to anyone today. Wise, or dull. They will decide which.';
  if (d === 2) return 'I did the same with a parcel in 1994. Never again. Mostly.';
  if (d === 3) return 'Hüseyin is careful, not crooked. The building forgets the difference when it is cold.';
  if (d === 4) return 'Derya is good to that building. Remember it when they talk.';
  if (d === 5) return 'Tarık Bey is proud. Carry his shopping and never mention the stairs.';
  return 'Sleep. Bread at seven.';
}

function sundayPage(s: GameState) {
  labScreen('ending');
  const m = s.meeting;
  const lines = s.said.filter((x) => dayOf(x.at) === 7);
  const total = s.reports.reduce((a, x) => a + x.tips, 0);
  const secrets = Object.keys(s.secrets).length;
  const caught = s.residents.reduce((a, r) => a + r.caught.length + r.grudges.length, 0);
  const share = `The Stairwell, week 1: ₺${s.k.money} in the tin, ${secrets}/${SECRET_PROPS.length} secrets, caught ${caught}×, tea money ${m?.raise ? 'up' : 'unchanged'} (${m?.yes ?? 0} hands).${s.ring.answer === 'yes' ? ' A ring on the roof.' : ''}${s.catHome ? ' A cat on the step.' : ''} ◇`;
  app().innerHTML = `<div class="page sunday">
    <h2>Sunday, the meeting</h2>
    ${lines.map(saidLine).join('')}
    <div class="votes">${RIDS.map((id) => {
      const r = rOf(s, id);
      const p = personOf(s, id);
      const kept = r.word === 'yes' && r.vote === 'yes';
      const broke = r.word === 'yes' && r.vote === 'no';
      return `<div class="flatline"><b>${RESIDENTS[id].name}</b> <span class="hand ${r.vote === 'yes' ? 'moss' : 'soft'}">${r.vote === 'yes' ? 'hand up' : r.vote === 'away' ? 'did not come' : 'hand down'}</span>${kept ? ' <span class="soft small">as promised</span>' : broke ? ' <span class="rope small">despite a promise</span>' : ''}${p ? '' : ''}</div>`;
    }).join('')}</div>
    <p>Six days: <span class="money">₺${total}</span> in tips${m?.raise ? ', and the tea money goes up' : ''}. The tin: <span class="money">₺${s.k.money}</span>.</p>
    <p>${s.ring.answer === 'yes' ? 'Burak and Elif are engaged. ' : s.ring.answer === 'not yet' ? 'Elif asked Burak for time. ' : 'Burak still has the ring in his pocket. '}${s.catHome ? 'Pamuk sleeps on the step.' : ''}</p>
    <div class="margin hand">${m?.raise ? 'Not bad for a first week. They will want more next week.' : 'A first week is a first week. Next week they will know you better.'} <span class="soft">— R.</span></div>
    <div class="share"><div class="soft small">To share:</div><div class="hand">${esc(share)}</div><button data-a="copy">Copy</button></div>
    <p class="soft small">Week 2 is still being written. Your notebook is saved.</p>
    <div class="actions"><button class="primary" data-a="title">Close the notebook</button></div>
    ${footer}
  </div>`;
  mountMenu(app().querySelector('.page'), s);
  app()
    .querySelector('[data-a="copy"]')
    ?.addEventListener('click', () => navigator.clipboard?.writeText(share).catch(() => {}));
  app().querySelector('[data-a="title"]')?.addEventListener('click', titlePage);
}

export const _debug = {
  get s() {
    return ui.s;
  },
  send,
  step: (n: number) => {
    const s = ui.s;
    if (!s) return;
    for (let i = 0; i < n && s.phase === 'day'; i++) step(s);
    render(true);
  },
};
