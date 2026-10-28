/** The existing resident timetable and available places are building fiction.
 * HF selects every offered activity and owns its completion and bodily cost. */
import type { Offer } from '@adam0white/human-framework';
import { RESIDENTS, type Rid } from './building-cast.ts';
import type { RState, Where } from './building-types.ts';
import { buildingOffer } from './hf-authoring.ts';
import { buildingEngine, buildingFreeOffers, chooseBuilding } from './hf-game.ts';
import { startMonthVisit } from './hf-month.ts';
import { HF_MINUTE } from './hf-run.ts';
import { type BuildingWorld, buildingDay, sayBuilding } from './hf-world.ts';

export type BuildingEncounter = { a: Rid; b: Rid; where: string; maxClaims?: number };
const weekday = (world: BuildingWorld) =>
  world.month ? ((buildingDay(world) - 1) % 7) + 1 : buildingDay(world);
const floor = (where: Where, id: Rid): number =>
  where === 'roof'
    ? 5
    : where.startsWith('visit:')
      ? RESIDENTS[where.slice(6) as Rid].floor
      : where === 'home' || where === 'asleep'
        ? RESIDENTS[id].floor
        : 0;
function moveResident(
  world: BuildingWorld,
  resident: RState,
  where: Where,
  doing: string,
  until: number,
): BuildingEncounter[] {
  const from = floor(resident.where, resident.id),
    to = floor(where, resident.id);
  const wasStep = resident.where === 'step',
    wasVisit = resident.where === where;
  const encounters: BuildingEncounter[] = [];
  resident.where = where;
  resident.doing = doing;
  resident.until = until;
  if (from !== to) {
    resident.stairsUntil = world.minute + Math.max(1, Math.abs(to - from));
    resident.stairsFloors = [Math.min(from, to), Math.max(from, to)];
    for (const other of world.residents) {
      if (other.id === resident.id || other.stairsUntil < world.minute) continue;
      const [a, b] = resident.stairsFloors,
        [c, d] = other.stairsFloors;
      if (b < c || d < a) continue;
      encounters.push({ a: resident.id, b: other.id, where: 'the stairs', maxClaims: 1 });
    }
  }
  if (where === 'step' && !wasStep)
    for (const other of world.residents)
      if (other.id !== resident.id && other.where === 'step')
        encounters.push({ a: resident.id, b: other.id, where: 'step' });
  if (where.startsWith('visit:') && !wasVisit) {
    const host = where.slice(6) as Rid;
    encounters.push({ a: resident.id, b: host, where: `flat ${RESIDENTS[host].flat}` });
  }
  return encounters;
}
function chooseResident(
  world: BuildingWorld,
  resident: RState,
  offers: readonly Offer[],
  reason: string,
): Offer | undefined {
  if (buildingEngine(world).active.some((activity) => activity.person === resident.id))
    throw Error('The resident’s accepted activity has not ended. Keep the source notebook.');
  const decision = chooseBuilding(world, resident.id, offers, reason);
  const chosen = offers.find((offer) => offer.id === decision.chosenAffordanceId);
  if (!chosen) {
    resident.until = world.minute + 1;
    return undefined;
  }
  const active = buildingEngine(world).active.find((activity) => activity.person === resident.id);
  if (!active || active.offer.id !== chosen.id)
    throw Error('The building has no accepted resident activity for this decision.');
  resident.until = Math.ceil((active.start + active.offer.durationMs - world.protocol.phase) / HF_MINUTE);
  return chosen;
}
/** Called inside the enclosing world transaction. The caller delivers returned
 * encounters before choosing for the next resident, preserving causal order. */
export function decideResidentBuilding(world: BuildingWorld, id: Rid): BuildingEncounter[] {
  const resident = world.residents.find((resident) => resident.id === id);
  if (!resident || world.minute < resident.until) return [];
  if (
    world.month?.visits.some(
      (visit) => visit.done === undefined && (visit.actor === id || visit.other === id),
    )
  )
    return [];
  const time = world.minute % 1440,
    info = RESIDENTS[id];
  const scheduled = (where: Where, offer: Offer, reason: string) => {
    const chosen = chooseResident(world, resident, [offer], reason);
    return chosen ? moveResident(world, resident, where, chosen.id, resident.until) : [];
  };
  if (info.work && weekday(world) <= 5 && time >= info.work[0] - 1 && time < info.work[1])
    return scheduled(
      'work',
      buildingOffer(id, 'work', 'work', info.work[1] - time),
      'The resident starts the authored work timetable.',
    );
  if (info.nights) {
    if (resident.where === 'work' && time < 720) {
      const encounters = scheduled(
        'asleep',
        buildingOffer(id, 'derya-day-sleep', 'sleep', 930 - time, {
          label: 'Sleep after the night shift',
          demands: { effort: 0.05, focus: 0, mode: 'sleep', requires: {} },
          expected: { needs: { sleep: 0.8, rest: 0.5 }, followedBy: [], provenance: [] },
        }),
        'Derya has completed her night shift and needs her scheduled sleep.',
      );
      if (
        buildingEngine(world).active.some(
          (activity) => activity.person === id && activity.offer.id === 'derya-day-sleep',
        )
      )
        sayBuilding(world, 'narrator', 'Derya came in from her night shift and went straight up.', 'journal');
      return encounters;
    }
    if (time < 900)
      return scheduled(
        'asleep',
        buildingOffer(id, 'derya-day-sleep', 'sleep', 900 - time, {
          demands: { effort: 0.05, focus: 0, mode: 'sleep', requires: {} },
          expected: { needs: { sleep: 0.8, rest: 0.5 }, followedBy: [], provenance: [] },
        }),
        'Derya returns to her scheduled daytime sleep.',
      );
    if (weekday(world) <= 5 && time >= 1170)
      return scheduled(
        'work',
        buildingOffer(id, 'derya-night-work', 'work', 1440 + 480 - time, {
          label: 'Complete the night rota',
          demands: { effort: 0.05, focus: 0, mode: 'awake', requires: {} },
        }),
        'Derya starts the authored night rota.',
      );
  }
  if (time >= 1230) return moveResident(world, resident, 'home', 'home', world.minute + 60);
  const hosting = world.residents.some((other) => other.where === `visit:${id}`);
  const offers = buildingFreeOffers(world, id).filter(
    (offer) => !hosting || offer.id === 'home' || offer.id === 'meal',
  );
  const chosen = chooseResident(
    world,
    resident,
    offers,
    'The resident chooses their own available free time.',
  );
  if (!chosen) return [];
  if (world.month && (chosen.id.startsWith('parcel-handover:') || chosen.id === 'dues-payment')) {
    startMonthVisit(world, id, chosen);
    return [];
  }
  const where: Where =
    chosen.id === 'home' || chosen.id === 'meal' || chosen.id.startsWith('calendar:')
      ? 'home'
      : chosen.id === 'shelter' || chosen.id === 'step'
        ? 'step'
        : chosen.id === 'shop'
          ? 'shop'
          : chosen.id === 'roof'
            ? 'roof'
            : chosen.id.startsWith('visit:')
              ? (chosen.id as Where)
              : resident.where;
  const encounters = moveResident(world, resident, where, chosen.id, resident.until);
  if (chosen.id === 'shelter')
    sayBuilding(world, 'narrator', `${RESIDENTS[id].name} chose to wait under the awning.`, 'event');
  return encounters;
}
