import { createLab } from '@adam0white/lab-client';
import { notebookMenu } from '@adam0white/lab-kit';

export const lab = createLab({ game: 'stairwell' });

interface MenuOptions {
  getRun: () => unknown;
  beforeOpen: () => void;
  readNotebook?: () => void;
  title?: () => void;
  mornings: { label: string; action: () => void }[];
  importRun: (file: File) => void;
  hasRun: boolean;
  tally: { enabled: boolean; change: (enabled: boolean) => void };
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
    const tallyLabel = document.createElement('label');
    const tally = document.createElement('input');
    tally.type = 'checkbox';
    tally.checked = options.tally.enabled;
    tally.addEventListener('change', () => options.tally.change(tally.checked));
    tallyLabel.append(tally, ' Show Rıza’s week tally after Sunday’s vote');
    dialog.querySelector('h2')?.after(tallyLabel);
    const restore = document.createElement('div');
    if (options.mornings.length > 1) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Turn back to a morning';
      details.append(summary);
      const choices = document.createElement('div');
      choices.className = 'actions';
      for (const morning of options.mornings) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = morning.label;
        button.addEventListener('click', () => {
          dialog.addEventListener('close', morning.action, { once: true });
          dialog.close();
        });
        choices.append(button);
      }
      details.append(choices);
      restore.append(details);
    }
    const label = document.createElement('label');
    label.textContent = 'Replay a notebook file';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      dialog.addEventListener('close', () => options.importRun(file), { once: true });
      dialog.close();
    });
    label.append(input);
    restore.append(label);
    dialog.querySelector('h2')?.after(restore);
    if (!options.hasRun) {
      for (const button of dialog.querySelectorAll('button')) {
        if (
          button.textContent === 'Download this run' ||
          button.textContent === 'Send this run to the notebook'
        )
          button.disabled = true;
      }
      const reason = document.createElement('p');
      reason.textContent = 'Begin or replay a notebook to download or send a run.';
      restore.after(reason);
    }
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
