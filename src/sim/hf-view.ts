/** Player-facing projections of the native building world. */
import { FACTS, INVENTABLE, KAPICI, RESIDENTS, RIDS, type Rid } from './building-cast.ts';
import type { Place, Task } from './building-types.ts';
import { buildingFloor, buildingTravelMinutes } from './hf-game.ts';
import { type BuildingWorld, buildingDay, buildingPeopleTogether } from './hf-world.ts';

export type GameState = BuildingWorld;
export type { Input, NewInput, Place, Said, Task } from './building-types.ts';
export { nameOf } from './building-words.ts';
export { INVENTABLE };
export const GAME_VERSION = 'stairwell@14';
export const MONTH_VERSION = 'stairwell@15';
export const WORK_START_VERSION = 'stairwell@16';
export const DAY_START = 420;
export const DAY_END = 1260;
export const TOP_FLOOR = 4;
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const canReplay = (value: string | undefined): boolean =>
  value === GAME_VERSION || value === MONTH_VERSION || value === WORK_START_VERSION;
export const dayOf = (minute: number) => Math.floor(minute / 1440) + 1;
export const dayStart = (day: number) => (day - 1) * 1440;
export const dayName = (day: number) => {
  const name = DAY_NAMES[(day - 1) % 7];
  if (name === undefined) throw Error('The requested day has no weekday name.');
  return name;
};
export const clockOf = (minute: number) => {
  const t = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
export const dayLabel = (world: BuildingWorld) =>
  `${world.month ? `Week ${Math.ceil(buildingDay(world) / 7)} · ` : ''}${dayName(buildingDay(world))}`;
export const rOf = (world: BuildingWorld, id: Rid) => world.residents.find((resident) => resident.id === id)!;
export const floorOf = buildingFloor;
export const travelMinutes = buildingTravelMinutes;
export function placeName(place: Place): string {
  if (place === 'room') return 'your room';
  if (place === 'step') return 'the front step';
  if (place === 'bakery') return 'the bakery';
  if (place === 'shop') return 'the corner shop';
  if (place === 'roof') return 'the roof';
  if (place.startsWith('door:')) return `flat ${RESIDENTS[place.slice(5) as Rid].flat}`;
  const floor = Number(place.slice(8));
  return floor === 0 ? 'the entrance' : `the floor ${floor} landing`;
}
export const openTasks = (world: BuildingWorld): Task[] =>
  world.tasks.filter((task) => !task.done && task.from <= world.minute);
export const faceToFace = (world: BuildingWorld): Rid[] =>
  world.phase === 'day' && !world.k.walk
    ? RIDS.filter((id) => buildingPeopleTogether(world, KAPICI, id))
    : [];
/** A UI hint; the simulation owns the final admission check. */
export function canStartWork(world: BuildingWorld, job: Task): boolean {
  return (
    world.phase === 'day' &&
    !world.k.walk &&
    world.k.busyTask === null &&
    world.k.busyUntil <= world.minute &&
    world.tasks.includes(job) &&
    job.done === undefined &&
    job.kind === 'job' &&
    !job.pickup &&
    !job.storyFor &&
    !job.custody &&
    !job.carried &&
    !job.wrongDoor &&
    job.place === world.k.at &&
    job.from <= world.minute &&
    Number.isInteger(job.work) &&
    (job.work as number) > 0 &&
    dayOf(job.from) === buildingDay(world)
  );
}
export function binsWarning(world: BuildingWorld, to: Place): string {
  const bins = openTasks(world).find((task) => task.kind === 'bins');
  if (!bins) return '';
  if (!bins.pickup) throw Error('The bins task has no pickup place.');
  const pickup = bins.pickup;
  const arrival =
    world.minute +
    travelMinutes(world, world.k.at, to) +
    (bins.carried
      ? to === 'step'
        ? 0
        : travelMinutes(world, to, 'step')
      : (to === pickup ? 0 : travelMinutes(world, to, pickup)) + travelMinutes(world, pickup, 'step'));
  return arrival > bins.by
    ? 'The truck leaves at 20:45. This route will reach the street after it leaves.'
    : 'The truck leaves at 20:45. Take the bins to the street before then.';
}
export const SECRET_PROPS: { prop: string; value: boolean; title: string }[] = [
  { prop: 'hacer:nosy', value: true, title: 'Ms Hacer sees everyone who passes the door.' },
  { prop: 'tarik:kind', value: true, title: 'Mr Tarık would give you his last lemon candy.' },
  { prop: FACTS.ring, value: true, title: 'A parcel of paper-making supplies came for Burak.' },
  { prop: FACTS.fund, value: true, title: 'The boiler fund has too little money.' },
  { prop: FACTS.dues, value: true, title: 'Mr Tarık is late with his building payments.' },
  { prop: FACTS.visitor, value: true, title: 'A man comes to Derya’s door late at night.' },
  { prop: 'derya:brother', value: true, title: 'The man is Derya’s brother.' },
];

export { legsLine, readOf, tellables, wordHint } from '../ui/native-reads.ts';
