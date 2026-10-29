import { advanceBuildingMinute as step } from '../sim/hf-game.ts';
import { faceToFace, type GameState, openTasks } from '../sim/hf-view.ts';

/** UI time only. Travel is brisk; decisions and reading keep their time. */
export function playback(
  state: GameState,
  talking: boolean,
  inspecting: boolean,
  selectedSpeed: number | null = null,
): { rate: number; reason: string } {
  if (state.month && (inspecting || talking))
    return {
      rate: 0.6,
      reason: inspecting ? 'You are reading. Time moves slowly.' : 'You are talking. Time moves slowly.',
    };
  if (inspecting) return { rate: 0, reason: 'You are reading. Time is paused.' };
  if (talking) return { rate: 0, reason: 'You are talking. Time is paused.' };
  if (state.k.walk || state.k.busyUntil > state.minute)
    return { rate: selectedSpeed ?? 6, reason: 'You are travelling or working.' };
  if (
    openTasks(state).some(
      (task) =>
        task.kind === 'parcel' &&
        task.carried &&
        task.place === state.k.at &&
        state.residents.find((person) => person.id === task.for)?.where !== 'home',
    )
  )
    return {
      rate: selectedSpeed ?? 6,
      reason: 'You are waiting with a parcel. Time follows your chosen speed.',
    };
  if (openTasks(state).length > 0) return { rate: 0.6, reason: 'Orders are waiting.' };
  return { rate: selectedSpeed ?? 6, reason: 'Time is passing.' };
}

export function canWait(state: GameState, talking: boolean, inspecting: boolean): boolean {
  return (
    state.phase === 'day' &&
    !talking &&
    !inspecting &&
    !state.k.walk &&
    state.k.busyUntil <= state.minute &&
    openTasks(state).length === 0
  );
}

/** Stop on the first new line, order, or person. Never step over the event. */
export function untilSomethingHappens(state: GameState): number {
  const line = state.lineNo;
  const tasks = openTasks(state)
    .map((task) => task.id)
    .join(',');
  const faces = faceToFace(state).join(',');
  const start = state.minute;
  while (state.phase === 'day' && state.minute - start < 840) {
    step(state);
    if (
      state.lineNo !== line ||
      openTasks(state)
        .map((task) => task.id)
        .join(',') !== tasks ||
      faceToFace(state).join(',') !== faces
    )
      break;
  }
  return state.minute - start;
}
