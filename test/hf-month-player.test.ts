/** These are explicitly prepared host scenes, not a full month or owner journey. */
import { readRunHistory, replay, restoreRun } from '@adam0white/human-framework';
import { expect, test } from 'vitest';
import {
  applyBuildingEvents,
  buildingEngine,
  buildingIngress,
  buildingTransaction,
  chooseBuilding,
  interruptBuildingPerson,
  openBuilding,
  restoreBuilding,
} from '../src/sim/hf-game.ts';
import { monthVisitOffers, settleMonthVisits, startMonthVisit } from '../src/sim/hf-month.ts';
import {
  arrangeRepaymentBuilding,
  entrustBuilding,
  helpStoryBuilding,
  inviteSeatBuilding,
  meetingSeatsBuilding,
  settleMeetingSeatsBuilding,
} from '../src/sim/hf-month-player.ts';
import { currentAgenda, currentTies } from '../src/sim/hf-readings.ts';
import { admitted } from '../src/sim/hf-run.ts';
import type { BuildingWorld } from '../src/sim/hf-world.ts';

function need<T>(v: T | undefined): T {
  if (v === undefined) throw Error('Missing prepared scene value.');
  return v;
}
function clock(world: BuildingWorld, minute: number) {
  world.minute = minute;
  buildingIngress(world, [
    {
      kind: 'observation.received',
      payload: { person: 'hacer', evidenceId: `prepared-clock:${minute}`, percepts: [] },
    },
  ]);
}
function atDoor(world: BuildingWorld, id: 'hacer' | 'tarik') {
  world.k.at = `door:${id}`;
  need(world.residents.find((r) => r.id === id)).where = 'home';
}

test('entrusted parcel requires real resident consent and records an actual promise and custody, with full replay', () => {
  const world = openBuilding(7, 'stairwell@15');
  clock(world, 600);
  atDoor(world, 'hacer');
  const task = {
    id: world.nextTask++,
    kind: 'parcel' as const,
    for: 'sevim' as const,
    label: 'a sealed parcel',
    place: 'door:sevim' as const,
    from: 600,
    by: 900,
    carried: true,
  };
  world.tasks.push(task);
  buildingTransaction(world, (candidate) => entrustBuilding(candidate, 'hacer', task.id));
  expect(world.tasks.find((t) => t.id === task.id)).toMatchObject({
    carried: false,
    custody: 'hacer',
    custodyAt: 600,
  });
  expect(buildingEngine(world).active.find((a) => a.person === 'hacer')?.offer).toMatchObject({
    id: 'keep_parcel',
    actionId: 'help',
    target: 'sevim',
    durationMs: 300000,
  });
  expect(
    currentAgenda(buildingEngine(world), 'hacer').commitments.some(
      (c) => c.actions.includes('handover-parcel') && c.targetId === 'sevim' && c.status === 'pending',
    ),
  ).toBe(true);
  const checkpoint = buildingEngine(world).checkpoint();
  expect(buildingEngine(restoreBuilding(JSON.parse(JSON.stringify(checkpoint)))).checkpoint()).toEqual(
    checkpoint,
  );
  expect(admitted(replay(checkpoint.archive)).fullHash).toBe(checkpoint.archive.hashes.full);
});

test('repayment uses actual two-person monthly consent and keeps funds until actual completion', () => {
  const world = openBuilding(7, 'stairwell@15');
  clock(world, 1100);
  atDoor(world, 'tarik');
  need(world.residents.find((r) => r.id === 'burak')).where = 'home';
  need(world.stories).fund.agreed = true;
  need(world.month).repaymentAt = 1100;
  need(world.month).tarikCash = 600;
  need(world.month).supplierBalance = 600;
  buildingTransaction(world, arrangeRepaymentBuilding);
  expect(need(world.month).visits).toHaveLength(1);
  expect(need(world.month).paymentLedger).toEqual([]);
  expect(need(world.month).tarikCash).toBe(600);
  expect(buildingEngine(world).active.find((a) => a.person === 'kapici')?.offer).toMatchObject({
    actionId: 'arrange-private-payment',
    durationMs: 120000,
  });
  const checkpoint = buildingEngine(world).checkpoint();
  expect(admitted(replay(checkpoint.archive)).fullHash).toBe(checkpoint.archive.hashes.full);
});

test('an invitation records only that resident’s actual choice and a current two-minute conversation', () => {
  const world = openBuilding(7, 'stairwell@15');
  clock(world, 600);
  atDoor(world, 'hacer');
  buildingTransaction(world, (candidate) => inviteSeatBuilding(candidate, 'hacer', 'sevim'));
  expect(need(world.month).seats).toEqual({ hacer: 'sevim' });
  expect(buildingEngine(world).active.find((a) => a.person === 'hacer')?.offer).toMatchObject({
    id: 'sit_beside',
    actionId: 'talk',
    target: 'sevim',
    durationMs: 120000,
  });
  expect(world.protocol.seatMeetings).toEqual([]);
});

test('private work refuses before day15 without revealing a private fact or inventing work', () => {
  const world = openBuilding(7, 'stairwell@15');
  clock(world, 600);
  atDoor(world, 'hacer');
  const before = buildingEngine(world).checkpoint();
  buildingTransaction(world, (candidate) => helpStoryBuilding(candidate, 'hacer'));
  expect(buildingEngine(world).checkpoint()).toEqual(before);
});

test('reciprocal chairs produce social evidence only after the real two-person ten-minute activities finish', () => {
  const world = openBuilding(7, 'stairwell@15');
  clock(world, 600);
  need(world.month).seats = { hacer: 'sevim', sevim: 'hacer' };
  for (const id of ['hacer', 'sevim']) need(world.residents.find((r) => r.id === id)).where = 'visit:burak';
  need(world.residents.find((r) => r.id === 'burak')).where = 'home';
  const before = currentTies(buildingEngine(world), 'hacer').find((t) => t.otherId === 'sevim');
  buildingTransaction(world, meetingSeatsBuilding);
  expect(world.protocol.seatMeetings).toHaveLength(1);
  expect(
    readRunHistory(buildingEngine(world).checkpoint().archive)
      .flatMap((t) => t.inputs)
      .filter(
        (i) => i.kind === 'social.received' && i.payload.evidenceId.startsWith('stairwell:meeting-company:'),
      ),
  ).toEqual([]);
  const checkpoint = buildingEngine(world).checkpoint();
  const recovered = restoreBuilding(JSON.parse(JSON.stringify(checkpoint)));
  for (const w of [world, recovered])
    buildingTransaction(w, (candidate) => {
      candidate.minute = 610;
      applyBuildingEvents(candidate, [
        {
          kind: 'observation.received',
          payload: { person: 'hacer', evidenceId: 'meeting-end', percepts: [] },
        },
      ]);
      settleMeetingSeatsBuilding(candidate);
    });
  expect(world.protocol.seatMeetings[0]).toMatchObject({ done: 610, outcome: 'completed' });
  const ended = buildingEngine(world).checkpoint();
  expect(buildingEngine(restoreBuilding(JSON.parse(JSON.stringify(ended)))).checkpoint()).toEqual(ended);
  buildingTransaction(world, settleMeetingSeatsBuilding);
  expect(buildingEngine(world).checkpoint()).toEqual(ended);
  expect(
    need(currentTies(buildingEngine(world), 'hacer').find((t) => t.otherId === 'sevim')).affection,
  ).toBeGreaterThan(need(before).affection);
  expect(buildingEngine(world).checkpoint()).toEqual(buildingEngine(recovered).checkpoint());
  expect(admitted(replay(buildingEngine(world).checkpoint().archive)).fullHash).toBe(
    buildingEngine(world).checkpoint().archive.hashes.full,
  );
});

test('the entrusted parcel’s targeted promise is kept only after the real sealed handover', () => {
  const world = openBuilding(7, 'stairwell@15');
  clock(world, 600);
  atDoor(world, 'hacer');
  need(world.residents.find((r) => r.id === 'sevim')).where = 'home';
  const task = {
    id: world.nextTask++,
    kind: 'parcel' as const,
    for: 'sevim' as const,
    label: 'a sealed parcel',
    place: 'door:sevim' as const,
    from: 600,
    by: 900,
    carried: true,
  };
  world.tasks.push(task);
  buildingTransaction(world, (c) => entrustBuilding(c, 'hacer', task.id));
  const promise = need(
    currentAgenda(buildingEngine(world), 'hacer').commitments.find((c) => c.targetId === 'sevim'),
  );
  expect(promise.status).toBe('pending');
  clock(world, 606);
  buildingTransaction(world, (c) => {
    const offer = need(monthVisitOffers(c, 'hacer').find((o) => o.id === `parcel-handover:${task.id}`));
    expect(
      chooseBuilding(c, 'hacer', [offer], 'The custodian fulfills the actual promise.').chosenAffordanceId,
    ).toBe(offer.id);
    startMonthVisit(c, 'hacer', offer);
  });
  clock(world, 612);
  buildingTransaction(world, settleMonthVisits);
  expect(
    currentAgenda(buildingEngine(world), 'hacer').commitments.find((c) => c.id === promise.id)?.status,
  ).toBe('kept');
  expect(admitted(replay(buildingEngine(world).checkpoint().archive)).fullHash).toBe(
    buildingEngine(world).checkpoint().archive.hashes.full,
  );
});

test('actual interrupted company produces no premature or late social reward', () => {
  const world = openBuilding(7, 'stairwell@15');
  clock(world, 600);
  need(world.month).seats = { hacer: 'sevim', sevim: 'hacer' };
  for (const id of ['hacer', 'sevim']) need(world.residents.find((r) => r.id === id)).where = 'visit:burak';
  buildingTransaction(world, meetingSeatsBuilding);
  buildingTransaction(world, (c) => {
    interruptBuildingPerson(c, 'sevim', 'The resident leaves the actual conversation.');
    settleMeetingSeatsBuilding(c);
  });
  expect(world.protocol.seatMeetings[0]).toMatchObject({ done: 600, outcome: 'interrupted' });
  expect(buildingEngine(world).active.some((a) => a.person === 'hacer' || a.person === 'sevim')).toBe(false);
  expect(
    readRunHistory(buildingEngine(world).checkpoint().archive)
      .flatMap((t) => t.inputs)
      .filter(
        (i) => i.kind === 'social.received' && i.payload.evidenceId.startsWith('stairwell:meeting-company:'),
      ),
  ).toEqual([]);
  const checkpoint = buildingEngine(world).checkpoint();
  expect(buildingEngine(restoreBuilding(checkpoint)).checkpoint()).toEqual(checkpoint);
});

test('cold recovery refuses duplicated seating activity bindings and one-sided chairs start nobody', () => {
  const world = openBuilding(7, 'stairwell@15');
  clock(world, 600);
  need(world.month).seats = { hacer: 'sevim' };
  for (const id of ['hacer', 'sevim']) need(world.residents.find((r) => r.id === id)).where = 'visit:burak';
  const before = buildingEngine(world).checkpoint();
  buildingTransaction(world, meetingSeatsBuilding);
  expect(buildingEngine(world).checkpoint()).toEqual(before);
  need(world.month).seats.sevim = 'hacer';
  buildingTransaction(world, meetingSeatsBuilding);
  const bad = structuredClone(buildingEngine(world).checkpoint());
  need(bad.world.protocol.seatMeetings[0]).bActivityId = need(bad.world.protocol.seatMeetings[0]).aActivityId;
  expect(() => restoreBuilding(bad)).toThrow('seating record duplicates');
});

test('a late whole-host failure after actual completed company rolls back both HF and social receipts', () => {
  const world = openBuilding(7, 'stairwell@15');
  clock(world, 600);
  need(world.month).seats = { hacer: 'sevim', sevim: 'hacer' };
  for (const id of ['hacer', 'sevim']) need(world.residents.find((r) => r.id === id)).where = 'visit:burak';
  buildingTransaction(world, meetingSeatsBuilding);
  const before = buildingEngine(world).checkpoint();
  expect(() =>
    buildingTransaction(world, (c) => {
      c.minute = 610;
      applyBuildingEvents(c, [
        {
          kind: 'observation.received',
          payload: { person: 'hacer', evidenceId: 'late-meeting-failure', percepts: [] },
        },
      ]);
      settleMeetingSeatsBuilding(c);
      expect(c.protocol.seatMeetings[0]?.outcome).toBe('completed');
      throw Error('late company failure');
    }),
  ).toThrow('late company failure');
  expect(buildingEngine(world).checkpoint()).toEqual(before);
});

test('valid public HF history with duplicate one-way company cannot stand in for reciprocal chat', () => {
  const world = openBuilding(7, 'stairwell@15');
  clock(world, 600);
  need(world.month).seats = { hacer: 'sevim', sevim: 'hacer' };
  for (const id of ['hacer', 'sevim'])
    need(world.residents.find((resident) => resident.id === id)).where = 'visit:burak';
  buildingTransaction(world, meetingSeatsBuilding);
  clock(world, 610); // Resolves both actual talk activities; deliberately does not author the settlement chats.
  const seat = need(world.protocol.seatMeetings[0]);
  expect(seat.outcome).toBe('completed');
  buildingTransaction(world, (candidate) => {
    applyBuildingEvents(
      candidate,
      [0, 1].map((index) => ({
        kind: 'social.received' as const,
        payload: {
          person: 'hacer',
          other: 'sevim',
          evidenceId: `stairwell:meeting-company:one-way-${index}`,
          event: { kind: 'chat' as const, byMe: false, magnitude: 0.2 },
        },
      })),
    );
    need(candidate.protocol.seatMeetings[0]).done = candidate.minute;
  });
  const checkpoint = buildingEngine(world).checkpoint();
  expect(() => admitted(restoreRun(checkpoint.archive))).not.toThrow();
  expect(() => restoreBuilding(checkpoint)).toThrow(/matching actual social receipt/);
});

test('completed reciprocal seats recover after original departure diagnostics expire', () => {
  const world = openBuilding(7, 'stairwell@15');
  clock(world, 600);
  need(world.month).seats = { hacer: 'sevim', sevim: 'hacer' };
  for (const id of ['hacer', 'sevim']) need(world.residents.find((r) => r.id === id)).where = 'visit:burak';
  buildingTransaction(world, meetingSeatsBuilding);
  clock(world, 610);
  buildingTransaction(world, settleMeetingSeatsBuilding);
  expect(world.protocol.seatMeetings[0]).toMatchObject({ outcome: 'completed' });
  for (let index = 0; index < 80; index++)
    buildingTransaction(world, (candidate) =>
      applyBuildingEvents(candidate, [
        {
          kind: 'observation.received',
          payload: {
            person: 'hacer',
            evidenceId: `later-seat:${index}`,
            percepts: [],
          },
        },
      ]),
    );
  const checkpoint = buildingEngine(world).checkpoint();
  const id = need(world.protocol.seatMeetings[0]).aActivityId;
  expect(
    checkpoint.archive.current.events.some(
      (e) => e.data.kind === 'action-requested' && e.data.request.activityId === id,
    ),
  ).toBe(false);
  expect(buildingEngine(restoreBuilding(JSON.parse(JSON.stringify(checkpoint)))).checkpoint()).toEqual(
    checkpoint,
  );
});
