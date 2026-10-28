/** The authored building schedule and material state. These are host rules,
 * never a parallel physiology, belief, reputation or decision model. */

import type { LifePreparation } from '@adam0white/lab-client';
import { FACTS, KAPICI, RESIDENTS, RIDS, type Rid } from './building-cast.ts';
import type { DayReport, Place, Said, Task, TaskKind, WorldState } from './building-types.ts';
import { newMonth } from './month.ts';
import { DRAW, hashUnit } from './rng.ts';
import { newStories } from './stories.ts';
export type BuildingWorld = WorldState & {
  nativeLife?: LifePreparation[];
  protocol: {
    sequence: number;
    evidence: number;
    offers: Record<string, number>;
    phase: number;
    ingresses: { phase: number; minute: number; inputIds: string[] }[];
    arrivals: { at: number; place: Place }[];
    finishedTasks: { task: number; at: number; hook: boolean }[];
    seatMeetings: {
      day: number;
      a: Rid;
      b: Rid;
      aActivityId: string;
      bActivityId: string;
      done?: number;
      outcome?: 'completed' | 'interrupted';
    }[];
    paperMixups: { at: number; reader: Rid; other: Rid }[];
    wrongParcels: {
      task: number;
      holder: Rid;
      activityId: string;
      choice: 'peek' | 'set_aside';
      forwardAt: number;
      resolved?: { atMs: number; status: 'completed' | 'interrupted'; receipt: string };
      done?: number;
    }[];
    monthVisits: {
      actorActivityId: string;
      receiverActivityId: string;
      actor: Rid;
      other: Rid;
      visit: number;
    }[];
  };
};
export type BuildingEdition = 'stairwell@14' | 'stairwell@15' | 'stairwell@16';
export const buildingDay = (world: BuildingWorld): number => Math.floor(world.minute / 1440) + 1;
export function sayBuilding(
  world: BuildingWorld,
  who: string,
  text: string,
  kind: Said['kind'] = 'journal',
): void {
  world.said.push({ at: world.minute, who, text, kind, n: world.lineNo++ });
  if (world.said.length > 1500) world.said.splice(0, world.said.length - 1500);
}
export function reportBuilding(world: BuildingWorld): DayReport {
  const day = buildingDay(world),
    found = world.reports.find((report) => report.day === day);
  if (found) return found;
  const report: DayReport = { day, tips: 0, treats: [], done: 0, late: 0, missed: 0, caught: [], talks: 0 };
  world.reports.push(report);
  return report;
}
export function stampBuilding(world: BuildingWorld, id: string): void {
  if (!world.stamps.some((stamp) => stamp.id === id)) world.stamps.push({ id, day: buildingDay(world) });
}
const DAY_START = 420;
const TOP_FLOOR = 4;
function addTask(s: BuildingWorld, t: Omit<Task, 'id'>): Task {
  const task = { ...t, id: s.nextTask++ } as Task;
  s.tasks.push(task);
  return task;
}
const JOBS: {
  for: Rid;
  label: string;
  place: Place;
  work: number;
  pickup?: Place;
  kind?: TaskKind;
  window: [number, number];
}[] = [
  {
    for: 'sevim',
    label: 'change the bulb on her landing',
    place: 'landing:1',
    work: 8,
    window: [9 * 60, 14 * 60],
  },
  {
    for: 'tarik',
    label: 'his shopping: bread, olives and tea',
    pickup: 'shop',
    place: 'door:tarik',
    work: 0,
    kind: 'shopping',
    window: [9 * 60 + 30, 12 * 60 + 30],
  },
  { for: 'burak', label: 'sweep the entrance', place: 'landing:0', work: 15, window: [9 * 60, 12 * 60] },
  {
    for: 'hacer',
    label: 'beat her carpet on the balcony',
    place: 'door:hacer',
    work: 15,
    window: [10 * 60, 16 * 60],
  },
  {
    for: 'hacer',
    label: 'help carry a folding work table',
    place: 'door:hacer',
    work: 12,
    window: [13 * 60, 17 * 60],
  },
  {
    for: 'derya',
    label: 'pick up her pharmacy bag',
    pickup: 'shop',
    place: 'door:derya',
    work: 0,
    kind: 'shopping',
    window: [15 * 60 + 30, 19 * 60],
  },
  {
    for: 'burak',
    label: 'Water his plants. The key is under the mat.',
    place: 'door:burak',
    work: 6,
    window: [10 * 60, 17 * 60],
  },
  { for: 'tarik', label: 'fix his dripping tap', place: 'door:tarik', work: 18, window: [11 * 60, 18 * 60] },
];

export function planDay(s: BuildingWorld, day: number) {
  const d = (day - 1) * 1440;
  const r = (kind: number, i: number) => hashUnit(s.seed, kind, day, i);
  // Bread and newspapers: everyone wants them early. Derya's hangs on her door while she sleeps.
  for (const [i, id] of RIDS.entries()) {
    if (s.castPauses?.[id] === 'paused') continue;
    if (id === 'burak' && (s.month ? ((day - 1) % 7) + 1 : day) === 6) continue;
    const loaves = 1 + Math.floor(r(DRAW.bread, i) * 2);
    const by = d + 7 * 60 + 55 + Math.floor(r(DRAW.bread, i + 20) * 35);
    addTask(s, {
      kind: 'bread',
      for: id,
      label: `${loaves === 1 ? 'a loaf of bread' : 'two loaves of bread'}${RESIDENTS[id].paper ? ' and a newspaper' : ''}`,
      pickup: 'bakery',
      place: `door:${id}`,
      from: d + DAY_START,
      by: id === 'burak' ? d + 8 * 60 + 25 : id === 'derya' ? d + 9 * 60 : by,
    });
  }
  // Parcels: one or two a day, from the courier, into your room.
  const parcels = 1 + (r(DRAW.parcel, 0) < 0.5 ? 1 : 0);
  for (let i = 0; i < parcels; i++) {
    const who = RIDS[Math.floor(r(DRAW.parcel, i + 1) * RIDS.length)] as Rid;
    const at = d + 10 * 60 + Math.floor(r(DRAW.parcelAt, i) * 6 * 60);
    addTask(s, {
      kind: 'parcel',
      for: who,
      label: 'a parcel',
      pickup: 'room',
      place: `door:${who}`,
      from: at,
      by: d + 20 * 60,
    });
  }
  // The paper supplier's parcel, Tuesday.
  if (day === 2)
    addTask(s, {
      kind: 'parcel',
      for: 'burak',
      label: 'a flat, carefully wrapped parcel',
      pickup: 'room',
      place: 'door:burak',
      from: d + 11 * 60 + 10,
      by: d + 20 * 60,
      label2: { prop: FACTS.ring, text: 'The sender’s label says: paper, hinges and card-making supplies.' },
    });
  // Small jobs: two or three, drawn from the list without repeats.
  const n = 2 + (r(DRAW.job, 0) < 0.4 ? 1 : 0);
  const used = new Set<number>();
  for (let i = 0; used.size < n && i < 20; i++) {
    const j = Math.floor(r(DRAW.job, i + 1) * JOBS.length);
    if (used.has(j) || (s.jobsUsed.includes(j) && s.jobsUsed.length < JOBS.length - 2)) continue;
    const job = JOBS[j];
    if (!job || s.castPauses?.[job.for] === 'paused') continue;
    if (job.for === 'burak' && (s.month ? ((day - 1) % 7) + 1 : day) === 6) continue;
    used.add(j);
    s.jobsUsed.push(j);
    const from = d + job.window[0] - 60 + Math.floor(r(DRAW.jobAt, i) * 60);
    addTask(s, {
      kind: job.kind ?? 'job',
      for: job.for,
      label: job.label,
      ...(job.pickup ? { pickup: job.pickup } : {}),
      place: job.place,
      work: job.work,
      from,
      by: d + job.window[1],
    });
  }
  // The bins, every evening: collect from the top landing, out to the street by 20:45.
  addTask(s, {
    kind: 'bins',
    for: 'burak',
    label: 'Take the bins down from the top floor. Put them outside by 20:45.',
    pickup: `landing:${TOP_FLOOR}`,
    place: 'step',
    from: d + 19 * 60 + 30,
    by: d + 20 * 60 + 45,
  });
  if (day === 3)
    addTask(s, {
      kind: 'job',
      for: 'burak',
      label: 'look at the boiler because there is no hot water',
      place: 'room',
      work: 20,
      from: d + 7 * 60 + 25,
      by: d + 10 * 60,
    });
}

export function openingWorld(seed: number, edition: BuildingEdition): BuildingWorld {
  const now = DAY_START;
  const s: BuildingWorld = {
    protocol: {
      sequence: 1,
      evidence: 1,
      offers: {},
      phase: 0,
      ingresses: [],
      arrivals: [],
      finishedTasks: [],
      monthVisits: [],
      paperMixups: [],
      seatMeetings: [],
      wrongParcels: [],
    },
    version: edition,
    seed,
    minute: now,
    phase: 'day',
    k: { at: 'room', walk: null, busyUntil: 0, busyTask: null, money: 0 },
    residents: RIDS.map((id) => ({
      id,
      where: RESIDENTS[id].nights ? 'asleep' : 'home',
      until: now + 20 + ((RIDS.indexOf(id) * 7) % 30),
      doing: 'home',
      stairsUntil: 0,
      stairsFloors: [0, 0],
      told: [],
      treatDay: 0,
      newsDay: 0,
      word: null,
      caught: [],
      grudges: [],
      sits: 0,
      sitDay: 0,
    })),
    tasks: [],
    nextTask: 1,
    said: [],
    talks: [],
    reports: [],
    secrets: {},
    stamps: [],
    gateUntil: 0,
    catDays: 0,
    catHome: false,
    swappedDay: 0,
    lunchDay: 0,
    boilerBroken: false,
    ring: { asked: false, answer: null, spoiled: false },
    derya: { told: false, brotherSeen: false },
    tarik: { envelope: false },
    meeting: null,
    inputs: [],
    applied: 0,
    lineNo: 0,
    jobsUsed: [],
    knocks: 0,
  };
  s.stories = newStories();
  if (edition !== 'stairwell@14') s.month = newMonth();

  const derya = s.residents.find((resident) => resident.id === 'derya');
  if (!derya) throw Error('The building has no authored Derya schedule.');
  derya.where = 'work';
  derya.until = 480;
  planDay(s, 1);
  return s;
}

/** Actual co-location under this building's authored doors and stair intervals. */
export function buildingPeopleTogether(world: BuildingWorld, first: string, second: string): boolean {
  if (first === second) return false;
  const a = world.residents.find((resident) => resident.id === first);
  const b = world.residents.find((resident) => resident.id === second);
  if (first === KAPICI || second === KAPICI) {
    const resident = first === KAPICI ? b : a;
    return (
      !!resident &&
      !world.k.walk &&
      ((world.k.at === 'step' && resident.where === 'step') ||
        (world.k.at === `door:${resident.id}` && resident.where === 'home'))
    );
  }
  if (!a || !b) return false;
  if (a.where === b.where && ['step', 'shop', 'roof'].includes(a.where)) return true;
  if (
    (a.where === `visit:${b.id}` && b.where === 'home') ||
    (b.where === `visit:${a.id}` && a.where === 'home')
  )
    return true;
  if (a.where.startsWith('visit:') && a.where === b.where) return true;
  return (
    a.stairsUntil >= world.minute &&
    b.stairsUntil >= world.minute &&
    a.stairsFloors[1] >= b.stairsFloors[0] &&
    b.stairsFloors[1] >= a.stairsFloors[0]
  );
}
