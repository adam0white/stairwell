import { createLab, PRIVACY_URL } from '@adam0white/lab-client';
import { feedbackPersonaControl, feedbackSharePlay } from '@adam0white/lab-kit';
import './lab.css';

export const lab = createLab({ game: 'stairwell' });

interface MenuOptions {
  getRun: () => unknown;
  beforeOpen: () => void;
  onClose?: () => void;
  readNotebook?: () => void;
  title?: () => void;
  speed?: () => number | null;
  setSpeed?: (speed: number | null) => void;
  mornings?: { label: string; action: () => void }[];
  importRun?: (file: File) => void;
  hasRun: boolean;
  continuityPanel?: () => HTMLElement;
  chooseRecording?: (allow: boolean) => Promise<void>;
}

const NAME_KEY = 'hf-lab-feedback-name';
function feedbackRun(getRun: () => unknown): unknown {
  try {
    const run = getRun();
    if (lab.personaRecordingAllowed || !run || typeof run !== 'object') return run;
    const unlinked = { ...run } as Record<string, unknown>;
    delete unlinked.castReceipts;
    for (const key of ['continuity', 'oneCast']) {
      const value = unlinked[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const continuity = { ...value } as Record<string, unknown>;
        delete continuity.recordingFileKey;
        unlinked[key] = continuity;
      }
    }
    return unlinked;
  } catch {
    return undefined;
  }
}
function stored(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string): void {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* Storage failure does not prevent feedback. */
  }
}
function button(label: string, action: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.addEventListener('click', action);
  return el;
}
function privacyLink(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = PRIVACY_URL;
  link.textContent = 'Lab privacy';
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}
function recordingSwitch(changed: () => void = () => {}): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'sw-recording';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.role = 'switch';
  input.checked = lab.telemetryOn;
  const refresh = () => {
    input.checked = lab.telemetryOn;
  };
  window.addEventListener('hf-lab-preference', refresh);
  input.addEventListener('change', () => {
    lab.setTelemetryOff(!input.checked);
    changed();
  });
  queueMicrotask(() =>
    label
      .closest('dialog')
      ?.addEventListener('close', () => window.removeEventListener('hf-lab-preference', refresh), {
        once: true,
      }),
  );
  label.append(input, 'Record play for the lab');
  return label;
}
function dialogShell(kind: 'menu' | 'feedback', title: string): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = `sw-${kind}`;
  dialog.setAttribute('aria-label', title);
  const heading = document.createElement('header');
  heading.className = 'sw-dialog-header';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const close = button('×', () => dialog.close());
  close.setAttribute('aria-label', `Close ${title.toLowerCase()}`);
  heading.append(h2, close);
  dialog.append(heading);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
  return dialog;
}

export function compactRun(run: unknown): unknown {
  const { state: _state, ...replayable } = run as Record<string, unknown>;
  return replayable;
}

/** Keep only the replayable seed, inputs and minute in the playtest download. */
export function downloadRun(run: unknown): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(compactRun(run), null, 2)], {
      type: 'application/json',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'stairwell-playtest.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openFeedback(
  getRun: () => unknown,
  onClose?: () => void,
  _chooseRecording?: (allow: boolean) => Promise<void>,
): HTMLDialogElement {
  const dialog = dialogShell('feedback', 'Send word');
  const form = document.createElement('form');
  form.className = 'sw-feedback-form';
  const body = document.createElement('div');
  body.className = 'sw-feedback-body';
  const lead = document.createElement('p');
  lead.textContent = 'Send a note about this game.';
  const verdicts = document.createElement('fieldset');
  verdicts.className = 'sw-feedback-verdict';
  const legend = document.createElement('legend');
  legend.textContent = 'Would you keep playing? (optional)';
  verdicts.append(legend);
  for (const [value, label] of [
    ['keep', "I'd keep playing"],
    ['mixed', 'Not sure'],
    ['quit', "I'd stop here"],
  ]) {
    const choice = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'verdict';
    radio.value = value ?? '';
    choice.append(radio, label ?? '');
    verdicts.append(choice);
  }
  const noteLabel = document.createElement('label');
  noteLabel.textContent = 'What happened on the stairs, what you wanted, what got in the way.';
  const note = document.createElement('textarea');
  note.rows = 4;
  noteLabel.append(note);
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Your name or tester id (optional)';
  const name = document.createElement('input');
  name.type = 'text';
  name.maxLength = 60;
  name.autocomplete = 'off';
  name.value = stored(NAME_KEY);
  nameLabel.append(name);
  const nameDetails = document.createElement('details');
  const nameSummary = document.createElement('summary');
  nameSummary.textContent = '+ Add a name';
  nameDetails.append(nameSummary, nameLabel);
  const explanation = document.createElement('p');
  explanation.className = 'soft';
  explanation.textContent =
    'A name labels your player id and its linked play history, past and future on this device. It is remembered here. Leave it empty to stay pseudonymous.';
  nameDetails.append(explanation);
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'What is sent';
  const preview = document.createElement('p');
  preview.textContent =
    'Recording on or Share includes an available run and links play across games on this device. Otherwise only your note, verdict and optional name are sent.';
  details.append(summary, preview, privacyLink());
  const preferences = document.createElement('div');
  const status = document.createElement('p');
  status.className = 'sw-feedback-status';
  status.role = 'status';
  const actions = document.createElement('div');
  actions.className = 'sw-dialog-actions';
  const send = document.createElement('button');
  send.type = 'submit';
  send.className = 'primary';
  send.textContent = 'Submit';
  const copy = button('Keep a copy of this run', () => downloadRun(getRun()));
  body.append(lead, verdicts, noteLabel, nameDetails, details, preferences, copy, status);
  actions.append(send);
  form.append(body, actions);
  dialog.append(form);
  let sending = false;
  let queued = false;
  const choice = feedbackPersonaControl(lab);
  if (choice) preferences.append(choice);
  const update = () => {
    send.disabled = !queued && sending;
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (queued) {
      dialog.close();
      return;
    }
    if (send.disabled) return;
    sending = true;
    update();
    const chosen = form.querySelector<HTMLInputElement>('input[name=verdict]:checked');
    const text = [chosen ? `Verdict: ${chosen.value}` : '', note.value.trim()].filter(Boolean).join('\n\n');
    const submittedName = name.value.trim().slice(0, 60);
    try {
      const sharePlay = feedbackSharePlay(choice);
      const noteOnly = !lab.telemetryOn && !sharePlay;
      await lab.sendFeedback(text, {
        name: submittedName,
        run: feedbackRun(getRun),
        sharePlay,
      });
      rememberName(submittedName);
      queued = true;
      status.textContent = !noteOnly
        ? 'Note queued. An available run may also be included. This is not a delivery receipt.'
        : 'Note queued without a run or history linkage. This is not a delivery receipt.';
      send.textContent = 'Back to the game';
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'Your note could not be queued. Please try again.';
    } finally {
      sending = false;
      update();
    }
  });
  const refresh = () => update();
  window.addEventListener('hf-lab-preference', refresh);
  dialog.addEventListener(
    'close',
    () => {
      window.removeEventListener('hf-lab-preference', refresh);
      dialog.remove();
      onClose?.();
    },
    { once: true },
  );
  update();
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

export function gameMenu(options: MenuOptions): HTMLButtonElement {
  const entry = Object.assign(
    button('≡', () => {
      options.beforeOpen();
      const dialog = dialogShell('menu', 'Game menu');
      const body = document.createElement('div');
      body.className = 'sw-menu-body';
      let transfer = false;
      const leave = (action: () => void) => {
        transfer = true;
        dialog.close();
        action();
      };
      const readNotebook = options.readNotebook;
      if (readNotebook) body.append(button('Read the residents’ notebook', () => leave(readNotebook)));
      if (options.setSpeed) {
        const speeds = document.createElement('fieldset');
        speeds.className = 'sw-menu-speeds';
        const legend = document.createElement('legend');
        legend.textContent = 'Clock';
        speeds.append(legend);
        for (const [label, value] of [
          ['Automatic', null],
          ['Slow', 3],
          ['Steady', 6],
          ['Fast', 12],
        ] as const) {
          const choice = button(label, () => {
            options.setSpeed?.(value);
            for (const other of speeds.querySelectorAll('button'))
              other.setAttribute('aria-pressed', String(other === choice));
          });
          choice.setAttribute('aria-pressed', String((options.speed?.() ?? null) === value));
          speeds.append(choice);
        }
        const rates = document.createElement('p');
        rates.textContent = 'Game minutes per real second: Automatic 6 · Slow 3 · Steady 6 · Fast 12.';
        const protection = document.createElement('p');
        protection.textContent =
          'Your choice applies during travel, work and quiet time. While you are idle, open orders slow time to 0.6. Your chosen rate resumes when no orders remain or you start travel or work. Conversation and reading pause time until you close them.';
        speeds.append(rates, protection);
        body.append(speeds);
      }
      const feedback = button('Send word', () =>
        leave(() => openFeedback(options.getRun, () => entry.click(), options.chooseRecording)),
      );
      body.append(feedback);
      const full = button(document.fullscreenElement ? 'Leave full screen' : 'Full screen', () => {
        const result = document.fullscreenElement
          ? document.exitFullscreen()
          : document.documentElement.requestFullscreen?.();
        void result
          ?.then(() => {
            full.textContent = document.fullscreenElement ? 'Leave full screen' : 'Full screen';
          })
          .catch(() => {
            full.textContent = 'Full screen unavailable';
          });
      });
      full.className = 'sw-fullscreen';
      body.append(full);
      const toTitle = options.title;
      if (toTitle) body.append(button('To the title page', () => leave(toTitle)));
      else {
        const title = button('To the title page', () => dialog.close());
        title.disabled = true;
        body.append(title);
      }
      const games = document.createElement('a');
      games.href = 'https://human.adamwhite.work/games/';
      games.textContent = 'All games';
      body.append(games);
      if (options.continuityPanel) body.append(options.continuityPanel());
      const footer = document.createElement('footer');
      footer.className = 'sw-menu-footer';
      footer.append(recordingSwitch(), privacyLink());
      body.append(footer);
      const actions = document.createElement('div');
      actions.className = 'sw-dialog-actions';
      const resume = button('Back to the stairs', () => dialog.close());
      resume.className = 'primary';
      actions.append(resume);
      dialog.append(body, actions);
      dialog.addEventListener(
        'close',
        () => {
          dialog.remove();
          if (!transfer) options.onClose?.();
        },
        { once: true },
      );
      document.body.append(dialog);
      dialog.showModal();
    }),
    { className: 'game-menu', ariaLabel: 'Game menu' },
  );
  return entry;
}

export function labScreen(screen: 'title' | 'play' | 'ending'): void {
  lab.screen(screen);
  if (screen === 'play') lab.milestone('run started');
  if (screen === 'ending') lab.milestone('ending reached');
}
