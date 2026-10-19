/**
 * Runs HF-character playtesters on The Stairwell, mirroring the playtester's examples/cohort.ts 'run' and 'session'.
 *
 *   node scripts/hf-playtest/run.ts run [seeds=3] [personas=all|base|edge|<id,id>] [minutes=<cap>] [out=<file.json>]
 *   node scripts/hf-playtest/run.ts session [persona=commuter] [seed=1]
 *
 * Needs the human-framework checkout at /Users/abdul/code/human-framework with packages/human built.
 */
import { writeFileSync } from 'node:fs';
import {
  BASE_PERSONAS,
  EDGE_PERSONAS,
  PERSONAS,
  playSession,
  readSession,
  runCohort,
} from '/Users/abdul/code/human-framework/packages/playtester/src/index.ts';
import { make } from './adapter.ts';

const [cmd, ...rest] = process.argv.slice(2);
const arg = (k, d) => rest.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? d;

function personasOf(spec) {
  const ids =
    spec === 'all'
      ? Object.keys(PERSONAS)
      : spec === 'base'
        ? [...BASE_PERSONAS]
        : spec === 'edge'
          ? [...EDGE_PERSONAS]
          : spec.split(',');
  return ids.map((id) => {
    const p = PERSONAS[id];
    if (!p) throw new Error(`no persona ${id}`);
    return p;
  });
}

if (cmd === 'run') {
  const seeds = Array.from({ length: Number(arg('seeds', '3')) }, (_, i) => i + 1);
  const name = make(0).name;
  const minutes = arg('minutes');
  const { summary } = runCohort({
    game: name,
    build: arg('build', name),
    make,
    personas: personasOf(arg('personas', 'all')),
    seeds,
    ...(minutes ? { maxMinutes: Number(minutes) } : {}),
  });
  console.log(`${summary.game} ${summary.build}, seeds ${seeds.join(',')}`);
  for (const p of summary.personas) {
    const ret = p.returned ? `, came back ${p.returned.evenings}/${p.returned.possible}` : '';
    console.log(
      `  ${p.persona.padEnd(13)} ${String(p.minutes.mean).padStart(5)} min, ended ${JSON.stringify(p.ended)}, ` +
        `outcomes ${JSON.stringify(p.outcomes)}, bored ${p.boredSessions}/${p.sessions}, frustrated ` +
        `${p.frustratedSessions}/${p.sessions}, rewards ${p.rewardsPerSession}${p.provokedPerSession !== undefined ? ` (rose to ${p.provokedPerSession})` : ''}, quit at ${JSON.stringify(p.quitAt)}${ret}`,
    );
  }
  console.log(`  bored at ${JSON.stringify(summary.boredAt)}`);
  console.log(`  frustrated by ${JSON.stringify(Object.keys(summary.frustratedBy).slice(0, 3))}`);
  for (const e of summary.edges)
    console.log(`  edge ${e.kind} ${e.subject} [${e.label}]: ${e.reason} (${e.detail})`);
  const out = arg('out');
  if (out) writeFileSync(out, `${JSON.stringify(summary, null, 1)}\n`);
} else if (cmd === 'session') {
  const persona = personasOf(arg('persona', 'commuter'))[0];
  const seed = Number(arg('seed', '1'));
  const trace = playSession(make(seed), persona, seed);
  const r = readSession(trace);
  console.log(`${persona.id}: ${r.ended.reason} after ${r.minutes} min at ${r.ended.clock} (${r.ended.why})`);
  for (const m of trace.moments.filter((x) => x.kind !== 'rewarded').slice(0, 12))
    console.log(
      `  ${Math.floor(m.t / 60)}:${String(m.t % 60).padStart(2, '0')} ${m.clock} ${m.kind}: ${m.text}`,
    );
  console.log(`  rewarded ${r.rewarded.length}x; final ${JSON.stringify(trace.final)}`);
} else {
  console.log('usage: run.ts run|session (see the file header)');
}
