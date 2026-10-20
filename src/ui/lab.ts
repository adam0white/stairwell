import { createLab } from '@adam0white/lab-client';

export const lab = createLab({ game: 'stairwell' });

/** The regular event names are fixed. Only a player-approved export carries the run. */
export function mountLab(getRun: () => unknown): void {
  if (document.getElementById('lab-controls')) return;
  const controls = document.createElement('details');
  controls.id = 'lab-controls';
  controls.style.cssText = 'margin:1rem auto;padding:0.6rem;max-width:45rem;font:inherit';
  controls.innerHTML = `<summary>Playtest notebook</summary><button type="button">Send this run to the notebook</button><label><input type="checkbox"> Anonymous play events</label> <a href="https://human.adamwhite.work/lab/privacy/">Privacy</a>`;
  controls.querySelector('button')?.addEventListener('click', () => lab.openSendDialog({ getRun }));
  const toggle = controls.querySelector('input');
  if (toggle) {
    toggle.checked = lab.eventsOn;
    const sync = () => {
      toggle.checked = lab.eventsOn;
    };
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('change', sync);
    toggle.addEventListener('change', () => {
      lab.setEventsOff(!toggle.checked);
      toggle.checked = lab.eventsOn;
    });
  }
  document.body.append(controls);
}

export function labScreen(screen: 'title' | 'play' | 'ending'): void {
  lab.screen(screen);
  if (screen === 'play') lab.milestone('run started');
  if (screen === 'ending') lab.milestone('ending reached');
}
