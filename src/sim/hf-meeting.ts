/** Authored Sunday meeting. Each vote is the resident's actual public decision. */
import { FACTS, KAPICI, RIDS } from './building-cast.ts';
import { buildingOffer } from './hf-authoring.ts';
import {
  applyBuildingEvents,
  type BuildingEvent,
  buildingEngine,
  chooseBuilding,
  interruptBuildingPerson,
} from './hf-game.ts';
import { beliefProbability, currentBody, currentTies } from './hf-readings.ts';
import { type BuildingWorld, buildingDay, sayBuilding, stampBuilding } from './hf-world.ts';

export function meetingBuilding(
  world: BuildingWorld,
  advanceUntil: (minute: number) => void,
  seats?: { start: (world: BuildingWorld) => void; settle: (world: BuildingWorld) => void },
): void {
  const day = buildingDay(world);
  if (day % 7 !== 0 || world.minute % 1440 !== 660)
    throw Error('This meeting has not reached its actual Sunday time.');
  const engine = buildingEngine(world);
  for (const resident of world.residents) {
    const body = currentBody(engine, resident.id).state;
    const active = engine.active.find((activity) => activity.person === resident.id);
    if (
      body.alive &&
      !body.asleep &&
      (!active || !['work', 'sleep'].includes(active.offer.actionId)) &&
      !active?.offer.tags.includes('worship')
    )
      resident.where = resident.id === 'burak' ? 'home' : 'visit:burak';
  }
  if (world.month) {
    if (Object.keys(world.month.seats).length && !seats)
      throw Error('The recorded seating needs its actual meeting conversation.');
    seats?.start(world);
    advanceUntil(world.minute + 10);
    seats?.settle(world);
  }
  sayBuilding(
    world,
    'narrator',
    'It is Sunday. The residents meet in Mr Burak’s flat. He serves tea in the good glasses.',
    'journal',
  );
  const present = RIDS.filter((id) => {
    const body = currentBody(engine, id).state;
    const active = engine.active.find((activity) => activity.person === id);
    return (
      body.alive &&
      !body.asleep &&
      (!active || !['work', 'sleep'].includes(active.offer.actionId)) &&
      !active?.offer.tags.includes('worship')
    );
  });
  const facts: BuildingEvent[] = [];
  for (const id of present)
    for (const [prop, value] of [
      ['burak:dishonest', false],
      [FACTS.fund, true],
    ] as const) {
      const evidenceId = `stairwell:meeting-book:${world.protocol.evidence++}`;
      facts.push({
        kind: 'fact.confirmed',
        payload: { person: id, evidenceId, observationId: evidenceId, prop, value },
      });
    }
  if (facts.length) applyBuildingEvents(world, facts);
  sayBuilding(
    world,
    'burak',
    world.stories?.fund.repaired
      ? 'Here is the pump invoice and the deposit. The balance is due next week. We are arranging the repayments privately.'
      : 'Here is the book. Every hundredth of a lira is recorded. One flat is behind, and that is their business.',
    'voice',
  );
  if (
    present.filter(
      (id) => id !== 'burak' && id !== 'tarik' && beliefProbability(engine, id, FACTS.dues) >= 0.7,
    ).length >= 2
  ) {
    sayBuilding(world, 'narrator', 'Everyone looked at Mr Tarık. He looked at his tea.', 'event');
    applyBuildingEvents(world, [
      {
        kind: 'social.received',
        payload: {
          person: 'tarik',
          other: KAPICI,
          evidenceId: `stairwell:meeting-dues:${world.protocol.evidence++}`,
          event: { kind: 'harm', byMe: false, magnitude: 0.4 },
        },
      },
    ]);
  }
  let yes = 0,
    no = 0;
  for (const id of RIDS) {
    const resident = world.residents.find((resident) => resident.id === id);
    if (!resident) throw Error('The meeting has lost its resident.');
    const affection = currentTies(engine, id).find((tie) => tie.otherId === KAPICI)?.affection ?? 0;
    if (!present.includes(id) || (id === 'derya' && affection < -0.1)) {
      resident.vote = 'away';
      continue;
    }
    interruptBuildingPerson(world, id, 'The resident pauses free time for the actual meeting vote.');
    const offers = [
      buildingOffer(id, 'vote_yes', 'help', 2, {
        label:
          world.month && day === 28
            ? 'keep the caretaker for another month'
            : 'raise the caretaker’s tea money',
        target: KAPICI,
        tags: ['help'],
        expected: {
          needs: { belonging: 0.05 },
          material: -0.5 + 2.5 * Math.max(0, affection - 0.12),
          followedBy: [],
          provenance: [],
        },
      }),
      buildingOffer(id, 'vote_no', 'wait', 2, {
        label: 'keep it as it is',
        expected: { needs: { safety: 0.04 }, followedBy: [], provenance: [] },
      }),
    ];
    const choice = chooseBuilding(world, id, offers, 'The resident casts their own Sunday vote.');
    if (choice.chosenAffordanceId === 'vote_yes') {
      resident.vote = 'yes';
      yes++;
    } else if (choice.chosenAffordanceId === 'vote_no') {
      resident.vote = 'no';
      no++;
    } else resident.vote = 'away';
  }
  // The old host advanced each actor by2minutes while leaving its own clock
  // behind. The shared Run records these same actual2minute vote activities.
  advanceUntil(world.minute + 2);
  const approved = yes >= 4,
    final = !!world.month && day === 28,
    raise = approved && !final;
  world.meeting = { done: true, yes, no, raise };
  if (world.month) {
    world.month.meetings.push({ day, ...world.meeting });
    if (final) {
      world.month.stay = approved;
      sayBuilding(
        world,
        'narrator',
        approved
          ? 'The residents vote to keep you as caretaker. Burak writes the renewed agreement in the book.'
          : 'The residents do not renew your caretaker agreement. You keep your notebook and the money you earned.',
        'event',
      );
    }
  }
  if (raise) {
    world.k.money += 300;
    stampBuilding(world, 'raise');
  }
  if (!final)
    sayBuilding(
      world,
      'narrator',
      raise
        ? `Your tea money increases after ${yes} votes in favour. Mr Burak counts ₺300 into your tin.`
        : `Your tea money stays the same. Votes in favour: ${yes}. Votes against: ${no}.`,
      'event',
    );
  world.phase = 'sunday';
}
