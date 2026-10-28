import { createLab, FEEDBACK_LABELS, type FeedbackLabel, PRIVACY_URL } from '@adam0white/lab-client';
import { feedbackPersonaControl, feedbackSharePlay } from '@adam0white/lab-kit';
import './lab.css';

import { fileMode } from './session-route.ts';

export { fileMode } from './session-route.ts';
export const lab = createLab({ game: 'stairwell' });

interface MenuOptions {
  getRun: () => unknown;
  beforeOpen: () => void;
  beforeClose?: () => void;
  onClose?: () => void;
  readNotebook?: () => void;
  title?: () => void;
  newGame?: () => void;
  speed?: () => number | null;
  setSpeed?: (speed: number | null) => void;
  mornings?: { label: string; action: () => void }[];
  importRun?: (file: File) => void;
  hasRun: boolean;
  chooseFile?: () => void;
  chooseRecording?: (allow: boolean) => Promise<void>;
}

const NAME_KEY = 'hf-lab-feedback-name';
/** SDK0.5.2 owns the single Recording gate. A complete replay archive cannot
 * be partially redacted while retaining its verification contract. */
function feedbackRun(getRun: () => unknown): unknown {
  try {
    return getRun();
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
  label.append(input, 'Recording');
  return label;
}
function dialogShell(kind: 'menu' | 'feedback', title: string, requestClose?: () => void): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = `sw-${kind}`;
  dialog.setAttribute('aria-label', title);
  const heading = document.createElement('header');
  heading.className = 'sw-dialog-header';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const closeDialog = requestClose ?? (() => dialog.close());
  const close = button('×', closeDialog);
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
        closeDialog();
    }
  });
  if (requestClose)
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDialog();
    });
  return dialog;
}

export function compactRun(run: unknown): unknown {
  if (
    ['stairwell-file/4', 'stairwell-notebook/4', 'stairwell-file-session/1'].includes(
      (run as { format?: string } | undefined)?.format ?? '',
    )
  )
    return run;
  const { state: _state, ...replayable } = run as Record<string, unknown>;
  return replayable;
}

function downloadJson(text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], {
      type: 'application/json',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'stairwell-playtest.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Native downloads keep the complete compact encoding measured by the file codec. */
let runDownload: ((getRun: () => unknown) => Promise<void>) | undefined;
export function setRunDownload(download: (getRun: () => unknown) => Promise<void>) {
  runDownload = download;
}
function requestRunDownload(getRun: () => unknown) {
  if (runDownload) {
    void runDownload(getRun);
    return;
  }
  downloadRun(getRun());
}
export function downloadRun(run: unknown): void {
  downloadJson(JSON.stringify(compactRun(run)));
}

/** Unopened records bypass legacy compaction. Refuse any value JSON would change
 * or omit, rather than describe a lossy serialization as a recovery copy. */
export function downloadRawRun(value: unknown): void {
  const ancestors = new Set<object>();
  function invalid(): never {
    throw new Error('This saved record cannot be represented unchanged as JSON.');
  }
  const check = (part: unknown): void => {
    if (part === null || typeof part === 'string' || typeof part === 'boolean') return;
    if (typeof part === 'number') {
      if (!Number.isFinite(part) || Object.is(part, -0)) invalid();
      return;
    }
    if (typeof part !== 'object') invalid();
    const array = Array.isArray(part);
    const prototype = Object.getPrototypeOf(part);
    if (
      (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) ||
      ancestors.has(part)
    )
      invalid();
    ancestors.add(part);
    const keys = Reflect.ownKeys(part);
    if (array && keys.length !== part.length + 1) invalid();
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string') invalid();
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= part.length)) invalid();
      const descriptor = Object.getOwnPropertyDescriptor(part, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
      check(descriptor.value);
    }
    ancestors.delete(part);
  };
  check(value);
  const text = JSON.stringify(value);
  if (text === undefined) invalid();
  downloadJson(text);
}

export function openFeedback(
  getRun: () => unknown,
  onClose?: () => void,
  _chooseRecording?: (allow: boolean) => Promise<void>,
): HTMLDialogElement {
  const dialog = dialogShell('feedback', 'Feedback');
  const form = document.createElement('form');
  form.className = 'sw-feedback-form';
  const body = document.createElement('div');
  body.className = 'sw-feedback-body';
  const lead = document.createElement('p');
  lead.textContent = 'Send a note about this game.';
  const labels = document.createElement('div');
  labels.className = 'row';
  labels.setAttribute('aria-label', 'What is happening?');
  let feedbackLabel: FeedbackLabel | undefined;
  for (const key of Object.keys(FEEDBACK_LABELS) as FeedbackLabel[]) {
    const label = document.createElement('button');
    label.type = 'button';
    label.textContent = FEEDBACK_LABELS[key];
    label.setAttribute('aria-pressed', 'false');
    label.addEventListener('click', () => {
      if (sending || sent) return;
      feedbackLabel = feedbackLabel === key ? undefined : key;
      for (const node of labels.querySelectorAll('button'))
        node.setAttribute('aria-pressed', String(node === label && feedbackLabel === key));
    });
    labels.append(label);
  }
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
  noteLabel.textContent = 'What happened? What did you want to do?';
  const note = document.createElement('textarea');
  note.rows = 4;
  noteLabel.append(note);
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Your name or tester ID (optional)';
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
    'Your name is saved on this device. It labels your player ID and the past and future play history linked to that ID. Leave it empty to use only your player ID.';
  nameDetails.append(explanation);
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'What is sent';
  const preview = document.createElement('p');
  preview.textContent =
    'If Recording is on or you choose Share, your feedback includes the last complete saved game when one is available. It may be earlier than the current screen. It also links your play history across games on this device. Otherwise, only your note, answer and optional name are sent.';
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
  const copy = button('Keep a copy of this run', () => requestRunDownload(getRun));
  try {
    copy.disabled = !getRun();
  } catch {
    copy.disabled = true;
  }
  body.append(lead, labels, verdicts, noteLabel, nameDetails, details, preferences, copy, status);
  actions.append(send);
  form.append(body, actions);
  dialog.append(form);
  let sending = false;
  let sent = false;
  const choice = feedbackPersonaControl(lab);
  if (choice) preferences.append(choice);
  const update = () => {
    send.disabled = !sent && sending;
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sent) {
      dialog.close();
      return;
    }
    if (send.disabled) return;
    sending = true;
    update();
    const chosen = form.querySelector<HTMLInputElement>('input[name=verdict]:checked');
    const text = [
      feedbackLabel ? FEEDBACK_LABELS[feedbackLabel] : '',
      chosen ? `Verdict: ${chosen.value}` : '',
      note.value.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
    const submittedName = name.value.trim().slice(0, 60);
    try {
      const sharePlay = feedbackSharePlay(choice);
      const receipt = await lab.sendFeedback(text, {
        name: submittedName,
        run: feedbackRun(getRun),
        sharePlay,
      });
      rememberName(submittedName);
      sent = true;
      status.textContent = `Sent. Your note is stored. Reference ${receipt}.`;
      send.textContent = 'Back to the game';
    } catch (error) {
      console.error('Feedback failed', error);
      status.textContent = 'Your note could not be sent. Please try again.';
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
      let closeRequested = false;
      const requestClose = (): void => {
        if (closeRequested) return;
        closeRequested = true;
        options.beforeClose?.();
        dialog.close();
      };
      const dialog = dialogShell('menu', 'Game menu', options.beforeClose ? requestClose : undefined);
      const body = document.createElement('div');
      body.className = 'sw-menu-body';
      let transfer = false;
      const leave = (action: () => void) => {
        if (closeRequested) return;
        transfer = true;
        requestClose();
        action();
      };
      const feedback = button('Feedback', () =>
        leave(() => openFeedback(options.getRun, () => entry.click(), options.chooseRecording)),
      );
      body.append(feedback);
      if (fileMode === 'file') {
        const explanation = document.createElement('p');
        explanation.textContent =
          'Progress stays in this page. Download this run before closing the page. Reload returns to the file chooser.';
        body.append(explanation);
        if (options.hasRun)
          body.append(button('Download this run', () => requestRunDownload(options.getRun)));
        if (options.chooseFile) {
          const chooseFile = options.chooseFile;
          body.append(button('Choose another file', () => leave(chooseFile)));
        }
      }
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
      if (fileMode !== 'file' && options.hasRun)
        body.append(button('Download this run', () => requestRunDownload(options.getRun)));
      body.append(full);
      if (fileMode !== 'file' && options.newGame) {
        const confirm = document.createElement('div');
        confirm.hidden = true;
        confirm.textContent = 'Replace the saved notebook and begin on Monday?';
        confirm.append(
          button('Yes, begin', () => {
            const newGame = options.newGame;
            if (!newGame) throw new Error('Missing Stairwell menu new game action');
            leave(newGame);
          }),
          button('Cancel', () => {
            confirm.hidden = true;
          }),
        );
        body.append(
          button('New game', () => {
            confirm.hidden = false;
          }),
          confirm,
        );
      }
      if (options.title)
        body.append(
          button('To the title page', () => {
            const title = options.title;
            if (!title) throw new Error('Missing Stairwell menu title action');
            leave(title);
          }),
        );
      const games = document.createElement('a');
      games.href = 'https://human.adamwhite.work/games/';
      games.textContent = 'All games';
      body.append(games);
      const footer = document.createElement('footer');
      footer.className = 'sw-menu-footer';
      const debug = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Debug';
      debug.append(summary);
      const diagnostic = document.createElement('p');
      diagnostic.textContent = JSON.stringify(lab.build());
      debug.append(diagnostic);
      const links = document.createElement('div');
      links.className = 'sw-menu-links';
      links.append(privacyLink(), debug);
      footer.append(recordingSwitch(), links);
      body.append(footer);
      const actions = document.createElement('div');
      actions.className = 'sw-dialog-actions';
      const resume = button('Resume', requestClose);
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
