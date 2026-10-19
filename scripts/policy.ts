// Scripted players for the headless measure and tests: an errand runner with a talking style.
import {
  act,
  faceToFace,
  floorOf,
  type GameState,
  newGame,
  openTasks,
  type Place,
  rOf,
  step,
  tellables,
  travelMinutes,
} from '../src/sim/game.ts';
import { RESIDENTS, RIDS, type Rid } from '../src/sim/people.ts';

export type Style = 'quiet' | 'honest' | 'gossip' | 'liar';

function nextPlace(s: GameState): Place | null {
  const open = openTasks(s);
  const carried = open.filter((t) => t.carried);
  const here = s.k.at;
  const cands: Place[] = [];
  for (const t of carried) cands.push(t.place);
  for (const t of open) if (!t.carried && t.pickup) cands.push(t.pickup);
  for (const t of open) if (!t.carried && !t.pickup) cands.push(t.place);
  const uniq = [...new Set(cands)].filter((p) => p !== here);
  if (uniq.length === 0) return here === 'room' ? null : 'room';
  // Nearest first, bakery first in the morning if bread is waiting.
  uniq.sort((a, b) => travelMinutes(s, here, a) - travelMinutes(s, here, b) || (a < b ? -1 : 1));
  return uniq[0] ?? null;
}

export function playDay(s: GameState, style: Style) {
  const day = Math.floor(s.minute / 1440);
  const talked = new Set<string>();
  let guard = 0;
  while (s.phase === 'day' && guard++ < 2000) {
    if (!s.k.walk && s.k.busyTask === null) {
      for (const who of faceToFace(s)) {
        const key = `${day}:${who}:${s.k.at}`;
        if (talked.has(key)) continue;
        talked.add(key);
        if (style !== 'quiet') speak(s, who, style);
      }
      const to = nextPlace(s);
      if (to) act(s, { kind: 'go', to });
    }
    step(s);
  }
}

function speak(s: GameState, who: Rid, style: Style) {
  act(s, { kind: 'news', who });
  const day = Math.floor(s.minute / 1440) + 1;
  if (day >= 4 && !rOf(s, who).word) act(s, { kind: 'word', who });
  const items = tellables(s, who);
  if (style === 'honest') {
    const t = items.find((x) => x.sure === 'sure' && !x.prop.includes('owes') && x.prop !== 'burak:ring');
    if (t) act(s, { kind: 'tell', who, prop: t.prop, value: t.value, sure: false });
  } else if (style === 'gossip') {
    const t = items.find((x) => x.sure !== 'doubt');
    if (t) act(s, { kind: 'tell', who, prop: t.prop, value: t.value, sure: true });
  } else if (style === 'liar') {
    const others = RIDS.filter((r) => r !== who);
    const about = others[(day + RESIDENTS[who].flat) % others.length] as Rid;
    act(s, { kind: 'invent', who, about, trait: day % 2 ? 'stingy' : 'nosy' });
    if (who === 'nermin') act(s, { kind: 'invent', who, about: 'sevim', trait: 'lazy' });
    if (who === 'sevim') act(s, { kind: 'invent', who, about: 'nermin', trait: 'lazy' });
  }
}

export function playWeek(seed: number, style: Style): GameState {
  const s = newGame(seed);
  while (s.phase !== 'end') {
    if (s.phase === 'day') playDay(s, style);
    else act(s, { kind: 'next' });
  }
  return s;
}

export { floorOf };
