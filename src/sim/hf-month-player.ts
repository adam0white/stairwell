/** Authored monthly requests. Call inside the sole building transaction. Every
 * choice, activity and promise enters through the existing public HF route. */

import type { DeepReadonly, HostRequest } from '@adam0white/human-framework';
import { canonicalPersona } from '@adam0white/lab-client';
import { KAPICI, RESIDENTS, type Rid } from './building-cast.ts';
import { buildingOffer } from './hf-authoring.ts';
import {
  applyBuildingEvents,
  buildingEngine,
  chooseBuilding,
  interruptBuildingPerson,
  startPrivateBuildingWork,
} from './hf-game.ts';
import { monthVisitOffers, startMonthVisit } from './hf-month.ts';
import { canSpeakBuilding, caretakerScene } from './hf-player-actions.ts';
import { currentBody } from './hf-readings.ts';
import { type ActionReply, atMinute, type BuildingActivity, type BuildingRun, HF_MINUTE } from './hf-run.ts';
import { trustedStoryListenerBuilding } from './hf-stories.ts';
import { type BuildingWorld, buildingDay, buildingPeopleTogether, sayBuilding } from './hf-world.ts';
import { PRIVATE_WORK } from './month.ts';
import { PRIVATE_FACTS } from './stories.ts';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('The monthly scene is missing its recorded building data.');
  return value;
}
const resident = (w: BuildingWorld, id: Rid) => required(w.residents.find((r) => r.id === id));
const weekday = (w: BuildingWorld) => ((buildingDay(w) - 1) % 7) + 1;
const dayStart = (day: number) => (day - 1) * 1440;
function available(w: BuildingWorld, id: Rid): boolean {
  const body = currentBody(buildingEngine(w), id).state;
  const active = buildingEngine(w).active.find((a) => a.person === id);
  return body.alive && !body.asleep && !w.castPauses?.[id] && (!active || active.offer.actionId === 'rest');
}
/** A current invitation is a two-minute conversation. Future promised company
 * is not performed now. Parcel/private-help choices start their actual work. */
function consent(
  w: BuildingWorld,
  who: Rid,
  id: string,
  label: string,
  minutes: number,
  target: string = KAPICI,
  action = 'help',
): boolean {
  if (!available(w, who)) return false;
  interruptBuildingPerson(w, who, 'The resident considers the actual monthly request.');
  const accept = buildingOffer(who, id, action, minutes, {
    label,
    target,
    tags: ['help'],
    expected: { needs: { belonging: 0.12 }, followedBy: [], provenance: [] },
  });
  const decline = buildingOffer(who, 'decline', 'wait', 2, {
    label: 'keep my own plans',
    expected: { needs: { autonomy: 0.1 }, followedBy: [], provenance: [] },
  });
  const choice = chooseBuilding(
    w,
    who,
    [accept, decline],
    'The resident considers the caretaker’s bounded monthly request.',
    {
      voiceId: KAPICI,
      affordanceId: id,
      strength: 0.5,
      adviceId: `stairwell:monthly-request:${w.protocol.evidence++}`,
    },
  );
  const active = buildingEngine(w).active.find((a) => a.person === who),
    r = resident(w, who);
  r.until = active
    ? Math.ceil((active.start + active.offer.durationMs - w.protocol.phase) / HF_MINUTE)
    : w.minute + 1;
  r.doing = active?.offer.id ?? 'home';
  return choice.chosenAffordanceId === id;
}
export function entrustBuilding(w: BuildingWorld, who: Rid, id: number): void {
  const task = w.tasks.find((t) => t.id === id);
  if (
    !w.month ||
    !task ||
    task.done !== undefined ||
    !task.carried ||
    task.kind !== 'parcel' ||
    task.for === who ||
    w.castPauses?.[task.for] === 'paused' ||
    !canSpeakBuilding(w, who)
  )
    return;
  if (!caretakerScene(w, 'arrange-parcel', 'arrange-parcel', 5, 0.1)) return;
  if (
    !consent(
      w,
      who,
      'keep_parcel',
      `keep ${RESIDENTS[task.for].name}’s parcel sealed until they can collect it`,
      5,
      task.for,
    )
  ) {
    sayBuilding(w, who, 'I cannot take responsibility for that today. Keep it with you.', 'voice');
    return;
  }
  task.carried = false;
  task.custody = who;
  task.custodyAt = w.minute;
  applyBuildingEvents(w, [
    {
      kind: 'agenda.requested',
      payload: {
        person: who,
        request: {
          type: 'commit',
          commitment: {
            id: `stairwell:parcel-promise:${task.id}:${w.protocol.evidence++}`,
            kind: 'promise',
            toId: task.for,
            label: 'hand over the sealed parcel',
            actions: ['handover-parcel'],
            targetId: task.for,
            from: atMinute(w.minute),
            until: atMinute(task.by),
            importance: 0.3,
            normId: 'keep-promise',
            completion: 'end',
          },
        },
      },
    },
  ]);
  sayBuilding(
    w,
    who,
    'Tell ' +
      RESIDENTS[task.for].name +
      ' it is safe with me. I will hand it over when we are both home. If we miss each other, it will still be waiting.',
    'voice',
  );
}
export function arrangeRepaymentBuilding(w: BuildingWorld): void {
  if (
    !w.month ||
    !w.stories?.fund.agreed ||
    w.k.walk ||
    w.k.busyTask !== null ||
    !canSpeakBuilding(w, 'tarik')
  )
    return;
  const offer = monthVisitOffers(w, 'tarik').find((o) => o.id === 'dues-payment');
  if (!offer) {
    sayBuilding(
      w,
      'tarik',
      'We need the agreed money and a free interval at home for both Burak and me. Please try after work.',
      'voice',
    );
    return;
  }
  interruptBuildingPerson(w, 'tarik', 'Tarık considers the actual agreed private payment.');
  const keep = buildingOffer('tarik', 'repayment-later', 'rest', 5, {
    label: 'leave the payment for later',
    expected: { needs: { autonomy: 0.1 }, followedBy: [], provenance: [] },
  });
  const decision = chooseBuilding(
    w,
    'tarik',
    [offer, keep],
    'Tarık chooses whether to make the agreed payment now.',
    {
      voiceId: KAPICI,
      affordanceId: offer.id,
      strength: 0.5,
      adviceId: `stairwell:repayment-request:${w.protocol.evidence++}`,
    },
  );
  if (decision.chosenAffordanceId === offer.id) startMonthVisit(w, 'tarik', offer);
  else {
    resident(w, 'tarik').until = w.minute + 5;
    resident(w, 'tarik').doing = 'repayment-later';
    sayBuilding(w, 'tarik', 'Not now. I will keep the money aside and choose another time.', 'voice');
  }
  caretakerScene(w, 'arrange-private-payment', 'arrange-private-payment', 2, 0.05);
}
export function helpStoryBuilding(w: BuildingWorld, who: Rid): void {
  const month = w.month;
  if (
    !month ||
    w.k.at !== `door:${who}` ||
    w.k.walk ||
    w.k.busyTask !== null ||
    buildingDay(w) < 15 ||
    w.secrets[PRIVATE_FACTS[who]] === undefined ||
    !canSpeakBuilding(w, who) ||
    !trustedStoryListenerBuilding(w, who)
  )
    return;
  const work = PRIVATE_WORK[who];
  if ((w.minute % 1440) + work.minutes > 1140) {
    sayBuilding(w, who, 'We need time before seven. Ask me tomorrow at home.', 'voice');
    return;
  }
  if (month.helped[who] || w.tasks.some((t) => t.storyFor === who && t.done === undefined)) return;
  if (!consent(w, who, 'private_help', work.label, work.minutes)) {
    caretakerScene(w, 'ask-private-help', 'ask-private-help', 2, 0.05);
    sayBuilding(w, who, 'I would rather leave that alone today.', 'voice');
    return;
  }
  const task = {
    id: w.nextTask++,
    kind: 'job' as const,
    for: who,
    place: `door:${who}` as const,
    label: work.label,
    work: work.minutes,
    from: w.minute,
    by: dayStart(buildingDay(w)) + 1140,
    storyFor: who,
  };
  w.tasks.push(task);
  if (!startPrivateBuildingWork(w, task.id))
    throw Error(
      'The accepted private help has no actual caretaker work receipt. The notebook has not changed.',
    );
  resident(w, who).until = Math.max(resident(w, who).until, w.k.busyUntil);
  sayBuilding(w, who, 'Yes. We can do that here before seven. It stays between us.', 'voice');
}
export function inviteSeatBuilding(w: BuildingWorld, who: Rid, beside: Rid): void {
  if (
    !w.month ||
    who === beside ||
    w.castPauses?.[beside] === 'paused' ||
    weekday(w) > 6 ||
    !canSpeakBuilding(w, who)
  )
    return;
  if (!caretakerScene(w, 'ask-seating', 'ask-seating', 2, 0.05)) return;
  if (
    !consent(
      w,
      who,
      'sit_beside',
      `consider sitting beside ${RESIDENTS[beside].name} at Sunday’s meeting`,
      2,
      beside,
      'talk',
    )
  ) {
    sayBuilding(w, who, 'I would rather choose my own chair. Please do not move it for me.', 'voice');
    return;
  }
  w.month.seats[who] = beside;
  sayBuilding(
    w,
    who,
    `I can sit beside ${RESIDENTS[beside].name}. Ask them too. I will not speak for them.`,
    'voice',
  );
}

/** The Sunday owner gathers eligible residents at Burak's flat, then calls this
 * before advancing the real ten-minute conversation and voting separately. */
export function meetingSeatsBuilding(w: BuildingWorld): void {
  if (!w.month) return;
  const used = new Set<Rid>();
  for (const [a, b] of Object.entries(w.month.seats) as [Rid, Rid][]) {
    if (
      used.has(a) ||
      used.has(b) ||
      a === b ||
      w.month.seats[b] !== a ||
      w.protocol.seatMeetings.some(
        (s) => s.day === buildingDay(w) && (s.a === a || s.b === a || s.a === b || s.b === b),
      ) ||
      !available(w, a) ||
      !available(w, b) ||
      !buildingPeopleTogether(w, a, b)
    )
      continue;
    used.add(a);
    used.add(b);
    for (const id of [a, b])
      interruptBuildingPerson(w, id, 'The resident takes their reciprocally agreed seat.');
    const first = buildingOffer(a, `meeting-seat:${b}`, 'talk', 10, {
      label: `talk beside ${RESIDENTS[b].name} before the meeting`,
      target: b,
      participants: [b],
      expected: { needs: { belonging: 0.1 }, followedBy: [], provenance: [] },
    });
    if (
      chooseBuilding(w, a, [first], 'The resident takes the reciprocally agreed chair.')
        .chosenAffordanceId !== first.id
    )
      continue;
    const active = required(buildingEngine(w).active.find((x) => x.person === a));
    const second = buildingOffer(b, `meeting-seat:${a}`, 'talk', 10, {
      label: `talk beside ${RESIDENTS[a].name} before the meeting`,
      target: a,
      participants: [a],
      durationMs: active.start + active.offer.durationMs - (buildingEngine(w).now + 1),
      expected: { needs: { belonging: 0.1 }, followedBy: [], provenance: [] },
    });
    if (
      chooseBuilding(w, b, [second], 'The other resident takes the reciprocally agreed chair.')
        .chosenAffordanceId !== second.id
    ) {
      interruptBuildingPerson(w, a, 'The agreed companion could not join the conversation.');
      continue;
    }
    const other = required(buildingEngine(w).active.find((x) => x.person === b));
    if (active.start + active.offer.durationMs !== other.start + other.offer.durationMs)
      throw Error('The actual meeting conversation has unequal accepted ends.');
    w.protocol.seatMeetings.push({
      day: buildingDay(w),
      a,
      b,
      aActivityId: active.id,
      bActivityId: other.id,
    });
    for (const id of [a, b]) {
      resident(w, id).until = w.minute + 10;
      resident(w, id).doing = `meeting-seat:${id === a ? b : a}`;
    }
  }
}
export function resolveMeetingSeatAction(
  w: BuildingWorld,
  request: DeepReadonly<Extract<HostRequest, { kind: 'action' }>>,
  activity: DeepReadonly<BuildingActivity>,
  engine: BuildingRun<BuildingWorld>,
): ActionReply | undefined {
  const seat = w.protocol.seatMeetings.find(
    (s) => s.aActivityId === activity.id || s.bActivityId === activity.id,
  );
  if (!seat) return undefined;
  if (request.stage === 'start') throw Error('The seating record cannot precede actual acceptance.');
  if (!seat.outcome) {
    const first = engine.active.find((a) => a.id === seat.aActivityId && a.person === seat.a),
      second = engine.active.find((a) => a.id === seat.bActivityId && a.person === seat.b);
    const interrupted = engine.pendingRequests.some(
      (r) =>
        r.kind === 'action' &&
        (r.activityId === seat.aActivityId || r.activityId === seat.bActivityId) &&
        r.stage !== 'finish',
    );
    seat.outcome =
      request.stage === 'finish' &&
      !interrupted &&
      first &&
      second &&
      first.start + first.offer.durationMs === request.boundaryAt &&
      second.start + second.offer.durationMs === request.boundaryAt &&
      currentBody(engine, seat.a).state.alive &&
      currentBody(engine, seat.b).state.alive &&
      !currentBody(engine, seat.a).state.asleep &&
      !currentBody(engine, seat.b).state.asleep &&
      buildingPeopleTogether(w, seat.a, seat.b)
        ? 'completed'
        : 'interrupted';
  }
  const status =
    seat.outcome === 'completed' ? 'completed' : request.stage === 'finish' ? 'failed' : 'interrupted';
  return {
    disposition: status,
    observations: [],
    outcome: {
      activityId: activity.id,
      offerId: activity.offer.id,
      actionId: activity.offer.actionId,
      start: activity.start,
      end: request.boundaryAt,
      status,
      evidenceId: `outcome:${request.id}`,
      summary: activity.offer.label,
      ...(activity.offer.target === undefined ? {} : { target: activity.offer.target }),
      actual: { exposures: [], observedProgress: [], material: 0 },
      fulfills: [],
      advances: [],
    },
  };
}
export function settleMeetingSeatsBuilding(w: BuildingWorld): void {
  for (const seat of w.protocol.seatMeetings) {
    if (!seat.outcome || seat.done !== undefined) continue;
    if (seat.outcome === 'interrupted')
      for (const a of buildingEngine(w).active)
        if (a.id === seat.aActivityId || a.id === seat.bActivityId)
          interruptBuildingPerson(w, a.person, 'The agreed meeting conversation was interrupted.');
    if (seat.outcome === 'completed') {
      applyBuildingEvents(
        w,
        [
          { person: seat.a, other: seat.b },
          { person: seat.b, other: seat.a },
        ].map(({ person, other }) => ({
          kind: 'social.received' as const,
          payload: {
            person,
            other,
            evidenceId: `stairwell:meeting-company:${w.protocol.evidence++}`,
            event: { kind: 'chat' as const, byMe: false, magnitude: 0.2 },
          },
        })),
      );
      sayBuilding(
        w,
        'narrator',
        `${RESIDENTS[seat.a].name} and ${RESIDENTS[seat.b].name} chose neighbouring chairs. They spent ten minutes talking before Burak opened the book. Their votes are still their own.`,
        'event',
      );
    }
    seat.done = w.minute;
    for (const id of [seat.a, seat.b]) resident(w, id).until = w.minute + 1;
  }
}

/** Cold recovery: host chair metadata cannot replace the two actual full offer
 * books, accepted starts and matching terminal outcomes in the public archive. */
export function validateMeetingSeatsBuilding(w: BuildingWorld, engine: BuildingRun<BuildingWorld>): void {
  if (!w.protocol.seatMeetings.length) return;
  const inputs = engine.checkpoint().archive.history.flatMap((t) => t.inputs),
    used = new Set<string>(),
    days = new Set<string>();
  const accepted = (id: string, person: Rid) => {
    const receipt = engine.coldActionReceipt(id, person);
    if (!receipt) throw Error('The seating record has no accepted full departure offer. Keep the file.');
    const { request, offer } = receipt;
    const active = engine.active.find((a) => a.id === id && a.person === person);
    if (
      active &&
      (active.start !== request.boundaryAt ||
        active.offerRevision !== request.offerRevision ||
        canonicalPersona(active.offer) !== canonicalPersona(offer))
    )
      throw Error('The seating record replaced an actual activity. Keep the file.');
    return {
      offer,
      start: request.boundaryAt,
      active,
      outcome: receipt.outcome,
    };
  };
  for (const seat of w.protocol.seatMeetings) {
    const aKey = `${seat.day}:${seat.a}`,
      bKey = `${seat.day}:${seat.b}`;
    if (
      seat.a === seat.b ||
      used.has(seat.aActivityId) ||
      used.has(seat.bActivityId) ||
      seat.aActivityId === seat.bActivityId ||
      days.has(aKey) ||
      days.has(bKey)
    )
      throw Error('The seating record duplicates a resident or activity. Keep the file.');
    used.add(seat.aActivityId);
    used.add(seat.bActivityId);
    days.add(aKey);
    days.add(bKey);
    const first = accepted(seat.aActivityId, seat.a),
      second = accepted(seat.bActivityId, seat.b),
      end = first.start + first.offer.durationMs;
    const expected = (person: Rid, target: Rid, durationMs: number) =>
      buildingOffer(person, `meeting-seat:${target}`, 'talk', 10, {
        label: `talk beside ${RESIDENTS[target].name} before the meeting`,
        target,
        participants: [target],
        durationMs,
        expected: { needs: { belonging: 0.1 }, followedBy: [], provenance: [] },
      });
    if (
      canonicalPersona(first.offer) !== canonicalPersona(expected(seat.a, seat.b, atMinute(10))) ||
      canonicalPersona(second.offer) !== canonicalPersona(expected(seat.b, seat.a, end - second.start)) ||
      Math.floor(first.start / (1440 * HF_MINUTE)) + 1 !== seat.day ||
      second.start >= end
    )
      throw Error('The seating record does not match its actual company. Keep the file.');
    if (seat.outcome === undefined) {
      if (seat.done !== undefined || !first.active || !second.active || first.outcome || second.outcome)
        throw Error('The seating record lost an unfinished participant. Keep the file.');
    } else {
      if (first.active || second.active || !first.outcome || !second.outcome || seat.done === undefined)
        throw Error('The seating record has no actual terminal receipts. Keep the file.');
      if (
        seat.outcome === 'completed' &&
        (first.outcome.status !== 'completed' ||
          second.outcome.status !== 'completed' ||
          first.outcome.end !== end ||
          second.outcome.end !== end ||
          seat.done < Math.floor(end / HF_MINUTE))
      )
        throw Error('The seating record invented completed company. Keep the file.');
      if (
        seat.outcome === 'interrupted' &&
        (first.outcome.status === 'completed' || second.outcome.status === 'completed')
      )
        throw Error('The seating record contradicts its interrupted company. Keep the file.');
      if (first.outcome.actual.material !== 0 || second.outcome.actual.material !== 0)
        throw Error('The seating record invented material payment. Keep the file.');
      const chats = inputs.filter(
        (i) =>
          i.kind === 'social.received' &&
          i.payload.evidenceId.startsWith('stairwell:meeting-company:') &&
          ((i.payload.person === seat.a && i.payload.other === seat.b) ||
            (i.payload.person === seat.b && i.payload.other === seat.a)) &&
          Math.floor(i.at / (1440 * HF_MINUTE)) + 1 === seat.day,
      );
      if (
        chats.length !== (seat.outcome === 'completed' ? 2 : 0) ||
        (seat.outcome === 'completed' &&
          (chats.filter(
            (input) =>
              input.kind === 'social.received' &&
              input.payload.person === seat.a &&
              input.payload.other === seat.b,
          ).length !== 1 ||
            chats.filter(
              (input) =>
                input.kind === 'social.received' &&
                input.payload.person === seat.b &&
                input.payload.other === seat.a,
            ).length !== 1)) ||
        chats.some(
          (i) =>
            i.kind === 'social.received' &&
            (i.payload.event.kind !== 'chat' ||
              i.payload.event.magnitude !== 0.2 ||
              i.payload.event.byMe !== false ||
              i.at < end),
        )
      )
        throw Error('The seating record has no matching actual social receipt. Keep the file.');
    }
  }
}
