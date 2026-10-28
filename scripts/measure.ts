// Headless balance measure: scripted players over many seeds. `npm run measure [-- seeds]`.
import { buildingEngine } from '../src/sim/hf-game.ts';
import { replayBuilding } from '../src/sim/hf-replay.ts';
import { playWeek, type Style } from './policy.ts';

const n = Number(process.argv[2] ?? 6);
const styles: Style[] = ['quiet', 'honest', 'gossip', 'liar'];
console.log('style   money  done late miss treats caught talks votes  secrets  ms/week  replay');
for (const style of styles) {
  const rows: number[][] = [];
  let ms = 0;
  let replayOk = 0;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const s = playWeek(1000 + i * 17, style);
    ms += performance.now() - t0;
    const r = s.reports;
    const sum = (f: (x: (typeof r)[number]) => number) => r.reduce((a, x) => a + f(x), 0);
    rows.push([
      s.k.money,
      sum((x) => x.done),
      sum((x) => x.late),
      sum((x) => x.missed),
      sum((x) => x.treats.length),
      s.residents.reduce((a, x) => a + x.caught.length + x.grudges.length, 0),
      s.talks.length,
      s.meeting?.yes ?? 0,
      Object.keys(s.secrets).length,
    ]);
    if (i === 0) {
      const again = replayBuilding(buildingEngine(s).checkpoint());
      while (again.phase !== 'end' && again.inputs.length < s.inputs.length) break;
      replayOk += again.k.money === s.k.money && again.meeting?.yes === s.meeting?.yes ? 1 : 0;
    }
  }
  const avg = (j: number) => (rows.reduce((a, x) => a + (x[j] ?? 0), 0) / rows.length).toFixed(1).padStart(5);
  console.log(
    `${style.padEnd(7)} ${avg(0)} ${avg(1)} ${avg(2)} ${avg(3)} ${avg(4)} ${avg(5)} ${avg(6)} ${avg(7)} ${avg(8)}  ${(ms / n).toFixed(0).padStart(6)}  ${replayOk ? 'ok' : 'DIFF'}`,
  );
}
