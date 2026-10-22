/**
 * The Stairwell UI: a page from the kapıcı's notebook. Plain DOM, no framework. The sim is pure (`sim/game.ts`); this
 * file only reads it and queues inputs. The notebook (seed + inputs) is the save, kept in localStorage after every
 * input and at every page turn.
 */

import { type phoneStage, telemetryNotice } from '@adam0white/lab-kit';
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
import { downloadRun, gameMenu, lab, labScreen, openFeedback } from './lab.ts';
import { canWait, playback, untilSomethingHappens } from './playback.ts';
import { isSaved, type Saved } from './save.ts';

let stage: ReturnType<typeof phoneStage> | null = null;
let buildingExpanded = false;

let selectedSpeed: number | null = null;
let infoOpen = false;
let selection: { to: Place; person: Rid | null; task: number | null } | null = null;
const SAVE_KEY = 'stairwell:notebook';
const journalPositions = new WeakMap<
  HTMLElement,
  { position: ReturnType<typeof journalPosition>; top: number }
>();

interface Ui {
  s: GameState | null;
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
  readUntil: number;
}

const ui: Ui = {
  s: null,
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
  readUntil: 0,
};

const notice = telemetryNotice();
if (notice) Object.assign(notice.style, { position: 'static', transform: 'none', margin: '0 auto' });
const app = () => document.getElementById('app') as HTMLElement;
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- saves ----------

function save() {
  const s = ui.s;
  if (!s) return;
  try {
    const text = JSON.stringify({ game: GAME_VERSION, seed: s.seed, inputs: s.inputs, minute: s.minute });
    localStorage.setItem(SAVE_KEY, text);
    lab.captureSave(JSON.parse(text));
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
  const lines = s.lineNo;
  act(s, inp);
  ui.acc = 0;
  if (inp.kind === 'go') ui.readUntil = 0;
  else if (s.said.some((line) => (line.n ?? -1) >= lines && line.kind !== 'journal'))
    ui.readUntil = performance.now() + 6000;
  save();
  render(false);
}

function begin(s: GameState) {
  ui.s = s;
  selection = null;
  buildingExpanded = false;
  ui.sheet = 'none';
  ui.sheetFor = null;
  ui.pendingPerson = null;
  ui.acc = 0;
  ui.readUntil = 0;
  ui.dismissed = '';
  save();
  render(true);
}

export function start() {
  lab.trackRun(
    () => {
      try {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) lab.captureSave(JSON.parse(saved));
      } catch {}
      return ui.s ? structuredClone({ ...runOf(), state: ui.s }) : null;
    },
    {
      runKey: () => ui.s?.seed ?? 'title',
      getLogs: () => ui.s?.said.slice(-40).map((line) => line.text) ?? [],
    },
  );
  titlePage();
  // Font swaps can reflow the log after render, without advancing the game clock.
  document.fonts.addEventListener('loadingdone', () => {
    const el = app().querySelector<HTMLElement>('.journal');
    const saved = el && journalPositions.get(el);
    if (el && saved && el.clientHeight > 0) {
      // A reader may have scrolled before its queued scroll event is delivered.
      const position = el.scrollTop === saved.top ? saved.position : journalPosition(el);
      restoreJournalPosition(el, position);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  window.addEventListener('pagehide', save);
  window.addEventListener('resize', () => {
    if (matchMedia('(min-width: 900px)').matches) buildingExpanded = false;
    if (ui.s?.phase === 'day') render(false);
  });
  requestAnimationFrame(loop);
  if ('serviceWorker' in navigator && !import.meta.env.DEV)
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function loop(t: number) {
  // Keep reading position current even while the clock is held. Browser scroll
  // events can remain queued until after a late font changes the line heights.
  const overlay = app().querySelector<HTMLElement>('.speech-overlay');
  if (overlay && t >= ui.readUntil) overlay.textContent = '';
  const log = app().querySelector<HTMLElement>('.journal');
  if (log) rememberJournalScroll(log);
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
    if (rate === 0 || t < ui.readUntil) ui.acc = 0;
    else ui.acc += dt * rate;
    let n = 0;
    while (ui.acc >= 1 && n < 30 && s.phase === 'day') {
      ui.acc -= 1;
      const lines = s.lineNo;
      const tasks = openTasks(s)
        .map((task) => task.id)
        .join(',');
      const faces = faceToFace(s).join(',');
      step(s);
      n++;
      if (
        s.said.some((line) => (line.n ?? -1) >= lines && line.kind !== 'journal') ||
        openTasks(s)
          .map((task) => task.id)
          .join(',') !== tasks ||
        faceToFace(s).join(',') !== faces
      ) {
        const words = s.said
          .filter((line) => (line.n ?? -1) >= lines)
          .map((line) => line.text)
          .join(' ');
        ui.readUntil = t + Math.min(12000, Math.max(4000, words.length * 45));
        ui.acc = 0;
        break;
      }
      if (clockPlayback(s).rate !== rate) {
        ui.acc = 0;
        break;
      }
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

function pacingContext(s: GameState) {
  const faces = faceToFace(s);
  const who = ui.sheetFor ?? faces[0];
  const talking =
    !s.k.walk && s.k.busyTask === null && !!who && faces.includes(who) && ui.dismissed !== `${s.k.at}:${who}`;
  const inspecting = infoOpen || ['notebook', 'orders', 'residents', 'tell', 'invent'].includes(ui.sheet);
  return { talking, inspecting };
}

function clockPlayback(s: GameState) {
  const { talking, inspecting } = pacingContext(s);
  return playback(s, talking, inspecting, selectedSpeed);
}

// ---------- pages ----------

const footer = `<div class="footer"><a href="https://human.adamwhite.work">People by the Human Framework</a></div>`;

function topbar(words: string, title = false) {
  return `<header class="topbar"><div class="topbar-words">${title ? '<a href="https://human.adamwhite.work/games/">All games</a>' : esc(words)}</div><button class="info" aria-label="Information" popovertarget="game-info">i</button><span class="menu-slot"></span></header><div id="game-info" class="info-popover" popover="auto"><button class="x" data-info-close aria-label="Close information">×</button><div class="info-content"></div></div>`;
}
function infoContent(s: GameState | null) {
  const who = s && (ui.sheetFor ?? faceToFace(s)[0]);
  const phase = s?.phase;
  const [heading, text] = !s
    ? [
        'The job',
        'Rıza kept this door for forty years. Bread by eight, then shopping, parcels, odd jobs, and the bins down by 20:45. Seven flats will tell you things. On Sunday they vote on your tea money. Nothing happens while you are away.',
      ]
    : phase === 'night'
      ? [
          'The night page',
          'What the day earned, what went into the tin, and what was said on the stairs while you worked.',
        ]
      : phase !== 'day'
        ? [
            'The meeting',
            'Each flat raises a hand or not. The tally is Rıza’s own reckoning, not a measure of people.',
          ]
        : who && ui.dismissed !== `${s.k.at}:${who}`
          ? [
              'Talking',
              'Ask for news once a day. Tell… passes on what you heard, as you heard it or for certain. A made-up story can come back to you. Sit a minute once a day. From Thursday you can ask for a word on Sunday; a promise can still be broken.',
            ]
          : [
              'Orders and the stairs',
              'Tap an order, a name or a place on the building to see the trip. Go starts walking; a walk cannot be turned back. Arriving picks up or hands over on its own. A dot over a door means something is for them. Climbing tires you, and the trip says so. Time slows while orders wait and stops while you talk or read a list.',
            ];
  return `<h2>${heading}</h2><p>${text}</p>`;
}
function mountMenu(target: Element | null, s: GameState | null) {
  if (!target) return;
  target.append(
    gameMenu({
      hasRun: !!s,
      getRun: () => runOf(ui.s ?? s),
      speed: () => selectedSpeed,
      setSpeed: (speed) => {
        selectedSpeed = speed;
        ui.acc = 0;
      },
      beforeOpen: save,
      readNotebook:
        s?.phase === 'day' && ui.s
          ? () => {
              ui.sheet = 'notebook';
              ui.sheetKey = '';
              render(false);
            }
          : undefined,
      title: ui.s ? titlePage : undefined,
    }),
  );
  const info = app().querySelector<HTMLElement>('#game-info');
  if (info) {
    info.querySelector('.info-content')!.innerHTML = infoContent(ui.s);
    info.addEventListener('toggle', () => {
      infoOpen = info.matches(':popover-open');
      ui.acc = 0;
      if (ui.s?.phase === 'day') render(false);
    });
    info.querySelector('[data-info-close]')?.addEventListener('click', () => info.hidePopover());
  }
}

function titlePage() {
  save();
  labScreen('title');
  stage?.destroy();
  stage = null;
  ui.s = null;
  infoOpen = false;
  const saved = loadSaved();
  const savedState = saved ? replay(saved.seed, saved.inputs, saved.minute) : null;
  app().innerHTML = `<div class="page title">${topbar('', true)}<main class="page-body"><div class="title-premise"><h1>The Stairwell</h1><p>Keep seven flats supplied through Saturday. On Sunday, the residents vote on your tea money.</p><p>Rıza left you his caretaker’s notebook. The job is yours.</p><p class="soft small">Six days and a Sunday. Nothing happens while you are away.</p></div><button data-a="other">Other ways in ▸</button><div class="title-spacer"></div></main><div class="action-bar">
    ${savedState ? `<button class="primary" data-a="continue" aria-describedby="saved-summary">Continue</button><span class="soft small" id="saved-summary" data-save-summary>${DAY_NAMES[dayOf(savedState.minute) - 1]} · ${clockOf(savedState.minute)} · ${esc(placeName(savedState.k.at))}${savedState.phase !== 'day' ? ` · ${savedState.phase === 'night' ? 'night page' : 'the meeting'}` : ''}</span>` : ''}
    <button class="${saved ? '' : 'primary'}" data-a="new">${saved ? 'A new notebook' : 'Begin on Monday'}</button><div class="new-confirm" hidden>The old notebook will be replaced.<div class="row"><button data-a="yes-new">Yes, begin</button><button data-a="no-new">No</button></div></div>${footer}</div></div>`;
  if (notice && !notice.dataset.shown) {
    app().querySelector('.title-spacer')?.append(notice);
    notice.dataset.shown = '1';
  }
  mountMenu(app().querySelector('.menu-slot'), savedState);
  app()
    .querySelector('[data-a=continue]')
    ?.addEventListener('click', () => {
      if (savedState) begin(savedState);
    });
  const fresh = () => begin(newGame((Date.now() % 1_000_000) + 1));
  app()
    .querySelector('[data-a=new]')
    ?.addEventListener('click', () => {
      if (saved) app().querySelector<HTMLElement>('.new-confirm')!.hidden = false;
      else fresh();
    });
  app().querySelector('[data-a=yes-new]')?.addEventListener('click', fresh);
  app()
    .querySelector('[data-a=no-new]')
    ?.addEventListener('click', () => {
      app().querySelector<HTMLElement>('.new-confirm')!.hidden = true;
    });
  app()
    .querySelector('[data-a=other]')
    ?.addEventListener('click', () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'other-ways';
      const ms = saved ? mornings(saved) : [];
      dialog.innerHTML = `<div class="who"><b>Other ways in</b><button class="x" data-a="close" aria-label="Close other ways in">×</button></div><div class="sheet-body">${ms.length > 1 ? ms.map((m, i) => `<div><button data-morning="${i}">Turn back to ${DAY_NAMES[m.day - 1]} morning</button><div data-confirm="${i}" hidden>Everything after that morning is torn out.<div class="row"><button data-yes="${i}">Yes, turn back</button><button data-no="${i}">No</button></div></div></div>`).join('') : ''}<label class="file-button">Load a playtest run<input type="file" accept="application/json"></label></div>`;
      document.body.append(dialog);
      dialog.showModal();
      dialog.querySelector('[data-a=close]')?.addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => dialog.remove());
      dialog.querySelector<HTMLInputElement>('input')?.addEventListener('change', (e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) {
          dialog.close();
          importRun(f);
        }
      });
      dialog.querySelectorAll<HTMLElement>('[data-morning]').forEach((b) => {
        b.addEventListener('click', () => {
          dialog.querySelector<HTMLElement>(`[data-confirm="${b.dataset.morning}"]`)!.hidden = false;
        });
      });
      dialog.querySelectorAll<HTMLElement>('[data-no]').forEach((b) => {
        b.addEventListener('click', () => {
          dialog.querySelector<HTMLElement>(`[data-confirm="${b.dataset.no}"]`)!.hidden = true;
        });
      });
      dialog.querySelectorAll<HTMLElement>('[data-yes]').forEach((b) => {
        b.addEventListener('click', () => {
          const m = ms[Number(b.dataset.yes)];
          if (saved && m) {
            dialog.close();
            begin(replay(saved.seed, m.inputs));
          }
        });
      });
    });
}

function render(full: boolean) {
  labScreen('play');
  const s = ui.s;
  if (!s) return;
  if (s.phase !== 'day') {
    stage?.destroy();
    stage = null;
  }
  if (s.phase === 'night') return nightPage(s);
  if (s.phase === 'sunday' || s.phase === 'end') return sundayPage(s);
  dayView(s, full);
}

// ---------- the day ----------

function dayView(s: GameState, full: boolean) {
  const oldLog = app().querySelector<HTMLElement>('.journal');
  const position =
    oldLog && oldLog.clientHeight === 0
      ? (journalPositions.get(oldLog)?.position ?? journalPosition(oldLog))
      : journalPosition(oldLog);
  let root = app().querySelector<HTMLElement>('.day');
  if (!root || full) {
    app().innerHTML = `<div class="day game tab-here">${topbar('')}<div class="state-strip"><div class="order-pips"></div><span class="next-due"></span><span class="clock-rate"></span></div><section class="scene" aria-label="Building view"><div class="scene-drawing"></div><div class="speech-overlay" aria-live="polite"></div></section><div class="play-panel"><nav class="sheet-tabs" aria-label="Views"><button data-tab="none">Here</button><button data-tab="orders">Orders</button><button data-tab="residents">Residents</button></nav><section class="sheet" aria-label="Neighbour or orders"></section><section class="journal" aria-label="Journal"></section></div><div class="action-bar"></div></div>`;
    root = app().querySelector<HTMLElement>('.day')!;
    stage?.destroy();
    stage = null;
    mountMenu(root.querySelector('.menu-slot'), s);
    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        ui.sheet = b.dataset.tab as Ui['sheet'];
        if (ui.sheet === 'none') selection = null;
        ui.sheetKey = '';
        render(false);
      });
    });
    root.querySelector('.scene')?.addEventListener('click', (e) => {
      const hit = (e.target as Element).closest('[data-go]');
      if (hit) choose(s, hit.getAttribute('data-go') as Place);
    });
    root.querySelector('.scene')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        const hit = (e.target as Element).closest('[data-go]');
        if (hit) {
          e.preventDefault();
          choose(s, hit.getAttribute('data-go') as Place);
        }
      }
    });
    ui.sheetKey = '';
  }
  const d = dayOf(s.minute);
  const faces = faceToFace(s);
  root.querySelector('.topbar-words')!.textContent =
    `${DAY_NAMES[d - 1]?.slice(0, 3)} ${clockOf(s.minute)} · ${s.k.walk ? `→ ${placeName(s.k.walk.to)}` : placeName(s.k.at)}`;
  root.querySelector('.info-content')!.innerHTML = infoContent(s);
  const ctx = pacingContext(s);
  const who = ui.sheetFor ?? faces[0];
  const slowed = ctx.inspecting
    ? 'Reading · time waits'
    : ctx.talking
      ? `${who ? RESIDENTS[who].name : 'Someone'} is talking · time waits`
      : !s.k.walk && openTasks(s).length
        ? 'slowed: orders waiting'
        : '';
  root.querySelector('.clock-rate')!.textContent = slowed;
  const tasks = openTasks(s).sort((a, b) => Number(!!b.carried) - Number(!!a.carried) || a.by - b.by);
  root.querySelector('.order-pips')!.innerHTML = s.tasks
    .filter((t) => dayOf(t.by) === d)
    .map(
      (t) =>
        `<span class="pip ${t.done ? 'done' : ''} ${!t.done && s.minute > t.by ? 'late' : ''}">${t.done ? '■' : '□'}</span>`,
    )
    .join('');
  root.querySelector('.next-due')!.textContent = tasks.length ? `next by ${clockOf(tasks[0]!.by)}` : '';
  for (const b of root.querySelectorAll<HTMLElement>('[data-tab]')) {
    const active =
      b.dataset.tab === ui.sheet || (b.dataset.tab === 'none' && !['orders', 'residents'].includes(ui.sheet));
    b.setAttribute('aria-pressed', String(active));
    b.textContent =
      b.dataset.tab === 'orders'
        ? `Orders ${tasks.length}`
        : b.dataset.tab === 'residents'
          ? 'Residents'
          : who
            ? RESIDENTS[who].name
            : 'Here';
  }
  root.classList.toggle('tab-here', !['orders', 'residents', 'notebook'].includes(ui.sheet));
  root.classList.toggle('decision', ['tell', 'invent'].includes(ui.sheet));
  root.classList.toggle('travelling', !!s.k.walk || s.k.busyTask !== null);
  root.querySelector('.scene-drawing')!.innerHTML = sceneSvg(s);
  for (const hit of root.querySelectorAll<SVGElement>('.scene [data-go]')) {
    hit.setAttribute('tabindex', s.k.walk || s.k.busyTask !== null ? '-1' : '0');
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', placeName(hit.getAttribute('data-go') as Place));
    hit.setAttribute('aria-pressed', String(selection?.to === hit.getAttribute('data-go')));
  }
  const voice = [...s.said].reverse().find((x) => x.kind === 'voice');
  root.querySelector<HTMLElement>('.speech-overlay')!.textContent =
    voice && performance.now() < ui.readUntil ? `${nameOf(voice.who)}: ${voice.text}` : '';
  const panel = root.querySelector<HTMLElement>('.sheet')!;
  const action = root.querySelector<HTMLElement>('.action-bar')!;
  const previousVerbs = action.querySelector('.verbs');
  if (previousVerbs && panel.classList.contains('conversation')) panel.append(previousVerbs);
  const expectedSubmenu = `${ui.sheetFor ?? faces[0] ?? null}:${ui.sheet}:${ui.inventAbout}`;
  if (['tell', 'invent'].includes(ui.sheet) && panel.dataset.submenu === expectedSubmenu) {
    while (action.firstChild) panel.append(action.firstChild);
  }

  // Keep the journal node stable while lists and conversation content change.
  const scroll = panel.scrollTop;
  const detailsOpen = !!panel.querySelector('details[open]');
  ui.sheetKey = '';
  sheet(s, panel);
  panel.scrollTop = scroll;
  if (detailsOpen) panel.querySelector('details')?.setAttribute('open', '');
  const verbs = panel.querySelector<HTMLElement>('.verbs');
  const submenu = ui.sheet === 'tell' || ui.sheet === 'invent';
  if (submenu && who && !faces.includes(who)) {
    const status = panel.querySelector('.availability');
    if (status) status.textContent = departureLine(s, who);
    for (const b of panel.querySelectorAll<HTMLButtonElement>(
      'button:not([data-a=close]):not([data-a=back])',
    ))
      b.disabled = true;
  }
  root.classList.toggle('has-conversation', panel.classList.contains('conversation'));
  if (selection && !submenu && ui.sheet !== 'notebook') {
    tripActions(s, action);
  } else if (verbs) {
    action.replaceChildren(verbs);
  } else if (submenu) {
    const commit = panel.lastElementChild;
    action.replaceChildren();
    if (commit) action.append(commit);
  } else if (ui.sheet === 'notebook') action.innerHTML = '';
  else tripActions(s, action);
  journal(s, root.querySelector<HTMLElement>('.journal')!, position);
}

function choose(s: GameState, to: Place, person: Rid | null = null, task: number | null = null) {
  if (s.k.walk || s.k.busyTask !== null) return;
  if (to === s.k.at) {
    selection = null;
    goTo(s, to, person);
    return;
  }
  selection = { to, person, task };
  render(false);
}
function tripActions(s: GameState, el: HTMLElement) {
  if (s.k.walk) {
    el.innerHTML = `<div class="travel-status">${s.k.walk.from === s.k.walk.to ? 'Sitting a minute · done' : `On the way to ${esc(placeName(s.k.walk.to))} · there`} about ${clockOf(s.k.walk.at1)}</div>`;
    return;
  }
  if (s.k.busyTask !== null) {
    const t = s.tasks.find((t) => t.id === s.k.busyTask);
    el.innerHTML = `<div class="travel-status">Working: ${esc(t?.label ?? '')} · done about ${clockOf(s.k.busyUntil)}</div>`;
    return;
  }
  const tasks = openTasks(s).sort((a, b) => Number(!!b.carried) - Number(!!a.carried) || a.by - b.by);
  const task = selection
    ? selection.task !== null
      ? tasks.find((t) => t.id === selection?.task)
      : tasks.find((t) => t.place === selection?.to && (t.carried || !t.pickup))
    : tasks[0];
  const to = selection?.to ?? (task ? (task.carried || !task.pickup ? task.place : task.pickup) : null);
  if (to) {
    const first = travelMinutes(s, s.k.at, to);
    const second = task && !task.carried && task.pickup ? travelMinutes(s, to, task.place) : 0;
    const arrive = s.minute + first + second;
    const legs = legsLine(s, task?.place ?? to);
    const person = selection?.person;
    const title = task
      ? `${task.kind === 'bins' ? 'Bins' : RESIDENTS[task.for].name} · ${task.label}`
      : person
        ? `${RESIDENTS[person].name} · flat ${RESIDENTS[person].flat}`
        : placeName(to);
    el.innerHTML = `<div class="trip-line"><b>${esc(title)}</b><span>${esc(placeName(to))} ${first} min${second ? `, then ${esc(placeName(task!.place))} ${second} min` : ''} · ${legs ? esc(legs) : `there about ${clockOf(arrive)}`}${task ? ` · due ${clockOf(task.by)}` : ''}${task && arrive > task.by ? `<strong class="late"> · late by about ${arrive - task.by} min</strong>` : ''}${!task && to.startsWith('door:') && rOf(s, to.slice(5) as Rid).where === 'work' ? ` · ${RESIDENTS[to.slice(5) as Rid].name} is out` : ''}</span></div><button class="primary" data-a="go">Go to ${esc(placeName(to))}</button>${selection && !task ? '<button data-a="clear-trip">Back</button>' : ''}`;
    el.querySelector('[data-a=go]')?.addEventListener('click', () => {
      const p = selection?.person ?? null;
      selection = null;
      goTo(s, to, p);
    });
    el.querySelector('[data-a=clear-trip]')?.addEventListener('click', () => {
      selection = null;
      render(false);
    });
  } else {
    const { talking, inspecting } = pacingContext(s);
    el.innerHTML = canWait(s, talking, inspecting)
      ? '<button class="primary" data-a="wait" aria-label="Skip to the next event">Skip ⏩</button>'
      : '';
    el.querySelector('[data-a=wait]')?.addEventListener('click', () => {
      const ctx = pacingContext(s);
      if (!canWait(s, ctx.talking, ctx.inspecting)) return;
      untilSomethingHappens(s);
      ui.acc = 0;
      ui.readUntil = performance.now() + 8000;
      save();
      render(false);
    });
  }
}
function goTo(s: GameState, to: Place, person: Rid | null = null) {
  if (s.k.walk || s.k.busyTask !== null) return;
  ui.pendingPerson = person;
  ui.sheetFor = null;
  if (to === s.k.at) {
    ui.dismissed = '';
    ui.sheet = 'none';
    ui.sheetKey = '';
    send({ kind: 'go', to });
    return;
  }
  ui.sheet = 'none';
  ui.dismissed = '';
  send({ kind: 'go', to });
}

// The building, drawn: floors from the top, flats on each landing, the stair zigzag on the left.
const W = 360;
const FLOOR_H = 44;
const TOP_Y = 16;
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
  const cropped = (ui.sheet === 'tell' || ui.sheet === 'invent') && matchMedia('(max-width: 899px)').matches;
  const focusFloor = floorOf(s.k.walk?.to ?? s.k.at);
  const parts: string[] = [];
  const H = 288;
  // Roof line and floors.
  parts.push(`<path class="ink" d="${wob(30, TOP_Y + 4, 300, TOP_Y + 4, 1)}"/>`);
  parts.push(`<rect class="hit" data-go="roof" x="98" y="0" width="62" height="44"/>`);
  parts.push(`<text class="lbl soft" x="130" y="${TOP_Y - 2}" text-anchor="middle">roof</text>`);
  for (let f = TOP_FLOOR; f >= 0; f--) {
    const y = floorY(f);
    parts.push(`<path class="ink" d="${wob(30, y, 300, y, f + 3)}"/>`);
    parts.push(`<path class="soft-ink" d="${wob(48, y, 96, y - FLOOR_H + 4, f + 9)}"/>`);
    parts.push(
      `<rect class="hit" data-go="landing:${f}" x="30" y="${y - FLOOR_H + 6}" width="64" height="${FLOOR_H}"/>`,
    );
    parts.push(`<text class="lbl soft" x="34" y="${y - 4}">${f === 0 ? 'G' : f}</text>`);
  }
  // Targets occupy disjoint columns or rows. The bottom row starts after the ground-floor targets.
  // Ground: your room below, the step and the street.
  const g = floorY(0);
  parts.push(`<path class="ink" d="${wob(30, g + 28, 300, g + 28, 21)}"/>`);
  parts.push(`<rect class="hit" data-go="room" x="30" y="${g + 6}" width="90" height="46"/>`);
  parts.push(`<text class="lbl" x="44" y="${g + 26}">your room</text>`);
  parts.push(`<rect class="hit" data-go="step" x="122" y="${g + 6}" width="70" height="46"/>`);
  parts.push(`<text class="lbl" x="128" y="${g + 26}">the step</text>`);
  parts.push(
    `<path class="ink" d="${wob(300, TOP_Y + 4, 300, g + 28, 30)}"/><path class="ink" d="${wob(30, TOP_Y + 4, 30, g + 28, 31)}"/>`,
  );
  parts.push(`<rect class="hit" data-go="shop" x="304" y="${g - 50}" width="56" height="46"/>`);
  parts.push(`<text class="lbl" x="306" y="${g - 18}">shop</text>`);
  parts.push(`<rect class="hit" data-go="bakery" x="304" y="${g + 6}" width="56" height="46"/>`);
  parts.push(`<text class="lbl" x="306" y="${g + 26}">bakery</text>`);
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
    if (cropped && info.floor !== focusFloor) continue;
    const x = doorX(id);
    const hitWidth = x === 132 ? 86 : 296 - (x - 34);
    const y = floorY(info.floor);
    const pl = `door:${id}` as Place;
    const want = carriedFor.has(pl) || wantedAt.has(pl);
    parts.push(`<g class="door${selection?.to === pl ? ' selected' : ''}${want ? ' want' : ''}" data-go="${pl}" tabindex="0" role="button" aria-label="${info.name}, flat ${info.flat}">
      <rect class="hit" x="${x - 34}" y="${y - FLOOR_H + 6}" width="${hitWidth}" height="${FLOOR_H}"/>
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
  const cropY = Math.max(0, Math.min(H - 88, floorY(focusFloor) - 64));
  return `<svg viewBox="0 ${cropped ? cropY : 0} ${W} ${cropped ? 88 : H}" preserveAspectRatio="none" role="group" aria-label="${cropped ? 'Current floor' : 'The building'}">${parts.join('')}</svg>`;
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
  return `<button class="task${current ? ' current' : ''}${late ? ' late' : ''}${t.carried ? ' carried' : ''}" data-t="${t.id}" aria-pressed="${current}">
    <span class="t">${t.carried ? '◼ ' : ''}${esc(who)}</span> <span>${esc(what)}</span>
    <span class="hand soft">${where}, ${when}${late ? ' · late' : ''} · ${travelMinutes(s, s.k.at, t.carried || !t.pickup ? t.place : t.pickup)}${!t.carried && t.pickup ? ` + ${travelMinutes(s, t.pickup, t.place)}` : ''} min</span></button>`;
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

function rememberJournalScroll(el: HTMLElement) {
  if (el.clientHeight === 0) return;
  const saved = journalPositions.get(el);
  if (saved && el.scrollTop !== saved.top)
    journalPositions.set(el, { position: journalPosition(el), top: el.scrollTop });
}

function journal(s: GameState, el: HTMLElement, position: ReturnType<typeof journalPosition>) {
  if (!journalPositions.has(el)) {
    el.addEventListener('scroll', () => rememberJournalScroll(el));
  }
  const lines = s.said.filter((x) => dayOf(x.at) === dayOf(s.minute) || x.kind === 'margin').slice(-40);
  const key = lines.map((x) => `${x.n}:${x.at}:${x.text}`).join('|');
  if (el.dataset.k !== key) {
    el.dataset.k = key;
    el.innerHTML = lines.map(saidLine).join('');
  }
  restoreJournalPosition(el, position);
}

function restoreJournalPosition(el: HTMLElement, position: ReturnType<typeof journalPosition>) {
  if (el.clientHeight === 0) return;
  if (position.atEnd) el.scrollTop = el.scrollHeight;
  else {
    const row = [...el.children].find((row) => row.getAttribute('data-n') === position.n);
    if (row)
      el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - position.offset;
    else el.scrollTop = 0; // The entry was removed: resume at the oldest surviving entry.
  }
  journalPositions.set(el, { position: journalPosition(el), top: el.scrollTop });
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
    if (orders && canSwap(s) && !el.querySelector('[data-a=swap]')) {
      const b = document.createElement('button');
      b.className = 'prank';
      b.dataset.a = 'swap';
      b.textContent = 'Swap Nermin’s and Sevim’s papers';
      b.addEventListener('click', () => send({ kind: 'prank', what: 'swap' }));
      el.insertBefore(b, items);
    }
    if (orders) {
      // Keep existing rows in place. Requests that arrive while reading append below.
      const open = openTasks(s).sort((a, b) => Number(!!b.carried) - Number(!!a.carried) || a.by - b.by);
      for (const task of open) {
        let button = items.querySelector<HTMLButtonElement>(`[data-t="${task.id}"]`);
        const fresh = document.createElement('div');
        fresh.innerHTML = taskLine(s, task, task.id === (selection?.task ?? open[0]?.id));
        const next = fresh.firstElementChild as HTMLButtonElement;
        if (!button) {
          button = next;
          button.addEventListener('click', () => {
            if (!task.done) choose(s, task.carried || !task.pickup ? task.place : task.pickup, null, task.id);
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
            if (row) choose(s, row.dataset.go as Place, id);
          });
          items.append(button);
        }
        button.dataset.go = to;
        button.setAttribute('aria-pressed', String(selection?.person === id));
        const html = `${esc(info.name)} <span class="soft">· flat ${info.flat} · ${esc(status)} · ${travelMinutes(s, s.k.at, to)} min</span>`;
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
  if (s.k.walk || s.k.busyTask !== null) {
    ui.sheetFor = null;
    el.innerHTML = '';
    return;
  }
  if (ui.pendingPerson) {
    if (faces.includes(ui.pendingPerson) || faces.length) ui.sheetFor = ui.pendingPerson;
    ui.pendingPerson = null;
  }
  // A departure disables the chosen person's controls; only Close reveals routes.
  const who = ui.sheetFor ?? faces[0] ?? null;
  if (who) ui.sheetFor = who;
  const submenu = `${who}:${ui.sheet}:${ui.inventAbout}`;
  if (who && (ui.sheet === 'tell' || ui.sheet === 'invent') && el.dataset.submenu === submenu) {
    const present = faces.includes(who);
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
    el.querySelector('[data-a=swap]')?.addEventListener('click', () => send({ kind: 'prank', what: 'swap' }));
    el.querySelector('[data-a="gate"]')?.addEventListener('click', () =>
      send({ kind: 'prank', what: 'gate' }),
    );
    el.querySelector('[data-a="knock"]')?.addEventListener('click', () => {
      if (at.startsWith('door:')) send({ kind: 'knock', who: at.slice(5) as Rid });
    });
    for (const b of el.querySelectorAll<HTMLElement>('[data-go]'))
      b.addEventListener('click', () => choose(s, b.dataset.go as Place));
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
      b.addEventListener('click', () => choose(s, b.dataset.go as Place));
    return;
  }
  const html = doorHtml(s, who, faces);
  if (conversation && el.classList.contains('conversation') && el.dataset.who === who) {
    // Preserve the actual action buttons through asynchronous speech and departures.
    const fresh = document.createElement('div');
    fresh.innerHTML = html;
    const context = el.querySelector('.door-context') as HTMLElement;
    const next = fresh.querySelector('.door-context') as HTMLElement;
    if (context.querySelector('details')?.open) next.querySelector('details')?.setAttribute('open', '');
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

function canSwap(s: GameState) {
  const open = openTasks(s);
  return (
    s.swappedDay !== dayOf(s.minute) &&
    ['nermin', 'sevim'].every((id) => open.some((t) => t.carried && t.kind === 'bread' && t.for === id))
  );
}

function placeHtml(s: GameState, _small = false): string {
  const at = s.k.at;
  const bits: string[] = [];
  if (canSwap(s)) bits.push('<button class="prank" data-a="swap">Swap Nermin’s and Sevim’s papers</button>');

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
      ? `<div class="faces">${faces.map((f) => `<button class="${f === who ? 'on' : ''}" data-face="${f}" aria-pressed="${f === who}">${RESIDENTS[f].name}</button>`).join('')}</div>`
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
  const speech = lastLine?.text ?? '';
  const longSpeech = speech.length > 240;
  const spoken = longSpeech
    ? `<details><summary>Read ${esc(info.name)}’s full answer</summary><div class="hand said">${esc(speech)}</div></details>`
    : `<div class="hand said">${esc(speech)}</div>`;
  const title = `<div class="who"><b>${esc(info.call)}</b><button class="x" data-a="close" aria-label="Close conversation">✕</button></div>`;
  return `${title}<div class="door-context">${tabs}<div class="soft small">flat ${info.flat} · ${read.warmth}, ${read.word}</div>
    ${present ? (lastLine ? spoken : `<div class="soft small">${esc(info.blurb)}</div>`) : `<div class="hand departure">${esc(departure)}</div>`}
    ${grudge ? `<div class="hand rope">“I hear you’ve been saying things about me.”</div>` : ''}
    ${present ? carriedOther.map((t) => `<button class="prank" data-mis="${t.id}">Leave ${esc(RESIDENTS[t.for].name)}’s parcel here</button>`).join('') : ''}</div>
    <div class="verbs lk-commit">
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
    selection = null;
    ui.sheetFor = b.dataset.face as Rid;
    ui.sheet = 'none';
    reset();
  });
  on('[data-a="close"]', () => {
    ui.dismissed = `${s.k.at}:${who}`;
    ui.sheetFor = who;
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
    </div>`;
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
  app().innerHTML = `<div class="page night">${topbar(`${DAY_NAMES[d - 1]}, night`)}<div class="state-strip"><div class="order-pips">${s.tasks
    .filter((t) => dayOf(t.by) === d)
    .map(
      (t) =>
        `<span class="pip ${t.done ? (t.done > t.by ? 'late' : 'done') : 'missed'}">${t.done ? (t.done > t.by ? '◩' : '■') : '□'}</span>`,
    )
    .join('')}</div><span>₺${s.k.money} in the tin</span></div><main class="page-body">
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
    </main><div class="action-bar"><button class="primary" data-a="next">${d === 6 ? 'Sunday: the meeting' : `Turn the page: ${DAY_NAMES[d]}`}</button>
    </div>
  </div>`;
  mountMenu(app().querySelector('.menu-slot'), s);
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

/** Rıza's optional game reckoning uses only recorded work and the meeting's hands. */
function weekTallyHtml(s: GameState): string {
  const onTime = s.reports.reduce((n, day) => n + day.done, 0);
  const late = s.reports.reduce((n, day) => n + day.late, 0);
  const hands = s.meeting?.yes ?? 0;
  const total = 2 * onTime + late + 5 * hands;
  return `<section data-week-tally id="week-tally" hidden aria-label="Rıza’s week tally">
    <h3>Rıza’s week tally: ${total}</h3>
    <p>On-time jobs ${onTime} × 2 + late jobs ${late} × 1 + hands raised ${hands} × 5 = ${total}.</p>
    <p class="hand soft">This game’s own reckoning, not a measure of people. “A little sum for the notebook.” — Rıza</p>
  </section>`;
}

function sundayPage(s: GameState) {
  labScreen('ending');
  const m = s.meeting;
  const lines = s.said.filter((x) => dayOf(x.at) === 7);
  const total = s.reports.reduce((a, x) => a + x.tips, 0);
  const secrets = Object.keys(s.secrets).length;
  const caught = s.residents.reduce((a, r) => a + r.caught.length + r.grudges.length, 0);
  const share = `The Stairwell, week 1: ₺${s.k.money} in the tin, ${secrets}/${SECRET_PROPS.length} secrets, caught ${caught}×, tea money ${m?.raise ? 'up' : 'unchanged'} (${m?.yes ?? 0} hands).${s.ring.answer === 'yes' ? ' A ring on the roof.' : ''}${s.catHome ? ' A cat on the step.' : ''} ◇`;
  app().innerHTML = `<div class="page sunday">${topbar('Sunday · the meeting')}<main class="page-body">
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
    <button data-a="see-tally" aria-controls="week-tally" aria-expanded="false">See the tally</button>${weekTallyHtml(s)}
    <div class="share"><div class="soft small">To share:</div><div class="hand">${esc(share)}</div><button data-a="copy">Copy</button></div>
    <p class="soft small">Week 2 is still being written. Your notebook is saved.</p>
    </main><div class="action-bar"><div class="row"><button data-a="feedback">Send word</button><button data-a="download">Download this run</button></div><button class="primary" data-a="title">Close the notebook</button></div>
  </div>`;
  mountMenu(app().querySelector('.menu-slot'), s);
  app()
    .querySelector('[data-a="see-tally"]')
    ?.addEventListener('click', (event) => {
      const tally = app().querySelector<HTMLElement>('[data-week-tally]');
      if (!tally) return;
      tally.hidden = !tally.hidden;
      (event.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!tally.hidden));
    });
  app()
    .querySelector('[data-a="copy"]')
    ?.addEventListener('click', () => navigator.clipboard?.writeText(share).catch(() => {}));
  app()
    .querySelector('[data-a="feedback"]')
    ?.addEventListener('click', () => openFeedback(() => runOf(s)));
  app()
    .querySelector('[data-a="download"]')
    ?.addEventListener('click', () => downloadRun(runOf(s)));
  app().querySelector('[data-a="title"]')?.addEventListener('click', titlePage);
}

export const _debug = {
  get s() {
    return ui.s;
  },
  send,
  render: () => render(false),
  advance: (n: number) => {
    if (!ui.s) return;
    for (let i = 0; i < n && ui.s.phase === 'day'; i++) step(ui.s);
    render(false);
  },
  step: (n: number) => {
    const s = ui.s;
    if (!s) return;
    for (let i = 0; i < n && s.phase === 'day'; i++) step(s);
    render(true);
  },
};
