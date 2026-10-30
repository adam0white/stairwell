/** Prepared building positions/money below are explicit host fixtures. Choices,
 * activities, interruption, completion and replay use the normal public Run. */
import { readRunHistory, replay } from '@adam0white/human-framework';
import { expect, test } from 'vitest';
import {
  advanceBuildingMinute,
  applyBuildingEvents,
  buildingEngine,
  buildingIngress,
  buildingTransaction,
  chooseBuilding,
  interruptBuildingPerson,
  openBuilding,
  restoreBuilding,
} from '../src/sim/hf-game.ts';
import {
  monthEvents,
  monthVisitOffers,
  promiseDues,
  settleMonthVisits,
  startMonthVisit,
} from '../src/sim/hf-month.ts';
import { currentAgenda } from '../src/sim/hf-readings.ts';
import { admitted, atMinute } from '../src/sim/hf-run.ts';
import type { BuildingWorld } from '../src/sim/hf-world.ts';

function need<T>(value: T | undefined): T {
  if (value === undefined) throw Error('Missing prepared monthly test value.');
  return value;
}
function readyDues() {
  const world = openBuilding(7, 'stairwell@15');
  world.minute = 1100;
  buildingIngress(world, [
    {
      kind: 'observation.received',
      payload: { person: 'tarik', evidenceId: 'test-clock:opening', percepts: [] },
    },
  ]);
  for (const id of ['tarik', 'burak']) {
    const r = need(world.residents.find((r) => r.id === id));
    r.where = 'home';
    r.until = world.minute;
  }
  need(world.month).repaymentAt = world.minute;
  need(world.month).tarikCash = 600;
  need(world.month).supplierBalance = 600;
  buildingTransaction(world, promiseDues);
  return world;
}
function depart(world: BuildingWorld) {
  buildingTransaction(world, (candidate) => {
    const offer = monthVisitOffers(candidate, 'tarik').find((o) => o.id === 'dues-payment');
    expect(offer).toBeDefined();
    const choice = chooseBuilding(
      candidate,
      'tarik',
      [need(offer)],
      'Prepared actual private dues encounter.',
    );
    expect(choice.chosenAffordanceId).toBe('dues-payment');
    startMonthVisit(candidate, 'tarik', need(offer));
  });
}
function reach(world: BuildingWorld, minute: number) {
  world.minute = minute;
  // An ordinary authored observation advances the same public owner reply path.
  buildingIngress(world, [
    {
      kind: 'observation.received',
      payload: { person: 'tarik', evidenceId: `test-clock:${minute}`, percepts: [] },
    },
  ]);
  buildingTransaction(world, settleMonthVisits);
}

test('dues require actual dual consent and conserved transfer before material outcome, with exact recovery/replay', () => {
  const world = readyDues();
  depart(world);
  expect(need(world.month).visits).toHaveLength(1);
  expect(need(world.month).paymentLedger).toEqual([]);
  const engine = buildingEngine(world),
    binding = need(world.protocol.monthVisits[0]);
  const actor = need(engine.active.find((a) => a.id === binding.actorActivityId));
  const receiver = need(engine.active.find((a) => a.id === binding.receiverActivityId));
  expect(actor.start + actor.offer.durationMs).toBe(receiver.start + receiver.offer.durationMs);
  expect(actor.offer.durationMs).toBe(atMinute(12));
  expect(receiver.offer.durationMs).toBeLessThan(actor.offer.durationMs);
  const restored = restoreBuilding(JSON.parse(JSON.stringify(engine.checkpoint())));
  reach(world, need(need(world.month).visits[0]).finishesAt);
  reach(restored, need(need(restored.month).visits[0]).finishesAt);
  expect(world.month).toMatchObject({
    tarikCash: 400,
    duesBalance: 400,
    fundCash: 200,
    supplierBalance: 600,
    paymentLedger: [{ amount: 200, supplierPaid: 0, remaining: 400 }],
  });
  expect(need(need(world.month).visits[0]).outcome).toBe('completed');
  const outcomes = readRunHistory(engine.checkpoint().archive)
    .flatMap((transaction) => transaction.inputs)
    .filter((i) => i.kind === 'action.resolved' && i.payload.outcome?.offerId === 'dues-payment');
  expect(outcomes).toHaveLength(1);
  if (outcomes[0]?.kind !== 'action.resolved') throw Error('Missing actual dues outcome');
  expect(outcomes[0].payload.outcome?.actual.material).toBe(-0.1);
  expect(currentAgenda(engine, 'tarik').commitments.find((c) => c.id === 'stairwell:dues:1100')?.status).toBe(
    'kept',
  );
  expect(engine.checkpoint()).toEqual(buildingEngine(restored).checkpoint());
  expect(admitted(replay(engine.checkpoint().archive)).fullHash).toBe(
    engine.checkpoint().archive.hashes.full,
  );
  const money = structuredClone(world.month);
  buildingTransaction(world, settleMonthVisits);
  expect(world.month).toEqual(money);
});

test('actual receiver interruption cancels both bindings without payment or material reward', () => {
  const world = readyDues();
  depart(world);
  expect(need(world.month).visits).toHaveLength(1);
  buildingTransaction(world, (candidate) => {
    interruptBuildingPerson(candidate, 'burak', 'The receiver leaves the handover.');
    settleMonthVisits(candidate);
  });
  expect(need(need(world.month).visits[0]).outcome).toBe('interrupted');
  expect(need(world.month).tarikCash).toBe(600);
  expect(need(world.month).paymentLedger).toEqual([]);
  expect(buildingEngine(world).active.some((a) => a.person === 'tarik' || a.person === 'burak')).toBe(false);
  expect(admitted(replay(buildingEngine(world).checkpoint().archive)).fullHash).toBe(
    buildingEngine(world).checkpoint().archive.hashes.full,
  );
});

test('missing actual funds at finish prevents expected advertisements becoming outcomes; rejection rolls back visit and Run', () => {
  const world = readyDues();
  depart(world);
  const before = buildingEngine(world).checkpoint();
  expect(() =>
    buildingTransaction(world, (candidate) => {
      candidate.minute = need(need(candidate.month).visits[0]).finishesAt;
      applyBuildingEvents(candidate, [
        {
          kind: 'observation.received',
          payload: { person: 'tarik', evidenceId: 'late-host-failure', percepts: [] },
        },
      ]);
      settleMonthVisits(candidate);
      expect(need(candidate.month).tarikCash).toBe(400);
      expect(need(candidate.month).paymentLedger).toHaveLength(1);
      throw Error('late host failure');
    }),
  ).toThrow('late host failure');
  expect(buildingEngine(world).checkpoint()).toEqual(before);
  need(world.month).tarikCash = 0;
  reach(world, need(need(world.month).visits[0]).finishesAt);
  expect(need(need(world.month).visits[0]).outcome).toBe('interrupted');
  expect(need(world.month).paymentLedger).toEqual([]);
  expect(need(world.month).fundCash).toBe(0);
  expect(need(world.month).supplierBalance).toBe(600);
});

test('monthly weather and pension are dated and idempotent; a timer cannot complete a visit', () => {
  const world = readyDues();
  world.minute = 8 * 1440 + 960;
  buildingTransaction(world, monthEvents);
  expect(need(world.month).rain.started).toBe(true);
  expect(need(world.month).rain.ended).toBe(false);
  world.minute += 40;
  buildingTransaction(world, monthEvents);
  expect(need(world.month).rain.ended).toBe(true);
  world.minute = 11 * 1440 + 540;
  buildingTransaction(world, monthEvents);
  buildingTransaction(world, monthEvents);
  expect(need(world.month).tarikCash).toBe(1200);
  expect(need(world.month).paymentLedger).toEqual([]);
});

test('receiver chooses their own retained plans; only rest is interrupted and refusal pays nobody', () => {
  const world = readyDues();
  buildingIngress(world, [
    {
      kind: 'agenda.requested',
      payload: {
        person: 'burak',
        request: {
          type: 'precommit',
          precommitment: {
            id: 'prepared-keep-rest',
            action: 'rest',
            bias: 1,
            fromMsOfDay: 0,
            toMsOfDay: 86399999,
          },
        },
      },
    },
  ]);
  depart(world);
  expect(need(world.month).visits).toEqual([]);
  expect(need(world.month).paymentLedger).toEqual([]);
  expect(buildingEngine(world).active.find((a) => a.person === 'burak')?.offer.id).toBe('keep-plans');
  expect(buildingEngine(world).active.find((a) => a.person === 'tarik')?.offer.id).toBe('handover-declined');
  expect(need(world.month).tarikCash).toBe(600);
});

test('sealed parcel delivery retains the one task completion policy, never a second payment', () => {
  const world = openBuilding(7, 'stairwell@15');
  world.minute = 600;
  buildingIngress(world, [
    { kind: 'observation.received', payload: { person: 'hacer', evidenceId: 'parcel-clock', percepts: [] } },
  ]);
  for (const id of ['hacer', 'sevim']) {
    const r = need(world.residents.find((r) => r.id === id));
    r.where = 'home';
  }
  const task = {
    id: world.nextTask++,
    kind: 'parcel' as const,
    for: 'sevim' as const,
    label: 'a sealed parcel',
    place: 'door:sevim' as const,
    from: 600,
    by: 620,
    custody: 'hacer' as const,
  };
  world.tasks.push(task);
  buildingTransaction(world, (candidate) => {
    const offer = need(
      monthVisitOffers(candidate, 'hacer').find((o) => o.id === `parcel-handover:${task.id}`),
    );
    expect(offer.durationMs).toBe(atMinute(6));
    expect(
      chooseBuilding(candidate, 'hacer', [offer], 'The custodian takes the real sealed parcel.')
        .chosenAffordanceId,
    ).toBe(offer.id);
    startMonthVisit(candidate, 'hacer', offer);
  });
  expect(need(world.month).visits[0]?.kind).toBe('parcel');
  expect(world.tasks.find((t) => t.id === task.id)?.done).toBeUndefined();
  reach(world, 606);
  expect(world.tasks.find((t) => t.id === task.id)).toMatchObject({ done: 606, hook: false });
  expect(world.tasks.find((t) => t.id === task.id)?.custody).toBeUndefined();
  expect(world.stamps.some((s) => s.id === 'safe_parcel')).toBe(true);
  expect(need(world.reports[0]).done).toBe(1);
  expect(need(world.reports[0]).late).toBe(0);
  expect(world.k.money).toBeGreaterThan(0);
  expect(buildingEngine(world).active.some((a) => a.person === 'kapici')).toBe(false);
  const before = buildingEngine(world).checkpoint();
  buildingTransaction(world, settleMonthVisits);
  expect(buildingEngine(world).checkpoint()).toEqual(before);
  expect(admitted(replay(before.archive)).fullHash).toBe(before.archive.hashes.full);
});

test('cold recovery refuses a valid HF archive with forged monthly activity bindings', () => {
  const world = readyDues();
  depart(world);
  const source = buildingEngine(world).checkpoint();
  const bad = structuredClone(source);
  need(bad.world.protocol.monthVisits[0]).receiverActivityId = need(
    bad.world.protocol.monthVisits[0],
  ).actorActivityId;
  expect(() => restoreBuilding(bad)).toThrow('visit binding');
  expect(buildingEngine(world).checkpoint()).toEqual(source);
});

test('a real non-rest activity prevents an invitation and cannot be interrupted by it', () => {
  const world = readyDues();
  buildingTransaction(world, (candidate) => {
    chooseBuilding(
      candidate,
      'burak',
      [
        {
          id: 'actual-private-work',
          person: 'burak',
          actionId: 'work',
          label: 'Keep actual private work',
          durationMs: atMinute(30),
          demands: { effort: 0.05, focus: 0, mode: 'awake', requires: {} },
          tags: [],
          norms: [],
          expected: { needs: {}, followedBy: [], provenance: [] },
          participants: [],
          alongside: [],
          fulfills: [],
          advances: [],
          diminishes: [],
        },
      ],
      'The resident already accepted other work.',
    );
  });
  const before = buildingEngine(world).checkpoint();
  expect(monthVisitOffers(world, 'tarik')).toEqual([]);
  expect(buildingEngine(world).checkpoint()).toEqual(before);
});

test('a receiver can interrupt a real rest to accept the invitation, with its actual interrupted receipt', () => {
  const world = readyDues();
  buildingTransaction(world, (candidate) => {
    chooseBuilding(
      candidate,
      'burak',
      [
        {
          id: 'actual-rest',
          person: 'burak',
          actionId: 'rest',
          label: 'Rest at home',
          durationMs: atMinute(30),
          demands: { effort: 0.05, focus: 0, mode: 'awake', requires: {} },
          tags: ['rest'],
          norms: [],
          expected: { needs: { rest: 0.1 }, followedBy: [], provenance: [] },
          participants: [],
          alongside: [],
          fulfills: [],
          advances: [],
          diminishes: [],
        },
      ],
      'The resident rests at home.',
    );
  });
  depart(world);
  expect(need(world.month).visits).toHaveLength(1);
  const rest = readRunHistory(buildingEngine(world).checkpoint().archive)
    .flatMap((t) => t.inputs)
    .find((i) => i.kind === 'action.resolved' && i.payload.outcome?.offerId === 'actual-rest');
  expect(rest?.kind === 'action.resolved' && rest.payload.outcome?.status).toBe('interrupted');
  const checkpoint = buildingEngine(world).checkpoint();
  expect(buildingEngine(restoreBuilding(JSON.parse(JSON.stringify(checkpoint)))).checkpoint()).toEqual(
    checkpoint,
  );
});

test('a real minute-driven conserved transfer narrates at its actual receipt boundary', () => {
  const world = readyDues();
  depart(world);
  const visit = need(need(world.month).visits[0]);
  while (world.minute < visit.finishesAt) advanceBuildingMinute(world);
  const line = world.said.find((line) => line.text.startsWith('Tarık arrived at Burak’s table.'));
  expect(line?.at).toBe(visit.done);
});

test('completed monthly visits recover after original departure diagnostics expire', () => {
  const world = readyDues();
  depart(world);
  reach(world, need(need(world.month).visits[0]).finishesAt);
  for (let index = 0; index < 80; index++)
    buildingIngress(world, [
      {
        kind: 'observation.received',
        payload: {
          person: 'tarik',
          evidenceId: `later-visit:${index}`,
          percepts: [],
        },
      },
    ]);
  const checkpoint = buildingEngine(world).checkpoint();
  const id = need(world.protocol.monthVisits[0]).actorActivityId;
  expect(
    checkpoint.archive.current.events.some(
      (e) => e.data.kind === 'action-requested' && e.data.request.activityId === id,
    ),
  ).toBe(false);
  expect(buildingEngine(restoreBuilding(JSON.parse(JSON.stringify(checkpoint)))).checkpoint()).toEqual(
    checkpoint,
  );
});
