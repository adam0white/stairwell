import { faceToFace, type GameState, openTasks, step } from '../sim/game.ts';

/** UI time only. Travel is brisk; decisions and reading keep their time. */
export function playback(
  state: GameState,
  talking: boolean,
  inspecting: boolean,
): { rate: number; reason: string } {
  if (inspecting) return { rate: 0, reason: 'Reading · time waits' };
  if (talking) return { rate: 0, reason: 'Conversation · time waits' };
  if (state.k.walk || state.k.busyUntil > state.minute) return { rate: 6, reason: 'On the way' };
  if (openTasks(state).length > 0) return { rate: 0.6, reason: 'Orders need you' };
  return { rate: 6, reason: 'The building carries on' };
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
