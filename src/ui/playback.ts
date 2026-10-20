import { dayOf, type GameState, openTasks } from '../sim/game.ts';

/** Change wall-clock playback only; every simulation step remains one minute. */
export function playback(
  state: GameState,
  chosenRate: number,
  talking: boolean,
  inspecting: boolean,
): { rate: number; reason: string } {
  if (
    dayOf(state.minute) === 1 &&
    openTasks(state).some((task) => task.kind === 'bread' && state.minute <= task.by)
  )
    return { rate: Math.min(chosenRate, 0.3), reason: 'First bread run' };
  if (talking) return { rate: Math.min(chosenRate, 0.6), reason: 'Conversation' };
  if (inspecting) return { rate: Math.min(chosenRate, 0.6), reason: 'Reading' };
  return { rate: chosenRate, reason: '' };
}
