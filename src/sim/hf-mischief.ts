/** Scripted building consequences occur at their actual scheduled time. A
 * completed peek is an HF activity; later forwarding is authored world fiction. */
import { type DeepReadonly, type HostRequest, type PerceptData } from '@adam0white/human-framework';
import { KAPICI, type Rid } from './building-cast.ts';
import { nameOf } from './building-words.ts';
import { buildingOffer, parcelPrivacyNorm } from './hf-authoring.ts';
import {
  applyBuildingEvents,
  type BuildingEvent,
  buildingEngine,
  buildingObservation,
  chooseBuilding,
  interruptBuildingPerson,
} from './hf-game.ts';
import { canSpeakBuilding } from './hf-player-actions.ts';
import { currentBody, currentNormUnderstanding, currentTraits } from './hf-readings.ts';
import type { BuildingActivity } from './hf-run.ts';
import { type BuildingWorld, buildingDay, sayBuilding, stampBuilding } from './hf-world.ts';

export function prankBuilding(world: BuildingWorld, what: 'gate' | 'swap'): void {
  if (world.phase !== 'day') return;
  const witnesses = world.residents.filter(
    (resident) =>
      resident.where === 'step' ||
      (resident.id === 'hacer' && resident.where === 'home') ||
      resident.stairsUntil >= world.minute,
  );
  if (what === 'gate') {
    if (!['step', 'room', 'landing:0'].includes(world.k.at)) {
      sayBuilding(world, 'narrator', 'The courtyard gate is downstairs, by the step.', 'journal');
      return;
    }
    world.gateUntil = world.minute + 90;
    sayBuilding(world, 'narrator', 'You left the courtyard gate open.', 'journal');
    stampBuilding(world, 'gate');
  } else {
    const papers = ['hacer', 'sevim'].map((id) =>
      world.tasks.find(
        (task) => task.kind === 'bread' && task.for === id && task.carried && task.done === undefined,
      ),
    );
    if (papers.some((task) => !task) || world.swappedDay === buildingDay(world)) {
      sayBuilding(
        world,
        'narrator',
        world.swappedDay === buildingDay(world)
          ? 'You have already done that once today.'
          : 'You need both Hacer’s and Sevim’s papers in the basket.',
        'journal',
      );
      return;
    }
    world.swappedDay = buildingDay(world);
    sayBuilding(
      world,
      'narrator',
      'You swapped Hacer’s and Sevim’s newspapers. Each has the other’s crossword.',
      'journal',
    );
    stampBuilding(world, 'swap');
    world.protocol.paperMixups.push(
      { at: world.minute + 60, reader: 'hacer', other: 'sevim' },
      { at: world.minute + 60, reader: 'sevim', other: 'hacer' },
    );
  }
  const witness = witnesses.find((resident) => resident.id !== 'derya');
  if (witness) {
    applyBuildingEvents(world, [
      buildingObservation(world, witness.id, {
        channel: 'saw',
        kind: 'fact',
        summary: 'the caretaker played a prank',
        claims: [{ prop: 'kapici:reliable', value: false, confidence: 0.6 }],
      }),
    ]);
    sayBuilding(world, 'narrator', `${nameOf(witness.id)} saw you do it.`, 'event');
  }
}

export function misdeliverBuilding(world: BuildingWorld, who: Rid, taskId: number): void {
  if (!canSpeakBuilding(world, who)) return;
  const task = world.tasks.find((task) => task.id === taskId);
  if (!task || task.done !== undefined || !task.carried || task.kind !== 'parcel' || task.for === who) {
    sayBuilding(
      world,
      'narrator',
      'You can only deliver a courier parcel to the wrong door. Residents know when to expect bread and shopping.',
      'journal',
    );
    return;
  }
  if (!currentNormUnderstanding(buildingEngine(world), who).some((norm) => norm.normId === 'privacy')) {
    const privacy = parcelPrivacyNorm();
    applyBuildingEvents(world, [
      {
        kind: 'norm.interpretation-received',
        payload: {
          person: who,
          evidenceId: `stairwell:privacy-reflection:${world.protocol.evidence++}`,
          normId: 'privacy',
          standing: 'disliked',
          conviction: Math.min(0.9, currentTraits(buildingEngine(world), who).honesty),
          provenance: structuredClone(privacy.provenance),
        },
      },
    ]);
  }
  interruptBuildingPerson(world, who, 'The resident receives the actual misdelivered parcel.');
  const offers = [
    buildingOffer(who, `peek-parcel:${task.id}`, 'peek', 3, {
      label: 'have a little look',
      norms: [{ normId: 'privacy', relation: 'violates' }],
      expected: {
        needs: { leisure: 0.12 + 0.25 * currentTraits(buildingEngine(world), who).openness },
        followedBy: [],
        provenance: [],
      },
    }),
    buildingOffer(who, `set-aside-parcel:${task.id}`, 'wait', 2, { label: 'put it by the door for later' }),
  ];
  const decision = chooseBuilding(
    world,
    who,
    offers,
    'The resident decides what to do with the actual parcel.',
  );
  const active = buildingEngine(world).active.find((activity) => activity.person === who);
  if (!active || active.offer.id !== decision.chosenAffordanceId)
    throw Error('The parcel recipient has not accepted an actual activity.');
  task.carried = false;
  task.wrongDoor = who;
  world.protocol.wrongParcels.push({
    task: task.id,
    holder: who,
    activityId: active.id,
    choice: active.offer.actionId === 'peek' ? 'peek' : 'set_aside',
    forwardAt: world.minute + 60,
  });
  const resident = world.residents.find((resident) => resident.id === who);
  if (!resident) throw Error('The parcel recipient has no building role.');
  resident.until = world.minute + active.offer.durationMs / 60000;
  sayBuilding(world, who, `For ${nameOf(task.for)}? Leave it, I’ll see it gets there.`, 'voice');
  stampBuilding(world, 'wrong_door');
}

/** This hook adds actual label observations to the existing terminal receipt.
 * It never emits a second HF input while the owner transaction is in flight. */
export function mischiefActionObservations(
  world: BuildingWorld,
  request: DeepReadonly<Extract<HostRequest, { kind: 'action' }>>,
  activity: DeepReadonly<BuildingActivity>,
): PerceptData[] {
  const record = world.protocol.wrongParcels.find((record) => record.activityId === activity.id);
  if (!record || request.stage === 'start') return [];
  if (record.holder !== activity.person || record.resolved)
    throw Error('The actual parcel activity no longer matches its host binding.');
  record.resolved = {
    atMs: request.boundaryAt,
    status: request.stage === 'finish' ? 'completed' : 'interrupted',
    receipt: request.id,
  };
  const task = world.tasks.find((task) => task.id === record.task);
  if (!task || task.wrongDoor !== record.holder)
    throw Error('The parcel activity has no matching actual parcel.');
  if (record.choice !== 'peek' || request.stage !== 'finish' || !task.label2) return [];
  return [
    {
      id: `parcel-label:${request.id}`,
      occurredAt: request.boundaryAt,
      channel: 'saw',
      kind: 'label',
      actorId: activity.person,
      summary: task.label2.text,
      salience: 0.8,
      valence: 0,
      claims: [{ prop: task.label2.prop, value: true, confidence: 0.99 }],
      norms: [],
      advice: [],
      consequences: [],
      withdrawConsequences: [],
      witnesses: [],
      reports: [],
      provenance: [`outcome:${request.id}`],
    },
  ];
}
export function sceneEffectsBuilding(world: BuildingWorld): void {
  const events: BuildingEvent[] = [];
  for (const effect of [...world.protocol.paperMixups]) {
    if (effect.at > world.minute || currentBody(buildingEngine(world), effect.reader).state.asleep) continue;
    events.push(
      buildingObservation(world, effect.reader, {
        channel: 'saw',
        kind: 'mixup',
        salience: 0.6,
        valence: -0.1,
        summary: `${nameOf(effect.other)}’s pen marks on my crossword`,
        claims: [{ prop: `${effect.other}:nosy`, value: true, confidence: 0.7 }],
      }),
    );
    world.protocol.paperMixups.splice(world.protocol.paperMixups.indexOf(effect), 1);
  }
  for (const record of world.protocol.wrongParcels) {
    if (record.done !== undefined || !record.resolved || record.forwardAt > world.minute) continue;
    const task = world.tasks.find((task) => task.id === record.task);
    if (!task || task.wrongDoor !== record.holder || task.done !== undefined)
      throw Error('The scheduled forwarding has lost its actual parcel.');
    const peeked = record.choice === 'peek' && record.resolved.status === 'completed';
    if (peeked && task.label2)
      sayBuilding(
        world,
        'narrator',
        `Later, the tape on ${nameOf(task.for)}’s parcel had been lifted and pressed back down.`,
        'event',
      );
    // A scripted world forwarding receipt, without an invented HF-owned handover.
    task.done = world.minute;
    record.done = world.minute;
    events.push({
      kind: 'social.received',
      payload: {
        person: task.for,
        other: KAPICI,
        evidenceId: `stairwell:wrong-door:${world.protocol.evidence++}`,
        event: { kind: 'harm', byMe: false, magnitude: peeked ? 0.3 : 0.1 },
      },
    });
  }
  if (events.length) applyBuildingEvents(world, events);
}
