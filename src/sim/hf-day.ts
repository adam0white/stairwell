/** Authored daily deadlines. HF owns the resulting evidence and social changes. */
import { KAPICI, RIDS, type Rid } from './building-cast.ts';
import type { Task } from './building-types.ts';
import { nameOf } from './building-words.ts';
import { applyBuildingEvents, type BuildingEvent, buildingEngine, buildingObservation } from './hf-game.ts';
import { beliefProbability } from './hf-readings.ts';
import { type BuildingWorld, buildingDay, reportBuilding, sayBuilding, stampBuilding } from './hf-world.ts';

function social(world: BuildingWorld, person: Rid, kind: 'harm' | 'gift', magnitude: number): BuildingEvent {
  return {
    kind: 'social.received',
    payload: {
      person,
      other: KAPICI,
      evidenceId: `stairwell:deadline:${world.protocol.evidence++}`,
      event: { kind, byMe: false, magnitude },
    },
  };
}
function unfinished(task: Task): string {
  const name = nameOf(task.for);
  if (task.kind === 'bread' || task.kind === 'parcel')
    return `You did not deliver ${task.label} to ${name} today.`;
  if (task.label === 'pick up her pharmacy bag') return `You did not deliver ${name}’s pharmacy bag today.`;
  if (task.label === 'his shopping: bread, olives and tea')
    return `You did not bring ${name} bread, olives and tea today.`;
  if (task.label === 'Water his plants. The key is under the mat.')
    return `You did not water ${name}’s plants today.`;
  if (task.label === 'look at the boiler because there is no hot water')
    return `You did not check the boiler for ${name} today. There was no hot water.`;
  const action = task.label
    .replace(/[.!?]$/, '')
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/\b(his|her)\b/g, `${name}’s`);
  return `You did not ${action}${action.includes(`${name}’s`) ? '' : ` for ${name}`} today.`;
}
export function waterOffBuilding(world: BuildingWorld): void {
  const events: BuildingEvent[] = [];
  for (const resident of world.residents) {
    const evidenceId = `stairwell:water-off:${world.protocol.evidence++}`;
    events.push({
      kind: 'fact.confirmed',
      payload: {
        person: resident.id,
        evidenceId,
        observationId: evidenceId,
        prop: 'notice:water',
        value: true,
      },
    });
    if (
      !resident.told.some((told) => told.prop === 'notice:water' && told.value) &&
      resident.where === 'home'
    )
      events.push(social(world, resident.id, 'harm', 0.08));
  }
  applyBuildingEvents(world, events);
  sayBuilding(
    world,
    'narrator',
    'Ten o’clock: the water went off, as the notice said. Somebody upstairs shouted that nobody told them.',
    'event',
  );
}
/** Called once at the actual21:00 boundary, within the enclosing transaction. */
export function endBuildingDay(world: BuildingWorld): void {
  if (world.phase !== 'day' || world.minute % 1440 !== 1260)
    throw Error('The day has not reached its real closing boundary.');
  const day = buildingDay(world),
    report = reportBuilding(world),
    events: BuildingEvent[] = [];
  for (const task of world.tasks) {
    if (
      task.done !== undefined ||
      Math.floor(task.from / 1440) + 1 !== day ||
      world.protocol.wrongParcels.some((record) => record.task === task.id && record.done === undefined)
    )
      continue;
    report.missed++;
    if (task.kind === 'bins') {
      task.done = world.minute;
      sayBuilding(
        world,
        'narrator',
        'Nobody took the bins down. The landing smelled of rubbish all night.',
        'journal',
      );
      for (const id of RIDS) events.push(social(world, id, 'harm', 0.05));
    } else if (world.month && task.custody) {
      task.custodyMissed = true;
      sayBuilding(
        world,
        'narrator',
        `${nameOf(task.for)}’s parcel is still sealed at ${nameOf(task.custody)}’s flat. It missed today’s deadline and must still be handed over.`,
        'journal',
      );
      events.push(social(world, task.for, 'harm', 0.15));
    } else {
      events.push(
        social(world, task.for, 'harm', 0.15),
        buildingObservation(world, task.for, {
          channel: 'saw',
          kind: 'fact',
          summary: 'kapici:reliable',
          claims: [{ prop: 'kapici:reliable', value: false, confidence: 0.65 }],
        }),
      );
      task.done = world.minute;
      sayBuilding(
        world,
        'narrator',
        `${unfinished(task)} ${task.carried ? `You left the delivery by ${nameOf(task.for)}’s door for the morning.` : `${task.for === 'burak' || task.for === 'tarik' ? 'He' : 'She'} probably dealt with it without your help.`} ${task.for === 'burak' || task.for === 'tarik' ? 'He' : 'She'} noticed.`,
        'journal',
      );
    }
  }
  if (world.gateUntil > (day - 1) * 1440) {
    world.catDays++;
    sayBuilding(
      world,
      'narrator',
      world.catDays === 1
        ? 'The ginger stray came in through the gate. Hacer fed it. Sevim sneezed at it.'
        : 'The ginger cat came back. Burak has started calling it Pamuk.',
      'event',
    );
    events.push(
      social(world, 'sevim', 'harm', 0.08),
      social(world, 'burak', 'gift', 0.2),
      social(world, 'hacer', 'gift', 0.1),
    );
    if (world.catDays >= 2 && !world.catHome) {
      world.catHome = true;
      sayBuilding(world, 'narrator', 'Burak bought a bowl. Pamuk is the building’s cat now.', 'event');
      stampBuilding(world, 'cat');
    }
  }
  if (events.length) applyBuildingEvents(world, events);
  report.talks = world.talks.filter((talk) => Math.floor(talk.at / 1440) + 1 === day).length;
  report.caught = [
    ...new Set(
      world.residents
        .filter((resident) => resident.caught.some((at) => Math.floor(at / 1440) + 1 === day))
        .map((resident) => resident.id),
    ),
  ];
  for (const resident of world.residents) {
    if (
      resident.word !== 'yes' ||
      beliefProbability(buildingEngine(world), resident.id, 'kapici:dishonest') < 0.65
    )
      continue;
    resident.word = 'no';
    const why = resident.caught.length
      ? `${nameOf(resident.id)} caught you telling different stories.`
      : resident.grudges.some((grudge) => grudge.lie)
        ? `Your comments about ${nameOf(resident.id)} got back to ${resident.id === 'burak' || resident.id === 'tarik' ? 'him' : 'her'}.`
        : 'People on the step say you are dishonest.';
    sayBuilding(
      world,
      'narrator',
      `${nameOf(resident.id)} avoided looking at you on the stairs. ${why} You can no longer count on ${resident.id === 'burak' || resident.id === 'tarik' ? 'his' : 'her'} vote on Sunday.`,
      'event',
    );
  }
  if ((world.month ? ((day - 1) % 7) + 1 : day) === 6)
    sayBuilding(
      world,
      'riza',
      'Think about the vote before you sleep. Four votes will raise the tea money. You cannot know everyone’s decision in advance.',
      'margin',
    );
  world.phase = 'night';
}
