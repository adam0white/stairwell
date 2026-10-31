/** Retained order buttons. This is the production directory consumer. */
import { RESIDENTS, type Rid } from '../sim/building-cast.ts';
import {
  clockOf,
  type GameState,
  nameOf,
  openTasks,
  type Place,
  placeName,
  type Task,
} from '../sim/hf-view.ts';
import { projectedBins as binsWarning, projectedTravel as travelMinutes } from './native-reads.ts';
import { parcelStatus } from './plain-guidance.ts';

const esc = (x: string) => x.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
function requiredUiValue<T>(value: T | null | undefined, context: string): T {
  if (value === null || value === undefined) throw new Error(`Missing Stairwell UI ${context}`);
  return value;
}
export type TripSelection = { to: Place; person: Rid | null; task: number | null } | null;
export function orderRows(
  s: GameState,
  items: HTMLElement,
  selection: TripSelection,
  choose: (s: GameState, to: Place, person: Rid | null, task: number) => void,
  getWorld: () => GameState | null,
) {
  // Keep existing rows in place. Requests that arrive while reading append below.
  const open = openTasks(s).sort((a, b) => Number(!!b.carried) - Number(!!a.carried) || a.by - b.by);
  for (const task of open) {
    let button = items.querySelector<HTMLButtonElement>(`[data-t="${task.id}"]`);
    const fresh = document.createElement('div');
    fresh.innerHTML = taskLine(
      s,
      task,
      task.id === (selection ? selection.task : open.find((t) => !t.wrongDoor && !t.custody)?.id),
    );
    const next = fresh.firstElementChild as HTMLButtonElement;
    if (!button) {
      button = next;
      const retained = button;
      button.addEventListener('click', () => {
        const world = getWorld();
        if (!world || retained.disabled) return;
        const current = openTasks(world).find((entry) => entry.id === task.id);
        if (!current || current.done !== undefined || current.wrongDoor || current.custody) return;
        choose(world, current.carried || !current.pickup ? current.place : current.pickup, null, current.id);
      });
      items.append(button);
    } else {
      button.className = next.className;
      button.disabled = next.disabled;
      button.setAttribute('aria-pressed', next.getAttribute('aria-pressed') ?? 'false');
      if (button.innerHTML !== next.innerHTML) button.innerHTML = next.innerHTML;
    }
  }
  for (const button of items.querySelectorAll<HTMLButtonElement>('[data-t]')) {
    if (open.some((task) => task.id === Number(button.dataset.t))) continue;
    button.disabled = true;
    button.classList.remove('current');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${button.textContent} · delivered`);
  }
  if (!items.children.length) items.textContent = 'There are no orders on the board.';
}

function taskLine(s: GameState, t: Task, current: boolean): string {
  const late = s.minute > t.by;
  const who = t.kind === 'bins' ? 'Bins' : RESIDENTS[t.for].name;
  const where = t.carried
    ? `to ${placeName(t.place)}`
    : t.pickup
      ? `from ${placeName(t.pickup)}`
      : `at ${placeName(t.place)}`;
  const parcel = parcelStatus(t);
  const left = parcel.kind === 'left';
  const unavailable = left || !!t.custody || !!s.k.walk || s.k.busyTask !== null || s.k.busyUntil > s.minute;
  current = current && !left && !t.custody;
  const what = t.kind === 'bins' ? 'down from the fourth floor' : t.label;
  const when = t.kind === 'bins' ? 'by 20:45' : `by ${clockOf(t.by)}`;
  if (left)
    return `<button class="task left" data-t="${t.id}" aria-pressed="false" disabled>
    <span class="t">${esc(who)}</span> <span>${esc(what)}</span>
    <span class="hand soft">${esc(parcel.text)}. Nothing to collect from your room. By ${clockOf(t.by)}</span></button>`;
  return `<button class="task${current ? ' current' : ''}${late ? ' late' : ''}${t.carried ? ' carried' : ''}" data-t="${t.id}" aria-pressed="${current}"${unavailable ? ' disabled' : ''}>
    <span class="t">${t.carried ? '◼ ' : ''}${esc(who)}</span> <span>${esc(what)}</span>
    <span class="hand soft">${t.custody ? `safe with ${esc(nameOf(t.custody))}; waiting for both residents to be home` : where}, ${when}${late ? ' · late' : ''} · ${travelMinutes(s, s.k.at, t.carried || !t.pickup ? t.place : t.pickup)}${!t.carried && t.pickup ? ` + ${travelMinutes(s, t.pickup, t.place)}` : ''} min${t.kind === 'bins' ? ` · ${esc(binsWarning(s, t.carried ? 'step' : requiredUiValue(t.pickup, 'bins pickup')))}` : ''}</span></button>`;
}
