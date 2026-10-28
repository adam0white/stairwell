/** Monthly building handovers. HF owns both choices and both activities; this
 * module owns parcels, dates and conserved building money. Call mutations only
 * inside the enclosing buildingTransaction. */

import type { DeepReadonly, HostRequest, Offer, PerceptData } from '@adam0white/human-framework';
import { canonicalPersona } from '@adam0white/lab-client';
import { FACTS, RESIDENTS, type Rid } from './building-cast.ts';
import { buildingOffer } from './hf-authoring.ts';
import {
  applyBuildingEvents,
  buildingEngine,
  chooseBuilding,
  completeBuildingTask,
  interruptBuildingPerson,
} from './hf-game.ts';
import { currentAgenda, currentBody } from './hf-readings.ts';
import { type ActionReply, atMinute, type BuildingActivity, type BuildingRun, HF_MINUTE } from './hf-run.ts';
import { type BuildingWorld, buildingDay, sayBuilding, stampBuilding } from './hf-world.ts';

const dayStart = (day: number) => (day - 1) * 1440;
const weekday = (w: BuildingWorld) => ((buildingDay(w) - 1) % 7) + 1;
const resident = (w: BuildingWorld, id: Rid) => {
  const found = w.residents.find((r) => r.id === id);
  if (!found) throw Error('The monthly handover has no resident.');
  return found;
};
function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('The monthly handover is missing its recorded world data.');
  return value;
}
const duesId = (at: number) => `stairwell:dues:${at}`;
function fits(w: BuildingWorld, id: Rid, minutes: number, acceptedId?: string): boolean {
  const r = resident(w, id),
    engine = buildingEngine(w),
    body = currentBody(engine, id).state;
  const active = engine.active.find((a) => a.person === id);
  if (
    !body.alive ||
    body.asleep ||
    w.castPauses?.[id] ||
    r.where !== 'home' ||
    (active && active.id !== acceptedId && active.offer.actionId !== 'rest')
  )
    return false;
  const t = w.minute % 1440,
    info = RESIDENTS[id];
  if (t < 540 || t + minutes >= 1260) return false;
  if (info.work && weekday(w) <= 5 && t < info.work[1] && t + minutes >= info.work[0]) return false;
  if (info.nights && (t < 930 || (weekday(w) <= 5 && t + minutes >= 1170))) return false;
  return !currentAgenda(engine, id).commitments.some(
    (c) =>
      c.status === 'pending' &&
      c.from <= atMinute(w.minute + minutes) &&
      c.until > engine.now &&
      c.kind !== 'abstain' &&
      !c.actions.every((a) => a === 'rest' || a === 'handover-parcel' || a === 'pay-dues'),
  );
}
function offers(w: BuildingWorld, id: Rid, acceptedId?: string): Offer[] {
  const month = w.month;
  if (!month || month.visits.some((v) => v.done === undefined && (v.actor === id || v.other === id)))
    return [];
  const result: Offer[] = [];
  for (const task of w.tasks) {
    if (task.done !== undefined || task.custody !== id || task.for === id) continue;
    const minutes = Math.max(1, Math.abs(RESIDENTS[id].floor - RESIDENTS[task.for].floor) * 3) + 3;
    if (fits(w, id, minutes, acceptedId) && fits(w, task.for, minutes))
      result.push(
        buildingOffer(id, `parcel-handover:${task.id}`, 'handover-parcel', minutes, {
          label: `take the sealed parcel to ${RESIDENTS[task.for].name}`,
          target: task.for,
          participants: [task.for],
          tags: ['help'],
          demands: { effort: 0.35, focus: 0, mode: 'awake', requires: {} },
          expected: { needs: { belonging: 0.15 }, followedBy: [], provenance: [] },
        }),
      );
  }
  if (
    id === 'tarik' &&
    month.repaymentAt !== undefined &&
    w.minute >= month.repaymentAt &&
    month.duesBalance > 0 &&
    month.tarikCash >= Math.min(200, month.duesBalance)
  ) {
    const minutes = Math.max(1, Math.abs(RESIDENTS.tarik.floor - RESIDENTS.burak.floor) * 3) + 3;
    if (fits(w, id, minutes, acceptedId) && fits(w, 'burak', minutes))
      result.push(
        buildingOffer(id, 'dues-payment', 'pay-dues', minutes, {
          label: 'take the agreed weekly payment to Burak privately',
          target: 'burak',
          participants: ['burak'],
          tags: ['help'],
          demands: { effort: 0.35, focus: 0, mode: 'awake', requires: {} },
          expected: {
            needs: { autonomy: 0.18, belonging: 0.18 },
            material: -0.1,
            followedBy: [],
            provenance: [],
          },
          fulfills: currentAgenda(buildingEngine(w), id).commitments.some(
            (c) => c.id === duesId(required(month.repaymentAt)) && c.status === 'pending',
          )
            ? [duesId(month.repaymentAt)]
            : [],
        }),
      );
  }
  return result;
}
export function monthVisitOffers(world: BuildingWorld, id: Rid): Offer[] {
  return offers(world, id);
}

export function startMonthVisit(w: BuildingWorld, id: Rid, acceptedOffer: Offer): void {
  const engine = buildingEngine(w),
    actor = engine.active.find((a) => a.person === id);
  if (!actor || canonicalPersona(actor.offer) !== canonicalPersona(acceptedOffer))
    throw Error('The monthly departure needs its actual accepted HF activity.');
  const expected = offers(w, id, actor.id).find((o) => o.id === acceptedOffer.id);
  if (!expected || canonicalPersona(expected) !== canonicalPersona(acceptedOffer))
    throw Error('The accepted monthly departure no longer matches the building handover.');
  const month = required(w.month);
  const parcel = acceptedOffer.id.startsWith('parcel-handover:')
    ? w.tasks.find((t) => acceptedOffer.id === `parcel-handover:${t.id}`)
    : undefined;
  const other = parcel?.for ?? 'burak';
  const prior = engine.active.find((a) => a.person === other);
  if (prior) {
    if (prior.offer.actionId !== 'rest')
      throw Error('Only an available rest can be interrupted for a handover invitation.');
    interruptBuildingPerson(w, other, 'The resident considers the actual private handover invitation.');
  }
  // The visitor's authored travel/work duration is unchanged. The receiver waits
  // until that already accepted end, rather than adding an ingress phase to it.
  const end = actor.start + actor.offer.durationMs;
  const receive = buildingOffer(other, 'receive-building-handover', 'help', 1, {
    label: 'wait at home for the agreed handover',
    target: id,
    participants: [id],
    tags: ['help'],
    durationMs: end - (engine.now + 1),
    expected: { needs: { belonging: 0.1 }, followedBy: [], provenance: [] },
  });
  if (receive.durationMs <= 0) throw Error('The handover interval has already ended.');
  const decline = buildingOffer(other, 'keep-plans', 'rest', 10, {
    label: 'keep my plans',
    expected: { needs: { autonomy: 0.1 }, followedBy: [], provenance: [] },
  });
  const choice = chooseBuilding(
    w,
    other,
    [receive, decline],
    'The resident chooses whether to receive this private handover.',
  );
  if (choice.chosenAffordanceId !== receive.id) {
    const kept = engine.active.find((a) => a.person === other);
    const receiving = resident(w, other);
    receiving.until = kept
      ? Math.ceil((kept.start + kept.offer.durationMs - w.protocol.phase) / HF_MINUTE)
      : w.minute + 1;
    receiving.doing = kept?.offer.id ?? 'home';
    interruptBuildingPerson(w, id, 'The other resident declined the private handover.');
    chooseBuilding(
      w,
      id,
      [
        buildingOffer(id, 'handover-declined', 'rest', 5, {
          label: 'leave the handover for later',
          expected: { needs: { rest: 0.1 }, followedBy: [], provenance: [] },
        }),
      ],
      'The handover was declined.',
    );
    resident(w, id).until = w.minute + 5;
    resident(w, id).doing = engine.active.find((a) => a.person === id)?.offer.id ?? 'home';
    return;
  }
  const receiver = engine.active.find((a) => a.person === other);
  if (!receiver || receiver.offer.id !== receive.id || receiver.start + receiver.offer.durationMs !== end)
    throw Error('The accepted handover activities do not share their recorded end.');
  const visit = month.visits.length;
  const minutes = acceptedOffer.durationMs / HF_MINUTE;
  month.visits.push({
    actor: id,
    other,
    kind: parcel ? 'parcel' : 'dues',
    ...(parcel ? { task: parcel.id } : { amount: Math.min(200, month.duesBalance) }),
    startedAt: w.minute,
    arrivesAt: w.minute + minutes - 3,
    finishesAt: w.minute + minutes,
  });
  w.protocol.monthVisits.push({
    actorActivityId: actor.id,
    receiverActivityId: receiver.id,
    actor: id,
    other,
    visit,
  });
  const r = resident(w, id);
  r.where = `visit:${other}`;
  r.doing = acceptedOffer.id;
  r.until = w.minute + minutes;
  r.stairsUntil = w.minute + minutes - 3;
  r.stairsFloors = [
    Math.min(RESIDENTS[id].floor, RESIDENTS[other].floor),
    Math.max(RESIDENTS[id].floor, RESIDENTS[other].floor),
  ];
  resident(w, other).until = w.minute + minutes;
  resident(w, other).doing = receive.id;
  sayBuilding(
    w,
    'narrator',
    `${RESIDENTS[id].name} set off for ${RESIDENTS[other].name}’s flat for an agreed handover.`,
    'event',
  );
}

/** Called only by the existing public reply path, on its detached candidate
 * world. Reading the source Run is safe; it receives no reentrant host input. */
export function resolveMonthAction(
  w: BuildingWorld,
  request: DeepReadonly<Extract<HostRequest, { kind: 'action' }>>,
  activity: DeepReadonly<BuildingActivity>,
  engine: BuildingRun<BuildingWorld>,
): ActionReply | undefined {
  const binding = w.protocol.monthVisits.find(
    (b) => b.actorActivityId === activity.id || b.receiverActivityId === activity.id,
  );
  if (!binding) return undefined;
  if (request.stage === 'start') throw Error('A monthly binding cannot precede activity acceptance.');
  const visit = w.month?.visits[binding.visit];
  if (
    !visit ||
    visit.actor !== binding.actor ||
    visit.other !== binding.other ||
    (activity.person !== binding.actor && activity.person !== binding.other)
  )
    throw Error('The monthly activity binding does not match its visit.');
  const minute = Math.floor(request.boundaryAt / HF_MINUTE);
  if (visit.done === undefined) {
    const actor = engine.active.find((a) => a.id === binding.actorActivityId && a.person === binding.actor);
    const receiver = engine.active.find(
      (a) => a.id === binding.receiverActivityId && a.person === binding.other,
    );
    const interrupted = engine.pendingRequests.some(
      (r) =>
        r.kind === 'action' &&
        (r.activityId === binding.actorActivityId || r.activityId === binding.receiverActivityId) &&
        r.stage !== 'finish',
    );
    const parcel = visit.kind === 'parcel' ? w.tasks.find((t) => t.id === visit.task) : undefined;
    const amount = visit.amount ?? 0,
      month = required(w.month);
    const valid =
      request.stage === 'finish' &&
      !interrupted &&
      actor &&
      receiver &&
      actor.start + actor.offer.durationMs === request.boundaryAt &&
      receiver.start + receiver.offer.durationMs === request.boundaryAt &&
      currentBody(engine, binding.actor).state.alive &&
      currentBody(engine, binding.other).state.alive &&
      resident(w, binding.other).where === 'home' &&
      !w.castPauses?.[binding.actor] &&
      !w.castPauses?.[binding.other] &&
      (visit.kind === 'parcel'
        ? parcel && parcel.done === undefined && parcel.custody === visit.actor
        : amount > 0 && month.tarikCash >= amount && month.duesBalance >= amount);
    visit.done = minute;
    visit.outcome = valid ? 'completed' : 'interrupted';
    if (valid && parcel) {
      delete parcel.custody;
      stampBuilding(w, 'safe_parcel');
      sayBuilding(
        w,
        'narrator',
        `${RESIDENTS[visit.actor].name} arrived and handed the sealed parcel to ${RESIDENTS[visit.other].name}. ${minute > parcel.by ? 'It arrived late.' : 'It arrived before the deadline.'}`,
        'event',
      );
    } else if (valid) {
      month.tarikCash -= amount;
      month.duesBalance -= amount;
      month.fundCash += amount;
      let supplierPaid = 0;
      if (month.fundCash >= month.supplierBalance) {
        supplierPaid = month.supplierBalance;
        month.fundCash -= supplierPaid;
        month.supplierBalance = 0;
      }
      month.paymentLedger.push({ at: minute, amount, supplierPaid, remaining: month.duesBalance });
      month.duesPaid = month.duesBalance === 0;
      if (month.repaymentAt === undefined) throw Error('The dues handover has no agreed date.');
      month.repaymentAt = dayStart(Math.floor(month.repaymentAt / 1440) + 8) + 600;
      sayBuilding(
        w,
        'narrator',
        `Tarık arrived at Burak’s table. They recorded a ₺${amount} payment privately.${supplierPaid ? ` Burak transferred ₺${supplierPaid} to the pump supplier and kept the receipt.` : ''} ${month.duesPaid ? 'The agreed dues and the pump balance are paid.' : 'The next weekly payment is still due. The supplier is waiting for the remaining balance.'}`,
        'event',
      );
      if (month.duesPaid) stampBuilding(w, 'kept_dates');
    }
    for (const id of [visit.actor, visit.other]) resident(w, id).until = minute + 1;
  }
  // HF distinguishes a failed finish from an actual interruption request.
  const status =
    visit.outcome === 'completed' ? 'completed' : request.stage === 'finish' ? 'failed' : 'interrupted';
  const evidenceId = `outcome:${request.id}`;
  const observations: PerceptData[] =
    status === 'completed' && visit.kind === 'dues' && required(w.month).duesPaid
      ? [
          {
            id: `dues-cleared:${request.id}`,
            occurredAt: request.boundaryAt,
            channel: 'saw',
            kind: 'dues-payment',
            actorId: 'tarik',
            targetId: 'burak',
            salience: 0.9,
            summary: 'The agreed dues and pump balance are paid.',
            claims: [{ prop: FACTS.dues, value: false, confidence: 1 }],
            norms: [],
            advice: [],
            consequences: [],
            withdrawConsequences: [],
            witnesses: [],
            reports: [],
            provenance: [evidenceId],
          },
        ]
      : [];
  return {
    disposition: status,
    observations: observations.length ? [{ person: activity.person, percepts: observations }] : [],
    outcome: {
      activityId: activity.id,
      offerId: activity.offer.id,
      actionId: activity.offer.actionId,
      ...(activity.offer.target === undefined ? {} : { target: activity.offer.target }),
      start: activity.start,
      end: request.boundaryAt,
      status,
      evidenceId,
      summary: activity.offer.label,
      actual: {
        exposures: [],
        observedProgress: [],
        material:
          status === 'completed' && visit.kind === 'dues' && activity.person === visit.actor ? -0.1 : 0,
      },
      fulfills: status === 'completed' ? activity.offer.fulfills : [],
      advances: [],
    },
  };
}

export function promiseDues(w: BuildingWorld): void {
  const month = w.month;
  if (!month || month.repaymentAt === undefined || month.duesBalance <= 0) return;
  const id = duesId(month.repaymentAt);
  if (currentAgenda(buildingEngine(w), 'tarik').commitments.some((c) => c.id === id)) return;
  applyBuildingEvents(w, [
    {
      kind: 'agenda.requested',
      payload: {
        person: 'tarik',
        request: {
          type: 'commit',
          commitment: {
            id,
            kind: 'promise',
            toId: 'burak',
            label: 'make the agreed weekly building payment privately',
            actions: ['pay-dues'],
            targetId: 'burak',
            from: atMinute(month.repaymentAt),
            until: atMinute(dayStart(Math.floor(month.repaymentAt / 1440) + 1) + 1260),
            importance: 0.35,
            normId: 'keep-promise',
            completion: 'end',
          },
        },
      },
    },
  ]);
}
/** No timer fabricates a completion. This only cancels an unfinished counterpart
 * after a real interruption and publishes the next agreed commitment. */
export function settleMonthVisits(w: BuildingWorld): void {
  if (!w.month) return;
  for (const b of w.protocol.monthVisits) {
    const visit = w.month.visits[b.visit];
    if (visit?.outcome === 'completed' && visit.kind === 'parcel') {
      const task = w.tasks.find((task) => task.id === visit.task);
      if (!task) throw Error('The accepted parcel handover has no task.');
      if (task.done === undefined) completeBuildingTask(w, task, false, required(visit.done));
    }
    if (visit?.outcome !== 'interrupted') continue;
    for (const a of buildingEngine(w).active)
      if (a.id === b.actorActivityId || a.id === b.receiverActivityId)
        interruptBuildingPerson(w, a.person, 'The agreed handover was interrupted.');
  }
  promiseDues(w);
}
export function monthEvents(w: BuildingWorld): void {
  const month = w.month;
  if (!month) return;
  const day = buildingDay(w),
    time = w.minute % 1440;
  if (day === 9 && time >= 960 && time < 1000 && !month.rain.started) {
    month.rain.started = true;
    sayBuilding(
      w,
      'narrator',
      'Heavy rain drums on the shop awning above the front step. The street is slow to cross. People can wait under it or go home; the errands still need doing.',
      'event',
    );
  }
  if (day === 9 && time >= 1000 && !month.rain.ended) {
    month.rain.ended = true;
    sayBuilding(
      w,
      'narrator',
      'The rain eases. Water runs from the awning. The street is passable again.',
      'event',
    );
  }
  settleMonthVisits(w);
  if (!month.pensionReceived && w.minute >= dayStart(12) + 540) {
    month.pensionReceived = true;
    month.tarikCash += 600;
    if (resident(w, 'tarik').where === 'home' && !currentBody(buildingEngine(w), 'tarik').state.asleep)
      sayBuilding(
        w,
        'tarik',
        'My pension has arrived. I put ₺600 aside for the agreed building payments. I will take each weekly payment to Burak privately.',
        'voice',
      );
  }
  if (
    month.invoiceDueAt !== undefined &&
    w.minute > month.invoiceDueAt + 540 &&
    month.supplierBalance > 0 &&
    !month.supplierLate
  ) {
    month.supplierLate = true;
    sayBuilding(
      w,
      'narrator',
      'The supplier’s remaining invoice is overdue. Burak kept the unpaid balance open in the building account. The first instalment did not settle it.',
      'event',
    );
  }
  if (
    month.repaymentAt !== undefined &&
    w.minute > month.repaymentAt + 540 &&
    month.duesBalance > 0 &&
    month.missedPaymentAt !== month.repaymentAt
  ) {
    month.missedPaymentAt = month.repaymentAt;
    sayBuilding(
      w,
      'narrator',
      'Burak left the repayment line open in the private book. The agreed date passed without a payment. The supplier is still waiting for the outstanding balance.',
      'event',
    );
  }
}

/** Cold recovery only. Each host visit must identify the two full offers that
 * HF actually accepted, and either two active receipts or actual terminal
 * outcomes. A plausible host timer or same-id replacement is insufficient. */
export function validateMonthVisits(w: BuildingWorld, engine: BuildingRun<BuildingWorld>): void {
  const visits = w.month?.visits ?? [],
    bindings = w.protocol.monthVisits;
  if (bindings.length !== visits.length)
    throw Error('The monthly notebook has an unbound visit. Keep the file.');
  if (!bindings.length) return;
  const used = new Set<string>(),
    indices = new Set<number>();
  const accepted = (id: string, person: Rid) => {
    const receipt = engine.coldActionReceipt(id, person);
    if (!receipt) throw Error('The monthly notebook has no accepted full departure offer. Keep the file.');
    const { request, offer } = receipt;
    const active = engine.active.find((a) => a.id === id && a.person === person);
    if (
      active &&
      (active.start !== request.boundaryAt ||
        active.offerRevision !== request.offerRevision ||
        canonicalPersona(active.offer) !== canonicalPersona(offer))
    )
      throw Error('The monthly notebook replaced an accepted activity. Keep the file.');
    return {
      offer,
      start: request.boundaryAt,
      active,
      outcome: receipt.outcome,
    };
  };
  for (const binding of bindings) {
    const visit = visits[binding.visit];
    if (
      !visit ||
      indices.has(binding.visit) ||
      used.has(binding.actorActivityId) ||
      used.has(binding.receiverActivityId) ||
      binding.actorActivityId === binding.receiverActivityId ||
      visit.actor !== binding.actor ||
      visit.other !== binding.other ||
      visit.actor === visit.other
    )
      throw Error('The monthly notebook duplicates or changes a visit binding. Keep the file.');
    indices.add(binding.visit);
    used.add(binding.actorActivityId);
    used.add(binding.receiverActivityId);
    const actor = accepted(binding.actorActivityId, binding.actor),
      receiver = accepted(binding.receiverActivityId, binding.other);
    const end = actor.start + actor.offer.durationMs;
    const action = visit.kind === 'parcel' ? 'handover-parcel' : 'pay-dues';
    if (
      actor.offer.id !== (visit.kind === 'parcel' ? `parcel-handover:${visit.task}` : 'dues-payment') ||
      actor.offer.person !== visit.actor ||
      actor.offer.actionId !== action ||
      actor.offer.target !== visit.other ||
      canonicalPersona(actor.offer.participants) !== canonicalPersona([visit.other]) ||
      actor.offer.demands.effort !== 0.35 ||
      actor.offer.demands.mode !== 'awake' ||
      actor.offer.durationMs !== atMinute(visit.finishesAt - visit.startedAt) ||
      Math.floor(actor.start / HF_MINUTE) !== visit.startedAt ||
      Math.floor(end / HF_MINUTE) !== visit.finishesAt ||
      receiver.offer.id !== 'receive-building-handover' ||
      receiver.offer.person !== visit.other ||
      receiver.offer.actionId !== 'help' ||
      receiver.offer.target !== visit.actor ||
      canonicalPersona(receiver.offer.participants) !== canonicalPersona([visit.actor]) ||
      receiver.start + receiver.offer.durationMs !== end ||
      visit.arrivesAt !== visit.finishesAt - 3 ||
      (visit.kind === 'dues' &&
        (visit.actor !== 'tarik' ||
          visit.other !== 'burak' ||
          visit.amount === undefined ||
          visit.amount <= 0 ||
          visit.amount > 200))
    )
      throw Error('The monthly notebook does not match its actual two-person handover. Keep the file.');
    if (visit.done === undefined) {
      if (
        visit.outcome !== undefined ||
        !actor.active ||
        !receiver.active ||
        actor.outcome ||
        receiver.outcome
      )
        throw Error('The monthly notebook lost an unfinished participant. Keep the file.');
    } else {
      if (
        actor.active ||
        receiver.active ||
        !actor.outcome ||
        !receiver.outcome ||
        visit.outcome === undefined
      )
        throw Error('The monthly notebook has no actual terminal receipts. Keep the file.');
      if (visit.outcome === 'completed') {
        if (
          visit.done !== visit.finishesAt ||
          actor.outcome.status !== 'completed' ||
          receiver.outcome.status !== 'completed' ||
          actor.outcome.end !== end ||
          receiver.outcome.end !== end ||
          actor.outcome.actual.material !== (visit.kind === 'dues' ? -0.1 : 0) ||
          receiver.outcome.actual.material !== 0
        )
          throw Error('The monthly notebook invented a completed transfer. Keep the file.');
      } else if (
        actor.outcome.status === 'completed' ||
        receiver.outcome.status === 'completed' ||
        actor.outcome.actual.material !== 0 ||
        receiver.outcome.actual.material !== 0
      )
        throw Error('The monthly notebook paid an interrupted transfer. Keep the file.');
    }
  }
}
