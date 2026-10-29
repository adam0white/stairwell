import { KAPICI, RIDS } from './building-cast.ts';
import type { Input as BuildingInput } from './building-types.ts';
import type { BuildingWorld } from './hf-world.ts';
import { validateNativeLifeInputs } from './native-cast-life.ts';

type Check = (value: unknown) => void;
const fail = (): never => {
  throw new Error('Invalid building world; keep the original save file.');
};
const str: Check = (v) => {
  if (typeof v !== 'string') fail();
};
const bool: Check = (v) => {
  if (typeof v !== 'boolean') fail();
};
const num: Check = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || Object.is(v, -0)) fail();
};
const integer: Check = (v) => {
  num(v);
  if (!Number.isSafeInteger(v)) fail();
};
const nat: Check = (v) => {
  integer(v);
  if ((v as number) < 0) fail();
};
const one =
  (...values: unknown[]): Check =>
  (v) => {
    if (!values.includes(v)) fail();
  };
const nullable =
  (c: Check): Check =>
  (v) => {
    if (v !== null) c(v);
  };
const array =
  (c: Check): Check =>
  (v) => {
    if (!Array.isArray(v)) fail();
    (v as unknown[]).forEach(c);
  };
const obj =
  (required: Record<string, Check>, optional: Record<string, Check> = {}): Check =>
  (v) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) fail();
    const o = v as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      const check = required[key] ?? optional[key];
      if (!Object.hasOwn(required, key) && !Object.hasOwn(optional, key)) fail();
      check?.(o[key]);
    }
    for (const key of Object.keys(required)) if (!Object.hasOwn(o, key)) fail();
  };
const record =
  (c: Check, keys?: readonly string[]): Check =>
  (v) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) fail();
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (keys && !keys.includes(k)) fail();
      c(x);
    }
  };
const rid = one(...RIDS);
const place: Check = (v) => {
  str(v);
  if (
    ![
      'room',
      'step',
      'bakery',
      'shop',
      'roof',
      ...RIDS.map((x) => `door:${x}`),
      ...[0, 1, 2, 3, 4].map((x) => `landing:${x}`),
    ].includes(v as string)
  )
    fail();
};
const where = one(
  'paused',
  'home',
  'asleep',
  'step',
  'shop',
  'work',
  'roof',
  ...RIDS.map((x) => `visit:${x}`),
);
const task = obj(
  {
    id: nat,
    kind: one('bread', 'paper', 'parcel', 'shopping', 'job', 'bins'),
    for: rid,
    label: str,
    place,
    from: nat,
    by: nat,
  },
  {
    pickup: place,
    work: nat,
    carried: bool,
    done: nat,
    wrongDoor: rid,
    custody: rid,
    custodyAt: nat,
    custodyMissed: bool,
    storyFor: rid,
    label2: obj({ prop: str, text: str }),
    hook: bool,
  },
);
const resident = obj(
  {
    id: rid,
    where,
    until: nat,
    doing: str,
    stairsUntil: nat,
    stairsFloors: (v) => {
      array(integer)(v);
      if ((v as unknown[]).length !== 2) fail();
    },
    told: array(obj({ prop: str, value: bool, at: nat, lie: bool })),
    treatDay: integer,
    newsDay: integer,
    word: nullable(one('yes', 'no')),
    caught: array(nat),
    grudges: array(obj({ prop: str, from: rid, at: nat, lie: bool }, { said: bool })),
    sits: nat,
    sitDay: integer,
  },
  { vote: one('yes', 'no', 'away') },
);
const meeting = obj({ day: nat, yes: nat, no: nat, raise: bool }, { done: one(true) });
const month = obj(
  {
    rain: obj({ started: bool, ended: bool }),
    meetings: array(meeting),
    seats: record(rid, RIDS),
    helped: record(bool, RIDS),
    testimony: array(
      obj(
        { from: str, to: rid, prop: str, value: bool, at: nat },
        { caretaker: obj({ at: nat, lie: bool }) },
      ),
    ),
    duesPaid: bool,
    duesBalance: num,
    tarikCash: num,
    fundCash: num,
    pensionReceived: bool,
    paymentLedger: array(obj({ at: nat, amount: num, supplierPaid: num, remaining: num })),
    supplierBalance: num,
    visits: array(
      obj(
        {
          actor: rid,
          other: rid,
          kind: one('parcel', 'dues'),
          startedAt: nat,
          arrivesAt: nat,
          finishesAt: nat,
        },
        { task: nat, amount: num, done: nat, outcome: one('completed', 'interrupted') },
      ),
    ),
    accusations: array(str),
    stay: nullable(bool),
  },
  { repaymentAt: nat, invoiceDueAt: nat, supplierLate: bool, missedPaymentAt: nat },
);
const stories = obj({
  feud: obj({ hacerPassed: bool, sevimPassed: bool, reconciled: bool }),
  fund: obj({ bookRead: bool, consentPassed: bool, agreed: bool, repairAt: nullable(nat), repaired: bool }),
});
const input: Check = (v) => {
  if (!v || typeof v !== 'object') fail();
  const kind = (v as { kind?: unknown }).kind;
  const common = { at: nat, kind: one(kind) };
  const variants: Record<string, [Record<string, Check>, Record<string, Check>?]> = {
    go: [{ to: place }],
    'start-work': [{ task: nat }],
    rest: [{}],
    reply: [{ who: rid, reply: one('thank', 'listen') }],
    news: [{ who: rid }],
    tell: [{ who: rid, prop: str, value: bool, sure: bool }],
    invent: [{ who: rid, about: rid, trait: str }],
    word: [{ who: rid }],
    sit: [{ who: rid }, { topic: one('boundaries') }],
    misdeliver: [{ who: rid, task: nat }],
    entrust: [{ who: rid, task: nat }],
    'help-story': [{ who: rid }],
    repayment: [{}],
    seat: [{ who: rid, beside: rid }],
    knock: [{ who: rid }],
    prank: [{ what: one('swap', 'gate') }],
    next: [{}],
  };
  if (typeof kind !== 'string' || !Object.hasOwn(variants, kind)) fail();
  const variant = variants[kind as string];
  if (!variant) return fail();
  const [required, optional] = variant;
  obj({ ...common, ...required }, optional)(v);
};
const protocol = obj({
  sequence: nat,
  evidence: nat,
  offers: record(nat),
  phase: nat,
  ingresses: array(obj({ phase: nat, minute: nat, inputIds: array(str) })),
  arrivals: array(obj({ at: nat, place })),
  finishedTasks: array(obj({ task: nat, at: nat, hook: bool })),
  seatMeetings: array(
    obj(
      { day: nat, a: rid, b: rid, aActivityId: str, bActivityId: str },
      { done: nat, outcome: one('completed', 'interrupted') },
    ),
  ),
  paperMixups: array(obj({ at: nat, reader: rid, other: rid })),
  wrongParcels: array(
    obj(
      { task: nat, holder: rid, activityId: str, choice: one('peek', 'set_aside'), forwardAt: nat },
      { resolved: obj({ atMs: nat, status: one('completed', 'interrupted'), receipt: str }), done: nat },
    ),
  ),
  monthVisits: array(
    obj({ actorActivityId: str, receiverActivityId: str, actor: rid, other: rid, visit: nat }),
  ),
});
const world = obj(
  {
    version: one('stairwell@14', 'stairwell@15', 'stairwell@16'),
    seed: integer,
    minute: nat,
    phase: one('day', 'night', 'sunday', 'end'),
    k: obj({
      at: place,
      walk: nullable(obj({ from: place, to: place, at0: nat, at1: nat })),
      busyUntil: nat,
      busyTask: nullable(nat),
      money: num,
    }),
    residents: array(resident),
    tasks: array(task),
    nextTask: nat,
    pendingWork: array(obj({ who: rid, task: nat, label: str, found: bool })),
    pendingReply: nullable(
      obj({
        who: rid,
        accepted: bool,
        caretakerId: str,
        residentId: str,
        caretakerStatus: nullable(one('completed', 'interrupted')),
        residentStatus: nullable(one('completed', 'interrupted')),
      }),
    ),
    said: array(
      obj(
        { at: nat, who: str, text: str, kind: one('journal', 'voice', 'heard', 'margin', 'event') },
        { n: nat },
      ),
    ),
    talks: array(
      obj({ at: nat, a: rid, b: rid, where: str, props: array(str), overheard: bool }, { caught: bool }),
    ),
    reports: array(
      obj({
        day: nat,
        tips: num,
        treats: array(str),
        done: nat,
        late: nat,
        missed: nat,
        caught: array(rid),
        talks: nat,
      }),
    ),
    secrets: record(integer),
    stamps: array(obj({ id: str, day: nat })),
    gateUntil: nat,
    catDays: nat,
    catHome: bool,
    swappedDay: integer,
    lunchDay: integer,
    boilerBroken: bool,
    ring: obj({ asked: bool, answer: nullable(one('yes', 'not yet', 'no roof')), spoiled: bool }),
    derya: obj({ told: bool, brotherSeen: bool }),
    tarik: obj({ envelope: bool }),
    meeting: nullable(obj({ done: bool, yes: nat, no: nat, raise: bool })),
    inputs: array(input),
    applied: nat,
    lineNo: nat,
    jobsUsed: array(nat),
    knocks: nat,
    protocol,
  },
  {
    month,
    stories,
    castPauses: record(one('requested', 'paused'), RIDS),
    lifeNotes: record(str, RIDS),
    nativeLife: (value) => {
      validateNativeLifeInputs(value);
    },
  },
);

/** File data must be finite plain JSON before any field or getter is read. */
export function assertPlainBuildingData(inputValue: unknown): void {
  const seen = new Set<object>();
  const plain = (v: unknown): void => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number') {
      num(v);
      return;
    }
    if (typeof v !== 'object') fail();
    const o = v as object;
    if (seen.has(o)) fail();
    seen.add(o);
    if (Object.getPrototypeOf(o) !== (Array.isArray(o) ? Array.prototype : Object.prototype)) fail();
    for (const key of Reflect.ownKeys(o)) {
      if (typeof key !== 'string' || key === '__proto__' || key === 'constructor' || key === 'prototype')
        fail();
      if (Array.isArray(o) && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(o, key);
      if (d?.enumerable && 'value' in d) plain(d.value);
      else fail();
    }
    if (
      Array.isArray(o) &&
      (Object.keys(o).length !== o.length || Object.keys(o).some((key, index) => key !== String(index)))
    )
      fail();
    seen.delete(o);
  };
  plain(inputValue);
}
export function decodeBuildingInput(value: unknown): BuildingInput {
  assertPlainBuildingData(value);
  input(value);
  return structuredClone(value) as BuildingInput;
}
/** Decode a whole host world without defaults, repair or actor mutation. */
export function decodeBuildingWorld(inputValue: unknown): BuildingWorld {
  try {
    assertPlainBuildingData(inputValue);
    world(inputValue);
    const w = inputValue as BuildingWorld;
    if (!w.stories || (w.version === 'stairwell@14' ? w.month !== undefined : w.month === undefined)) fail();
    if (w.residents.length !== RIDS.length || new Set(w.residents.map((r) => r.id)).size !== RIDS.length)
      fail();
    const ids = new Set(w.tasks.map((t) => t.id));
    if (ids.size !== w.tasks.length || w.tasks.some((t) => t.id >= w.nextTask)) fail();
    if (w.k.busyTask !== null && !ids.has(w.k.busyTask)) fail();
    if (
      w.protocol.finishedTasks.some((x) => !ids.has(x.task)) ||
      w.month?.visits.some((x) => x.task !== undefined && !ids.has(x.task))
    )
      fail();
    if (
      w.applied > w.inputs.length ||
      w.inputs.some((x, i) => x.at > w.minute || x.at < (w.inputs[i - 1]?.at ?? 0))
    )
      fail();
    if (w.minute < 420 || w.protocol.phase >= 60000 || w.protocol.sequence < 1 || w.protocol.evidence < 1)
      fail();
    if (Object.keys(w.protocol.offers).some((id) => ![...RIDS, KAPICI].includes(id))) fail();
    if (
      w.residents.some(
        (resident) =>
          resident.stairsFloors[0] < 0 ||
          resident.stairsFloors[1] > 5 ||
          resident.stairsFloors[0] > resident.stairsFloors[1],
      )
    )
      fail();
    if (w.k.walk && (w.k.walk.at0 > w.minute || w.k.walk.at1 <= w.k.walk.at0)) fail();
    const ingressIds = new Set<string>();
    let previousPhase = 0,
      previousMinute = -1;
    for (const x of w.protocol.ingresses) {
      if (
        x.phase !== previousPhase + 1 ||
        x.phase >= 60000 ||
        x.minute < previousMinute ||
        x.minute > w.minute ||
        !x.inputIds.length
      )
        fail();
      for (const id of x.inputIds) {
        if (
          !/^stairwell:[1-9][0-9]*$/.test(id) ||
          Number(id.slice(10)) >= w.protocol.sequence ||
          ingressIds.has(id)
        )
          fail();
        ingressIds.add(id);
      }
      previousPhase = x.phase;
      previousMinute = x.minute;
    }
    if (previousPhase !== w.protocol.phase) fail();
    return w;
  } catch {
    return fail();
  }
}
