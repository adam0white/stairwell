import { createLab } from '@adam0white/lab-client';
import { notebookMenu } from '@adam0white/lab-kit';

export const lab = createLab({ game: 'stairwell' });

interface MenuOptions {
  getRun: () => unknown;
  beforeOpen: () => void;
  readNotebook?: () => void;
  title?: () => void;
}

export function compactRun(run: unknown): unknown {
  const { state: _state, ...replayable } = run as Record<string, unknown>;
  return replayable;
}

/** Keep run controls in the kit menu; the residents' notebook is a separate inspection. */
export function gameMenu(options: MenuOptions): HTMLButtonElement {
  const entry = notebookMenu({
    lab,
    getRun: options.getRun,
    filename: 'stairwell-playtest.json',
    compact: compactRun,
    compactNote: 'Seed, inputs and minute reproduce the full state. The state summary is left out.',
  });
  entry.className = 'game-menu';
  entry.addEventListener('click', options.beforeOpen, { capture: true });
  // The kit owns its native dialog. Add the game's inspection and title destinations after it opens.
  entry.addEventListener('click', () => {
    const dialog = document.querySelector<HTMLDialogElement>('dialog.lk-notebook[open]');
    if (!dialog) return;
    const add = (label: string, action: (() => void) | undefined) => {
      if (!action) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        dialog.addEventListener('close', action, { once: true });
        dialog.close();
      });
      dialog.querySelector('h2')?.after(button);
    };
    add('Title page', options.title);
    add('Read the residents’ notebook', options.readNotebook);
  });
  return entry;
}

export function labScreen(screen: 'title' | 'play' | 'ending'): void {
  lab.screen(screen);
  if (screen === 'play') lab.milestone('run started');
  if (screen === 'ending') lab.milestone('ending reached');
}
