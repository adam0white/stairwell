// A text front end to the same simulation, for playtesters who play by command line.
// Usage: node scripts/play.ts <save.json> <command> [args]   (run with no command for help)
// The save is the same notebook as the web game: seed, inputs and the minute you stopped at.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  act,
  clockOf,
  DAY_NAMES,
  dayOf,
  faceToFace,
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
  placeName,
  readOf,
  replay,
  rOf,
  SECRET_PROPS,
  step,
  tellables,
  travelMinutes,
  wordHint,
} from '../src/sim/game.ts';
import { RESIDENTS, RIDS, type Rid } from '../src/sim/people.ts';

interface Save {
  game: string;
  seed: number;
  inputs: Input[];
  minute: number;
  seen: number;
}

const [file, cmd, ...args] = process.argv.slice(2);
if (!file) {
  console.log('usage: node scripts/play.ts <save.json> <command>');
  process.exit(1);
}

const HELP = `Commands:
  new [seed]           start a new notebook (Monday 07:00)
  look                 what is in front of you
  go <place>           walk somewhere: room, step, bakery, shop, roof, landing:<0-4>, or a name (nermin, sevim, burak, huseyin, derya, elif, tarik) for their door
  task <n>             walk to where board item n needs you
  wait [minutes]       let time pass (default 15); stops early when someone new is in front of you or a new job appears
  news <name>          ask the person in front of you "Anything new?"
  tell <name> <n> [sure]   pass on item n from your notebook (add "sure" to say it for certain)
  tells <name>         list what you could tell them
  invent <name> <about> <trait>   make something up; traits: ${INVENTABLE.join(', ')}, or sweet:<name>
  sit <name>           sit a minute with them (ten minutes, once a day each)
  word <name>          ask them for a word for you at Sunday's meeting
  misdeliver <name> <task n>   leave someone else's parcel at this door
  knock <name>         ring the bell even though the flat is quiet
  prank gate|swap      leave the courtyard gate on the latch / swap Nermin's and Sevim's papers
  notebook             your notebook: the flats, the building's secrets, stamps
  next                 turn the page (at night, or Sunday)
  export               print the playtest file (seed + inputs + state)`;

function load(): { s: GameState; save: Save } | null {
  if (!existsSync(file as string)) return null;
  const save = JSON.parse(readFileSync(file as string, 'utf8')) as Save;
  return { s: replay(save.seed, save.inputs, save.minute), save };
}
function store(s: GameState, seen: number) {
  const save: Save = { game: GAME_VERSION, seed: s.seed, inputs: s.inputs, minute: s.minute, seen };
  writeFileSync(file as string, JSON.stringify(save));
}

const rid = (x: string | undefined): Rid => {
  const id = (x ?? '').toLowerCase().replace('ü', 'u').replace('ı', 'i') as Rid;
  if (!RIDS.includes(id)) throw new Error(`Who? (${RIDS.join(', ')})`);
  return id;
};
const place = (x: string | undefined): Place => {
  const v = (x ?? '').toLowerCase();
  if (['room', 'step', 'bakery', 'shop', 'roof'].includes(v)) return v as Place;
  if (v.startsWith('landing:')) return v as Place;
  return `door:${rid(v)}` as Place;
};

function screen(s: GameState, seen: number): number {
  const out: string[] = [];
  const fresh = s.said.filter((x) => (x.n ?? 0) >= seen);
  for (const x of fresh) {
    const who =
      x.kind === 'voice'
        ? `${nameOf(x.who)}: `
        : x.kind === 'margin'
          ? '(Rıza, in the margin) '
          : x.kind === 'heard'
            ? '(overheard) … '
            : '';
    out.push(`  ${clockOf(x.at)}  ${who}${x.text}`);
  }
  if (out.length) console.log(`Journal:\n${out.join('\n')}\n`);
  const d = dayOf(s.minute);
  if (s.phase === 'night') {
    const rep = s.reports.find((x) => x.day === d);
    console.log(`== ${DAY_NAMES[d - 1]}, night ==`);
    if (rep)
      console.log(
        `${rep.done} jobs on time, ${rep.late} late, ${rep.missed} not done. Tips ₺${rep.tips}. ${rep.treats.join('; ')}`,
      );
    console.log(`In the tin: ₺${s.k.money}`);
    for (const id of RIDS) {
      const r = readOf(s, id);
      console.log(`  ${RESIDENTS[id].name}: ${r.warmth}; ${r.word}`);
    }
    console.log(`\n(next) to turn the page.`);
    return s.lineNo;
  }
  if (s.phase === 'sunday' || s.phase === 'end') {
    console.log(`== Sunday, the meeting ==`);
    for (const id of RIDS) {
      const r = rOf(s, id);
      console.log(
        `  ${RESIDENTS[id].name}: ${r.vote === 'yes' ? 'hand up' : r.vote === 'away' ? 'did not come' : 'hand down'}${r.word === 'yes' ? ' (had promised)' : ''}`,
      );
    }
    console.log(
      `Tea money ${s.meeting?.raise ? 'goes up' : 'stays'}; ${s.meeting?.yes ?? 0} hands. Tin: ₺${s.k.money}. Week 2 is not written yet.`,
    );
    return s.lineNo;
  }
  console.log(
    `== ${DAY_NAMES[d - 1]} ${clockOf(s.minute)} == You are ${s.k.walk ? `on your way to ${placeName(s.k.walk.to)}` : `at ${placeName(s.k.at)}`}. Tin: ₺${s.k.money}.`,
  );
  if (s.k.walk && s.k.walk.from === s.k.walk.to) console.log('Sitting a minute.');
  if (s.k.busyTask !== null) console.log(`Working on: ${s.tasks.find((t) => t.id === s.k.busyTask)?.label}.`);
  const where = RIDS.filter((id) => rOf(s, id).where !== 'home' && rOf(s, id).where !== 'asleep').map(
    (id) => `${RESIDENTS[id].name} (${rOf(s, id).where.replace('visit:', 'visiting ')})`,
  );
  if (where.length) console.log(`Out and about: ${where.join(', ')}`);
  const faces = faceToFace(s);
  for (const who of faces) {
    const rd = readOf(s, who);
    const r = rOf(s, who);
    console.log(
      `In front of you: ${RESIDENTS[who].call}, flat ${RESIDENTS[who].flat}. ${rd.warmth}, ${rd.word}. ${RESIDENTS[who].blurb}`,
    );
    console.log(
      `  You can: news ${who}${r.newsDay === d ? ' (asked today)' : ''} · tells ${who} · invent ${who} … · word ${who} (${r.word ? (r.word === 'yes' ? 'promised' : 'said no') : wordHint(s, who)})`,
    );
  }
  if (!s.k.walk && s.k.at.startsWith('door:') && faces.length === 0) {
    const id = s.k.at.slice(5) as Rid;
    console.log(
      rOf(s, id).where === 'asleep'
        ? 'Quiet behind the door. (knock to ring anyway)'
        : `${RESIDENTS[id].name} is out.`,
    );
  }
  const open = openTasks(s);
  console.log('Board:');
  open.forEach((t, i) => {
    const who = t.kind === 'bins' ? 'Bins' : RESIDENTS[t.for].name;
    const where = t.carried
      ? `in your basket, to ${placeName(t.place)}`
      : t.pickup
        ? `from ${placeName(t.pickup)}`
        : `at ${placeName(t.place)}`;
    const late = s.minute > t.by ? ' LATE' : '';
    const legs = legsLine(s, t.carried || !t.pickup ? t.place : t.pickup);
    console.log(
      `  ${i + 1}. ${who}: ${t.label}, ${where}, by ${clockOf(t.by)}${late} (${travelMinutes(s, s.k.at, t.carried || !t.pickup ? t.place : t.pickup)} min${legs ? `; ${legs}` : ''})`,
    );
  });
  if (!open.length) console.log('  (nothing)');
  return s.lineNo;
}

function main() {
  if (!cmd || cmd === 'help') {
    console.log(HELP);
    return;
  }
  if (cmd === 'new') {
    const s = newGame(Number(args[0] ?? Date.now() % 1_000_000));
    store(s, screen(s, 0));
    return;
  }
  const got = load();
  if (!got) {
    console.log('No notebook yet: run "new".');
    return;
  }
  const { s, save } = got;
  let seen = save.seen ?? 0;
  const send = (inp: NewInput) => act(s, inp);
  const a0 = args[0];
  switch (cmd) {
    case 'look':
      break;
    case 'go':
      send({ kind: 'go', to: place(a0) });
      advance(s, 60, true);
      break;
    case 'task': {
      const t = openTasks(s)[Number(a0) - 1];
      if (!t) throw new Error('No such board item.');
      send({ kind: 'go', to: t.carried || !t.pickup ? t.place : t.pickup });
      advance(s, 60, true);
      break;
    }
    case 'wait':
      advance(s, Number(a0 ?? 15), false);
      break;
    case 'news':
      send({ kind: 'news', who: rid(a0) });
      break;
    case 'tells': {
      const items = tellables(s, rid(a0));
      for (const [i, t] of items.entries()) console.log(`  ${i + 1}. ${t.words} (${t.sure})`);
      if (!items.length) console.log('  Nothing in the notebook to pass on yet.');
      return;
    }
    case 'tell': {
      const who = rid(a0);
      const t = tellables(s, who)[Number(args[1]) - 1];
      if (!t) throw new Error('No such item; see "tells <name>".');
      send({ kind: 'tell', who, prop: t.prop, value: t.value, sure: args[2] === 'sure' });
      break;
    }
    case 'invent':
      send({ kind: 'invent', who: rid(a0), about: rid(args[1]), trait: args[2] ?? 'nosy' });
      break;
    case 'word':
      send({ kind: 'word', who: rid(a0) });
      break;
    case 'sit':
      send({ kind: 'sit', who: rid(a0) });
      advance(s, 10, true);
      break;
    case 'misdeliver': {
      const t = openTasks(s)[Number(args[1]) - 1];
      if (!t) throw new Error('No such board item.');
      send({ kind: 'misdeliver', who: rid(a0), task: t.id });
      break;
    }
    case 'knock':
      send({ kind: 'knock', who: rid(a0) });
      break;
    case 'prank':
      send({ kind: 'prank', what: a0 === 'swap' ? 'swap' : 'gate' });
      break;
    case 'next':
      if (s.phase === 'day') {
        console.log('The page turns at night (21:00). Use "wait" to let time pass.');
        return;
      }
      send({ kind: 'next' });
      break;
    case 'notebook':
      for (const x of SECRET_PROPS) console.log(`  ${s.secrets[x.prop] !== undefined ? x.title : '…'}`);
      console.log(`Stamps: ${s.stamps.map((x) => x.id).join(', ') || 'none'}`);
      return;
    case 'export':
      console.log(JSON.stringify({ game: GAME_VERSION, seed: s.seed, inputs: s.inputs, minute: s.minute }));
      return;
    default:
      console.log(HELP);
      return;
  }
  seen = screen(s, seen);
  store(s, seen);
}

/** Let time pass until arrival (walking) or for n minutes, stopping when someone new is in front of you. */
function advance(s: GameState, n: number, untilArrive: boolean) {
  const before = new Set(faceToFace(s));
  const tasks = openTasks(s).length;
  for (let i = 0; i < n && s.phase === 'day'; i++) {
    step(s);
    if (untilArrive && !s.k.walk && s.k.busyTask === null) return;
    if (!untilArrive && faceToFace(s).some((f) => !before.has(f))) return;
    if (!untilArrive && openTasks(s).length > tasks) return;
    if (!untilArrive && openTasks(s).some((t) => t.by - s.minute === 15)) {
      console.log('(You stop: something on the board is due in a quarter of an hour.)');
      return;
    }
  }
}

try {
  main();
} catch (e) {
  console.log((e as Error).message);
}
