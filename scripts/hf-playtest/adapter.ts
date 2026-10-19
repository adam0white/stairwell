/**
 * An HF-character playtester adapter for The Stairwell: an HF persona plays the kapıcı through one week. It follows
 * the GameAdapter contract of the HF playtester (human-framework/packages/playtester/src/adapter.ts) and drives this
 * repository's own headless sim. It lives here, not in the playtester package, while another agent owns that package.
 *
 * What it shows is what the screen shows: the journal (resident voices, the narrator, Rıza's margin, overheard lines),
 * the board (open tasks, carried or not, late or not), who is in front of you and their worded read (`readOf`), the
 * night page (jobs, tips, the tin, every flat's read, Rıza's line and the open question at the foot of the page), and
 * Sunday's hands. Never the residents' trust or affection numbers, credences or needs.
 *
 * Time runs as the UI's default speed: 3 game minutes per real second, 0.6 while someone is in front of you. The UI's
 * faster speeds (6, 12) and its "dismiss the panel" (which restores speed while still at a door) are not modelled.
 *
 * Cohort fields: `chapter` is the day ('Mon' .. 'Sat', 'Mon night' on the night page, 'Sun' for the meeting);
 * `outcome` reads the meeting: tea money up is a win, 2-3 hands mixed, fewer a loss. `openLoop`: a day under way
 * (with late items on the board), or at night Rıza's question at the foot of the page and any promised word.
 * Replies count as answers only to the inputs aimed at that resident; lines produced while an input is applied answer
 * that input. Edge actions: invent a trait, misdeliver a parcel, ring Derya's bell while she sleeps, the gate and
 * newspaper-swap pranks, telling one resident the opposite of what another was told, and telling the same resident the opposite of what you told them before. Every number here is a
 * playtesting premise, not a measurement of the game.
 */
/** @typedef {import('/Users/abdul/code/human-framework/packages/playtester/src/index.ts').GameAdapter} GameAdapter */
import {
  act,
  clockOf,
  DAY_NAMES,
  dayOf,
  faceToFace,
  GAME_VERSION,
  INVENTABLE,
  newGame,
  openTasks,
  placeName,
  readOf,
  rOf,
  step,
  tellables,
  travelMinutes,
  wordHint,
} from '../../src/sim/game.ts';
import { RESIDENTS, RIDS } from '../../src/sim/people.ts';

const FAST = 3;
const SLOW = 0.6;
const SHORT = DAY_NAMES.map((d) => d.slice(0, 3));
/** The open line at the foot of each night page (src/ui/app.ts OPEN_Q): screen text. */
const OPEN_Q = {
  1: 'Tomorrow a courier comes. Rıza wrote: “Read the labels. Everyone does.”',
  2: 'The radiators ticked and went quiet around midnight.',
  3: 'Who is the man at flat 5?',
  4: 'Tomorrow is Friday. Tarık Bey has been wanting a word with you.',
  5: 'Burak asked what the weather will be on Saturday evening. On the roof.',
  6: 'Tomorrow at eleven: the meeting, and the vote on your tea money.',
};
const OPEN_W = { 1: 0.3, 2: 0.15, 3: 0.4, 4: 0.3, 5: 0.35, 6: 0.45 };
const WARMTH = ['cold', 'cool', 'polite', 'warm', 'fond of you'];
const WORD = ['thinks you lie', 'doubts you', 'not sure of you', 'listens to you', 'takes your word'];
const WORD_HINT = { 'likely yes': 0.7, maybe: 0.4, 'likely no': 0.15 };
const REBUFF =
  /already|Don’t ask twice|Nothing for you|What is it\?|Again\?|That’s it|nearer the day|hardly know you|We’ll see|cold\. Never mind|Next time on time|I don’t repeat|not in front of you/;
const NARRATOR_BAD =
  /Nobody took the bins|would not meet your eye|knows better|stories met|what you had been saying|smelled/;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const aimedAt = (who) => [
  `news:${who}`,
  `tell:${who}`,
  `word:${who}`,
  `invent:${who}`,
  `contradict:${who}`,
  `flipflop:${who}`,
  `misdeliver:${who}`,
  `knock:${who}`,
  `go:door:${who}`,
];

/** The next place a board item needs the kapıcı. */
const nextPlaceOf = (t) => (t.carried || !t.pickup ? t.place : t.pickup);

export class StairwellAdapter {
  name = GAME_VERSION.replace('@', '-');
  s;
  seen = 0;
  /** Line numbers said while an input was applied → that input's id. */
  byInput = new Map();
  carried = new Set();
  done = new Set();
  late = new Set();
  present = new Set();
  words = new Map();
  shown = new Map();
  walking = null;
  phase = 'day';
  /** What this player told whom (prop → value, per resident), to keep plain tells fresh. */
  told = new Map();
  carry = 0;
  /** Lines in which an "Anything new?" brought something about someone. */
  gossip = new Set();

  constructor(seed) {
    this.s = newGame(seed);
    for (const t of openTasks(this.s)) if (t.carried) this.carried.add(t.id);
    for (const id of RIDS) this.shown.set(id, readOf(this.s, id));
  }

  observe() {
    const s = this.s;
    const events = [];
    const d = dayOf(s.minute);
    // 1. The journal: every line said since the last look.
    for (const x of s.said) {
      const n = x.n ?? 0;
      if (n < this.seen) continue;
      const input = this.byInput.get(n);
      const resident = x.who in RESIDENTS;
      let kind = x.kind;
      let valence = 0.05;
      let salience = x.kind === 'event' ? 0.7 : x.kind === 'heard' ? 0.4 : 0.55;
      let answers = input ? [input] : false;
      if (resident && x.kind === 'voice') {
        const tip = /\(₺(\d+)\)/.exec(x.text);
        if (tip) {
          // A tip in the voice line is the game's moment-to-moment pay: ₺5 0.3, ₺10 0.4, ₺15 0.5, ₺20+ 0.55.
          kind = 'thanks';
          valence = clamp(0.2 + Number(tip[1]) / 50, 0, 0.55);
          salience = 0.6;
        } else if (REBUFF.test(x.text)) {
          kind = 'rebuff';
          valence = -0.3;
        } else if (input?.startsWith('news:') && this.gossip.has(input + n)) {
          // "Anything new?" answered with something about someone: a new item to pass on.
          kind = 'gossip';
          valence = 0.35;
          salience = 0.7;
        } else kind = 'voice';
        if (!input) answers = aimedAt(x.who);
      } else if (x.kind === 'heard') {
        kind = 'overheard';
        valence = 0.15;
      } else if (x.who === 'narrator') {
        if (/A new line in the notebook/.test(x.text)) {
          kind = 'secret';
          valence = 0.45;
          salience = 0.8;
        } else if (/stories met/.test(x.text)) {
          kind = 'caught';
          valence = -0.6;
          salience = 0.9;
          if (!input) answers = ['tell:', 'contradict:', 'flipflop:', 'invent:'];
        } else if (/what you had been saying|knows better/.test(x.text)) {
          kind = 'word-back';
          valence = -0.45;
          salience = 0.85;
          if (!input) answers = ['tell:', 'contradict:', 'flipflop:', 'invent:'];
        } else if (/ginger|Pamuk/.test(x.text)) {
          kind = 'cat';
          valence = 0.3;
          salience = 0.8;
          if (!input) answers = ['prank:gate'];
        } else if (/tape on .* parcel had been lifted/.test(x.text)) {
          kind = 'peeked';
          valence = -0.2;
          if (!input) answers = ['misdeliver:'];
        } else if (/pressed .* on you|bought a bowl/.test(x.text)) {
          kind = 'treat';
          valence = 0.35;
          salience = 0.7;
        } else if (NARRATOR_BAD.test(x.text)) {
          kind = 'setback';
          valence = -0.35;
          salience = 0.8;
        } else if (x.kind === 'journal' && input && REBUFF.test(x.text)) {
          kind = 'refused';
          valence = -0.15;
        } else if (x.kind === 'journal' && input) {
          kind = 'did';
          valence = 0.05;
        } else kind = x.kind === 'event' ? 'story' : 'narration';
      } else if (x.kind === 'margin') {
        kind = 'margin';
        valence = 0.05;
        salience = 0.6;
      }
      const ev = { kind, summary: `${resident ? x.who : x.kind}: ${x.text}`, valence, salience, answers };
      if (resident) ev.by = x.who;
      events.push(ev);
      this.seen = Math.max(this.seen, n + 1);
    }
    for (const n of [...this.byInput.keys()]) if (n < this.seen) this.byInput.delete(n);

    // 2. The board and the walk, as the screen shows them.
    if (this.walking && !s.k.walk) {
      events.push({
        kind: 'arrived',
        summary: `at ${placeName(s.k.at)}`,
        valence: 0.05,
        salience: 0.3,
        answers: [this.walking],
      });
      this.walking = null;
    }
    const picked = [];
    for (const t of s.tasks) {
      if (t.carried && !t.done && !this.carried.has(t.id)) {
        this.carried.add(t.id);
        picked.push(t);
      }
      if (t.done && !this.done.has(t.id)) this.done.add(t.id);
      if (!t.done && t.from <= s.minute && s.minute > t.by && !this.late.has(t.id)) {
        this.late.add(t.id);
        events.push({
          kind: 'late',
          summary: `LATE: ${t.label}`,
          valence: -0.25,
          salience: 0.6,
          answers: false,
        });
      }
    }
    if (picked.length)
      events.push({
        kind: 'picked-up',
        summary: `in the basket: ${picked.map((t) => t.label).join('; ')}`,
        valence: 0.1,
        salience: 0.35,
        answers: [...new Set(picked.map((t) => `go:${t.pickup}`))],
      });
    // 3. Who is in front of you, with their worded read; at night, every flat's read.
    const faces = faceToFace(s);
    const visible = s.phase === 'night' ? RIDS : faces;
    for (const id of faces)
      if (!this.present.has(id))
        events.push({
          kind: 'face',
          summary: `${RESIDENTS[id].name} in front of you: ${readOf(s, id).warmth}, ${readOf(s, id).word}`,
          valence: 0.05,
          salience: 0.5,
          answers: [`go:door:${id}`, 'go:step'],
        });
    this.present = new Set(faces);
    for (const id of visible) {
      const now = readOf(s, id);
      const was = this.shown.get(id);
      const dw = WARMTH.indexOf(now.warmth) - WARMTH.indexOf(was.warmth);
      const dt = WORD.indexOf(now.word) - WORD.indexOf(was.word);
      if (dw !== 0 || dt !== 0)
        events.push({
          kind: dw + dt > 0 ? 'warmer' : 'cooler',
          summary: `${RESIDENTS[id].name}: ${now.warmth}; ${now.word}`,
          valence: clamp(0.25 * (dw + dt), -0.5, 0.5),
          salience: 0.6,
          by: id,
          answers: s.phase === 'night' ? false : aimedAt(id),
        });
      this.shown.set(id, now);
    }
    for (const id of RIDS) {
      const w = rOf(s, id).word;
      if (w && this.words.get(id) !== w) {
        this.words.set(id, w);
        events.push({
          kind: w === 'yes' ? 'promised' : 'no-promise',
          summary: `${RESIDENTS[id].name} ${w === 'yes' ? 'promised a word for Sunday' : 'will not give a word'}`,
          valence: w === 'yes' ? 0.55 : -0.3,
          salience: 0.85,
          by: id,
          answers: [`word:${id}`],
        });
      }
    }
    // 4. The night page and Sunday.
    if (s.phase !== this.phase) {
      if (s.phase === 'night') {
        const rep = s.reports.find((x) => x.day === d);
        const all = rep ? rep.done + rep.late + rep.missed : 0;
        const share = all ? (rep.done + 0.4 * rep.late) / all : 0.5;
        events.push({
          kind: 'night',
          summary: `${SHORT[d - 1]} night: ${rep?.done ?? 0} on time, ${rep?.late ?? 0} late, ${rep?.missed ?? 0} not done; tips ₺${rep?.tips ?? 0}; tin ₺${s.k.money}`,
          valence: clamp(-0.4 + 0.9 * share, -0.6, 0.6),
          salience: 1,
          answers: false,
        });
      }
      if ((s.phase === 'sunday' || s.phase === 'end') && s.meeting) {
        const yes = s.meeting.yes;
        events.push({
          kind: 'meeting',
          summary: `the meeting: ${yes} hands, tea money ${s.meeting.raise ? 'goes up' : 'stays'}`,
          valence: s.meeting.raise ? 0.9 : yes >= 2 ? 0.1 : -0.6,
          salience: 1,
          answers: false,
        });
      }
      this.phase = s.phase;
    }

    const open = openTasks(s);
    const lateN = open.filter((t) => s.minute > t.by).length;
    const soon = open.filter((t) => t.by - s.minute < 30 && s.minute <= t.by).length;
    const loops = [];
    let openLoop = 0;
    if (s.phase === 'day') {
      for (const t of open.slice(0, 4)) loops.push(t.label);
      openLoop = clamp(0.4 + 0.05 * lateN, 0, 0.6);
    } else if (s.phase === 'night') {
      const q = OPEN_Q[d];
      if (q) loops.push(q);
      const promised = RIDS.filter((id) => rOf(s, id).word === 'yes').map((id) => RESIDENTS[id].name);
      if (promised.length) loops.push(`${promised.join(', ')} promised a word for Sunday`);
      openLoop = clamp((OPEN_W[d] ?? 0) + (promised.length ? 0.15 : 0), 0, 0.7);
    }
    const phaseName = s.phase === 'sunday' || s.phase === 'end' ? 'meeting' : s.phase;
    const o = {
      clock: `${SHORT[d - 1]} ${s.phase === 'day' ? clockOf(s.minute) : phaseName}`,
      phase: phaseName,
      events,
      features: {
        pressure: s.phase === 'day' ? clamp(0.08 * open.length + 0.2 * lateN + 0.15 * soon) : 0,
        openLoop,
      },
      over: s.phase === 'sunday' || s.phase === 'end',
      chapter: s.phase === 'night' ? `${SHORT[d - 1]} night` : SHORT[d - 1],
      loops,
    };
    if (o.over) {
      const yes = s.meeting?.yes ?? 0;
      o.outcome = s.meeting?.raise ? 'win' : yes >= 2 ? 'mixed' : 'loss';
    }
    return o;
  }

  /** Whether handing over or picking up a board item where he stands would do something now. */
  worksHere(t) {
    const s = this.s;
    if (!t.carried) return t.pickup === s.k.at;
    if (t.place !== s.k.at) return false;
    if (t.kind === 'bins') return true;
    if (!t.place.startsWith('door:')) return false;
    const w = rOf(s, t.place.slice(5)).where;
    return w === 'home' || t.kind === 'bread' || t.kind === 'shopping';
  }

  idle() {
    const s = this.s;
    return s.phase === 'day' && !s.k.walk && s.k.busyTask === null;
  }

  actions() {
    const s = this.s;
    if (s.phase === 'night') return [{ id: 'next', label: 'turn the page', kind: 'next', promise: 0.6 }];
    if (s.phase !== 'day') return [];
    const out = [];
    const d = dayOf(s.minute);
    if (this.idle()) {
      const best = new Map();
      for (const t of openTasks(s)) {
        const to = nextPlaceOf(t);
        const mins = travelMinutes(s, s.k.at, to);
        // Here already: arriving picked up and handed over what it could; offer it again only if it would now work.
        if (mins <= 0 && !this.worksHere(t)) continue;
        const slack = t.by - s.minute - mins;
        let promise =
          0.35 + (slack < 0 ? 0.3 : slack < 30 ? 0.3 : slack < 90 ? 0.15 : 0.03) + (t.carried ? 0.1 : 0);
        // A parcel or a job at a door wants the resident home; the screen lists who is out.
        if (to.startsWith('door:') && (t.kind === 'parcel' || t.kind === 'job')) {
          const w = rOf(s, to.slice(5)).where;
          if (w !== 'home' && w !== 'asleep') promise *= 0.35;
        }
        const id = `go:${to}`;
        const prev = best.get(id);
        if (!prev || prev.promise < promise)
          best.set(id, {
            id,
            label: mins <= 0 ? `hand over ${t.label} here` : `go to ${placeName(to)} (${t.label})`,
            kind: 'go',
            promise: clamp(promise),
            focus: 0.05,
          });
      }
      out.push(...best.values());
      // The screen lists who is out and about, so a player can see when the step has company.
      const company = RIDS.some((id) => rOf(s, id).where === 'step');
      if (s.k.at !== 'step' && !best.has('go:step'))
        out.push({
          id: 'go:step',
          label: 'go and sit on the step',
          kind: 'social',
          promise: company ? 0.25 : 0.05,
        });
      if (s.k.at !== 'room' && !best.has('go:room'))
        out.push({ id: 'go:room', label: 'go back to your room', kind: 'go', promise: 0.04 });
    }
    for (const who of faceToFace(s)) {
      const r = rOf(s, who);
      const name = RESIDENTS[who].name;
      if (r.newsDay !== d)
        out.push({ id: `news:${who}`, label: `ask ${name} "Anything new?"`, kind: 'news', promise: 0.45 });
      if (r.sitDay !== d)
        out.push({ id: `sit:${who}`, label: `sit a minute with ${name}`, kind: 'talk', promise: 0.4 });
      const mine = this.told.get(who) ?? new Map();
      const items = tellables(s, who)
        .filter((t) => t.sure !== 'doubt' && !mine.has(t.prop))
        .sort((a, b) => (a.sure === b.sure ? 0 : a.sure === 'sure' ? -1 : 1))
        .slice(0, 2);
      for (const t of items)
        out.push({
          id: `tell:${who}:${t.prop}:${t.value}`,
          label: `tell ${name}: ${t.words}`,
          kind: 'tell',
          promise: t.sure === 'sure' ? 0.3 : 0.2,
        });
      if (d >= 4 && !r.word)
        out.push({
          id: `word:${who}`,
          label: `ask ${name} for a word on Sunday (${wordHint(s, who)})`,
          kind: 'word',
          promise: WORD_HINT[wordHint(s, who)] ?? 0.3,
        });
    }
    return out;
  }

  edgeActions() {
    const s = this.s;
    if (s.phase !== 'day') return [];
    const out = [];
    const faces = faceToFace(s);
    for (const who of faces) {
      const name = RESIDENTS[who].name;
      out.push({
        id: `invent:${who}:sport`,
        label: `make something up about a neighbour to ${name}`,
        kind: 'invent',
        promise: 0.08,
        tags: ['confront'],
        mischief: true,
      });
      if (s.tasks.some((t) => t.kind === 'parcel' && t.carried && !t.done && t.for !== who))
        out.push({
          id: `misdeliver:${who}:sport`,
          label: `leave someone else's parcel with ${name}`,
          kind: 'misdeliver',
          promise: 0.05,
          mischief: true,
        });
      if (this.contradiction(who))
        out.push({
          id: `contradict:${who}:sport`,
          label: `tell ${name} the opposite of what you told someone else`,
          kind: 'tell',
          promise: 0.05,
          tags: ['confront'],
          mischief: true,
        });
      if (this.flip(who))
        out.push({
          id: `flipflop:${who}:sport`,
          label: `tell ${name} the opposite of what you told them before`,
          kind: 'tell',
          promise: 0.04,
          tags: ['confront'],
          mischief: true,
        });
    }
    if (!s.k.walk && s.k.at === 'door:derya' && rOf(s, 'derya').where === 'asleep')
      out.push({
        id: 'knock:derya:sport',
        label: "ring Derya's bell while she sleeps",
        kind: 'knock',
        promise: 0.03,
        tags: ['confront'],
        mischief: true,
      });
    if (!s.k.walk && ['step', 'room', 'landing:0'].includes(s.k.at) && s.gateUntil < s.minute)
      out.push({
        id: 'prank:gate:sport',
        label: 'leave the gate on the latch',
        kind: 'prank',
        promise: 0.06,
        mischief: true,
      });
    const carried = (who) => s.tasks.some((t) => t.kind === 'bread' && t.for === who && t.carried && !t.done);
    if (carried('nermin') && carried('sevim') && s.swappedDay !== dayOf(s.minute))
      out.push({
        id: 'prank:swap:sport',
        label: "swap Nermin's and Sevim's papers",
        kind: 'prank',
        promise: 0.06,
        mischief: true,
      });
    return out;
  }

  /** Something another resident was told by you, about someone other than `who`, that `who` has not been told. */
  flip(who) {
    for (const x of [...rOf(this.s, who).told].reverse()) return { prop: x.prop, value: !x.value };
    return null;
  }

  contradiction(who) {
    for (const r of this.s.residents) {
      if (r.id === who) continue;
      for (const x of r.told) {
        if (x.prop.split(':')[0] === who) continue;
        if (rOf(this.s, who).told.some((y) => y.prop === x.prop)) continue;
        return { prop: x.prop, value: !x.value };
      }
    }
    return null;
  }

  apply(id) {
    const s = this.s;
    const before = s.lineNo;
    const parts = id.split(':');
    const head = parts[0];
    const who = parts[1];
    if (head === 'next') act(s, { kind: 'next' });
    else if (head === 'go') {
      const to = parts.slice(1).join(':');
      if (s.k.at !== to) this.walking = id;
      act(s, { kind: 'go', to });
    } else if (head === 'news') {
      const b0 = s.kapici.memory.beliefs.length;
      act(s, { kind: 'news', who });
      if (s.kapici.memory.beliefs.length > b0)
        for (let n = before; n < s.lineNo; n++) this.gossip.add(id + n);
    } else if (head === 'word') act(s, { kind: 'word', who });
    else if (head === 'sit') act(s, { kind: 'sit', who });
    else if (head === 'tell') {
      const value = parts[parts.length - 1] === 'true';
      const prop = parts.slice(2, -1).join(':');
      this.remember(who, prop, value);
      act(s, { kind: 'tell', who, prop, value, sure: false });
    } else if (head === 'contradict') {
      const c = this.contradiction(who);
      if (c) {
        this.remember(who, c.prop, c.value);
        act(s, { kind: 'tell', who, prop: c.prop, value: c.value, sure: true });
      }
    } else if (head === 'flipflop') {
      const c = this.flip(who);
      if (c) {
        this.remember(who, c.prop, c.value);
        act(s, { kind: 'tell', who, prop: c.prop, value: c.value, sure: true });
      }
    } else if (head === 'invent') {
      const others = RIDS.filter((r) => r !== who);
      const k = Math.floor(s.minute / 7);
      const about = others[k % others.length];
      const trait = INVENTABLE[k % INVENTABLE.length];
      act(s, { kind: 'invent', who, about, trait });
    } else if (head === 'misdeliver') {
      const t = s.tasks.find((x) => x.kind === 'parcel' && x.carried && !x.done && x.for !== who);
      if (t) act(s, { kind: 'misdeliver', who, task: t.id });
    } else if (head === 'knock') act(s, { kind: 'knock', who });
    else if (head === 'prank') act(s, { kind: 'prank', what: who === 'swap' ? 'swap' : 'gate' });
    for (let n = before; n < s.lineNo; n++) this.byInput.set(n, id);
  }

  remember(who, prop, value) {
    const m = this.told.get(who) ?? new Map();
    m.set(prop, value);
    this.told.set(who, m);
  }

  advance(seconds) {
    const s = this.s;
    if (s.phase !== 'day') return;
    // Quarter-second frames, as the UI's loop: the rate is read afresh each frame.
    for (let f = 0; f < Math.round(seconds * 4) && s.phase === 'day'; f++) {
      this.carry += 0.25 * (faceToFace(s).length > 0 ? SLOW : FAST);
      while (this.carry >= 1 && s.phase === 'day') {
        this.carry -= 1;
        step(s);
      }
    }
  }
}

/** @returns {GameAdapter} */
export const make = (seed) => new StairwellAdapter(seed);
