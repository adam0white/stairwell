/** One public HF Run and its transactional world replies. This is the building's
 * protocol boundary, not a Person/faculty compatibility layer. Host consequences
 * are staged until HF accepts the complete reply batch. Actor reads stay in HF.
 */

import {
  type ActionResolution,
  type CommunicationResolution,
  createPerson,
  createRun,
  type DeepReadonly,
  exportRun,
  type HostRequest,
  type Input,
  type InspectQuery,
  inspect,
  type Json,
  type Offer,
  type PersonAuthoring,
  type PreviewQuery,
  preview,
  type Result,
  type Run,
  type RunArchive,
  type RunSpec,
  restoreRun,
  type StepResult,
  step,
} from '@adam0white/human-framework';
import { canonicalPersona } from '@adam0white/lab-client';
import { ColdActionReceipts } from './hf-cold-receipts.ts';

export const HF_MINUTE = 60_000;
export const atMinute = (minute: number): number => {
  const at = minute * HF_MINUTE;
  if (!Number.isSafeInteger(at)) throw new Error('The game time cannot be represented exactly.');
  return at;
};
export function admitted<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code} ${result.error.path}: ${result.error.message}`);
  return result.value;
}
export type BuildingActivity = {
  id: string;
  person: string;
  offer: Offer;
  offerRevision: number;
  start: number;
};
export type BuildingLedger = { format: 'stairwell-hf-world/1'; receipts: number; active: BuildingActivity[] };
export type ActionReply = Pick<ActionResolution, 'disposition' | 'observations' | 'outcome'>;
export type CommunicationReply = Pick<CommunicationResolution, 'emittedItemIds' | 'received'>;
export interface BuildingResolver<W> {
  action(
    world: W,
    request: DeepReadonly<Extract<HostRequest, { kind: 'action' }>>,
    activity: DeepReadonly<BuildingActivity>,
  ): ActionReply;
  communication(
    world: W,
    request: DeepReadonly<Extract<HostRequest, { kind: 'communication' }>>,
  ): CommunicationReply;
}
export type BuildingCheckpoint<W> = {
  format: 'stairwell-engine/1';
  world: W;
  archive: DeepReadonly<RunArchive>;
};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const json = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;
const key = (person: string, revision: number) => `${person}:${revision}`;

function publishWorld(current: unknown, candidate: unknown): unknown {
  if (Array.isArray(current) && Array.isArray(candidate)) {
    for (let index = 0; index < candidate.length; index++)
      current[index] = publishWorld(current[index], candidate[index]);
    current.length = candidate.length;
    return current;
  }
  if (object(current) && object(candidate)) {
    for (const field of Object.keys(current)) if (!Object.hasOwn(candidate, field)) delete current[field];
    for (const field of Object.keys(candidate))
      current[field] = publishWorld(current[field], candidate[field]);
    return current;
  }
  return candidate;
}

function readLedger(archive: DeepReadonly<RunArchive>, receipts: ColdActionReceipts): BuildingLedger {
  const data = archive.current.world.hostState;
  if (
    !object(data) ||
    Object.keys(data).sort().join(',') !== 'active,format,receipts' ||
    data.format !== 'stairwell-hf-world/1' ||
    !Number.isSafeInteger(data.receipts) ||
    (data.receipts as number) < 0 ||
    !Array.isArray(data.active)
  )
    throw new Error('The saved building has an invalid HF world ledger.');
  const active: BuildingActivity[] = [];
  for (const value of data.active) {
    if (
      !object(value) ||
      Object.keys(value).sort().join(',') !== 'id,offer,offerRevision,person,start' ||
      typeof value.id !== 'string' ||
      typeof value.person !== 'string' ||
      !Number.isSafeInteger(value.start) ||
      !Number.isSafeInteger(value.offerRevision) ||
      !object(value.offer)
    )
      throw new Error('The saved building has an invalid accepted activity.');
    const actor = archive.current.people[value.person];
    const accepted = receipts.accepted(value.id, value.person),
      started = accepted?.request;
    if (
      !actor?.activity ||
      actor.activity.id !== value.id ||
      actor.activity.startedAt !== value.start ||
      canonicalPersona(actor.activity.offer) !== canonicalPersona(value.offer) ||
      !started ||
      canonicalPersona(accepted?.offer) !== canonicalPersona(value.offer) ||
      started.offerRevision !== value.offerRevision ||
      started.offerId !== value.offer.id ||
      started.boundaryAt !== value.start ||
      active.some((binding) => binding.id === value.id || binding.person === value.person)
    )
      throw new Error('The accepted building activity does not match its HF archive.');
    active.push(structuredClone(value) as BuildingActivity);
  }
  for (const actor of Object.values(archive.current.people))
    if (
      actor.activity &&
      !active.some((a) => a.person === actor.id && a.id === actor.activity?.id) &&
      !archive.current.pending.some(
        (request) =>
          request.kind === 'action' &&
          request.stage === 'start' &&
          request.person === actor.id &&
          request.activityId === actor.activity?.id,
      )
    )
      throw new Error('The HF archive has an activity without its accepted building receipt.');
  return { format: 'stairwell-hf-world/1', receipts: data.receipts as number, active };
}

export class BuildingRun<W> {
  #run: Run;
  #coldReceipts?: ColdActionReceipts;
  readonly #source: string;
  #world: W;
  #ledger: BuildingLedger;
  #revision: number;
  #now: number;
  #pending: DeepReadonly<StepResult> | undefined;
  #transaction = false;
  #recoveryBase: DeepReadonly<RunArchive>;
  #journal: { until: number; inputs: Input[] }[] = [];
  #recoveryFailed = false;
  readonly #offers = new Map<string, DeepReadonly<readonly Offer[]>>();
  private constructor(
    run: Run,
    world: W,
    source: string,
    ledger: BuildingLedger,
    revision: number,
    at: number,
    recoveryBase: DeepReadonly<RunArchive>,
  ) {
    this.#run = run;
    this.#world = world;
    this.#source = source;
    this.#ledger = ledger;
    this.#revision = revision;
    this.#now = at;
    this.#recoveryBase = recoveryBase;
  }
  static open<W>(spec: RunSpec, people: readonly PersonAuthoring[], world: W): BuildingRun<W> {
    const authored = structuredClone(spec);
    const ledger: BuildingLedger = { format: 'stairwell-hf-world/1', receipts: 0, active: [] };
    authored.world.hostState = json(ledger);
    const run = admitted(createRun(authored));
    for (const person of people) admitted(createPerson(run, person));
    return new BuildingRun(
      run,
      structuredClone(world),
      spec.host.id,
      ledger,
      spec.world.revision,
      spec.start,
      exportRun(run),
    );
  }
  static restore<W>(input: unknown, decodeWorld: (value: unknown) => W): BuildingRun<W> {
    if (
      !object(input) ||
      Object.keys(input).sort().join(',') !== 'archive,format,world' ||
      input.format !== 'stairwell-engine/1'
    )
      throw new Error('This building checkpoint belongs to another game version. Keep the file.');
    const world = decodeWorld(input.world);
    const run = admitted(restoreRun(input.archive));
    // Cold restoration is the only decoder of archived actor/offer records. Live
    // UI reads never use the archive as an inspection or mutation interface.
    const archive = exportRun(run),
      receipts = new ColdActionReceipts(archive, run),
      ledger = readLedger(archive, receipts);
    const session = new BuildingRun(
      run,
      structuredClone(world),
      archive.host.id,
      ledger,
      archive.current.world.revision,
      archive.current.at,
      archive,
    );
    session.#coldReceipts = receipts;
    if (archive.current.pending.length)
      session.#pending = {
        at: archive.current.at,
        reachedUntil: false,
        events: [],
        boundary: { type: 'world-required', requests: archive.current.pending },
        nextAt: archive.current.at,
      };
    for (const [person, book] of Object.entries(archive.current.offers))
      session.#offers.set(key(person, book.revision), book.offers);
    for (const active of ledger.active)
      session.#offers.set(key(active.person, active.offerRevision), [active.offer]);
    return session;
  }
  /** Original accepted public requests, shared by cold building validators. */
  coldActionReceipt(id: string, person: string) {
    this.#coldReceipts ??= new ColdActionReceipts(this.checkpoint().archive, this.#run);
    return this.#coldReceipts.accepted(id, person);
  }
  get world(): W {
    this.usable();
    return this.#world;
  }
  get now(): number {
    this.usable();
    return this.#now;
  }
  get active(): DeepReadonly<readonly BuildingActivity[]> {
    this.usable();
    return structuredClone(this.#ledger.active);
  }
  get pendingRequests(): DeepReadonly<readonly HostRequest[]> {
    this.usable();
    return this.#pending?.boundary.type === 'world-required'
      ? structuredClone(this.#pending.boundary.requests)
      : [];
  }
  transaction<T>(operation: (candidate: BuildingRun<W>) => T): T {
    this.usable();
    if (this.#transaction) throw new Error('A building action cannot nest another action transaction.');
    const published = this.#world,
      base = this.#recoveryBase,
      prefix = this.#journal.length,
      host = structuredClone({
        ledger: this.#ledger,
        revision: this.#revision,
        now: this.#now,
        pending: this.#pending,
        offers: [...this.#offers],
      });
    this.#world = structuredClone(published);
    this.#transaction = true;
    try {
      const result = operation(this);
      this.#world = publishWorld(published, this.#world) as W;
      return result;
    } catch (error) {
      // The complete public base and exact accepted input prefix are recovery
      // material. Successful actions need no growing archive export. Recovery
      // replays public steps, including empty advances and actual host replies.
      try {
        const restored = admitted(restoreRun(base));
        for (const batch of this.#journal.slice(0, prefix)) admitted(step(restored, batch));
        this.#run = restored;
      } catch (cause) {
        this.#recoveryFailed = true;
        throw new Error(
          'The complete public recovery journal could not replay. Keep the last saved notebook.',
          { cause },
        );
      }
      this.#world = published;
      this.#ledger = host.ledger;
      this.#revision = host.revision;
      this.#now = host.now;
      this.#pending = host.pending;
      this.#journal.length = prefix;
      this.#offers.clear();
      for (const [id, offers] of host.offers) this.#offers.set(id, offers);
      throw error;
    } finally {
      this.#transaction = false;
    }
  }
  inspect(query: InspectQuery) {
    this.usable();
    return admitted(inspect(this.#run, query));
  }
  preview(query: PreviewQuery) {
    this.usable();
    return admitted(preview(this.#run, query));
  }
  checkpoint(): BuildingCheckpoint<W> {
    this.usable();
    const archive = exportRun(this.#run);
    // A checkpoint requested by an action cannot erase its rollback prefix.
    if (!this.#transaction) {
      this.#recoveryBase = structuredClone(archive);
      this.#journal = [];
    }
    return {
      format: 'stairwell-engine/1',
      world: structuredClone(this.#world),
      archive,
    };
  }
  ingest(until: number, inputs: readonly Input[] = []): DeepReadonly<StepResult> {
    this.usable();
    const batch = { until, inputs: structuredClone(inputs) as Input[] };
    const result = admitted(step(this.#run, batch));
    this.#journal.push(batch);
    // These are accepted host inputs. HF still owns whether and when each offer
    // book is consumed; a request names its exact admitted book revision.
    for (const input of inputs)
      if (input.kind === 'offers.received')
        this.#offers.set(
          key(input.payload.person, input.payload.revision),
          structuredClone(input.payload.offers),
        );
    this.#now = result.at;
    this.#pending = result.boundary.type === 'world-required' ? result : undefined;
    return result;
  }
  private usable(): void {
    if (this.#recoveryFailed)
      throw new Error('This session failed public recovery. Reopen the last complete saved notebook.');
  }
  advance(
    until: number,
    resolver: BuildingResolver<W>,
    inputs: readonly Input[] = [],
    pending?: DeepReadonly<StepResult>,
  ): DeepReadonly<StepResult> {
    this.usable();
    pending ??= this.#pending;
    if (pending && inputs.length)
      throw new Error('A pending HF boundary cannot resubmit its accepted inputs.');
    let next = pending ?? this.ingest(until, inputs);
    const events = [...next.events];
    for (let boundary = 0; boundary < 10000; boundary++) {
      if (next.boundary.type === 'until') {
        if (!next.reachedUntil || next.at !== until)
          throw new Error('HF did not reach the requested building time.');
        return { ...next, events };
      }
      const candidateWorld = structuredClone(this.#world),
        candidate = structuredClone(this.#ledger);
      let revision = this.#revision;
      const replies: Input[] = [...next.boundary.requests]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((request) => {
          const common = {
            id: `receipt:${request.id}`,
            at: request.boundaryAt,
            source: { type: 'host' as const, id: this.#source },
          };
          const prior = revision++;
          candidate.receipts++;
          let reply: Input;
          if (request.kind === 'communication') {
            const actual = resolver.communication(candidateWorld, request);
            reply = {
              ...common,
              kind: 'communication.resolved',
              payload: {
                ...actual,
                requestId: request.id,
                requestHash: request.requestHash,
                worldRevision: prior,
                speaker: request.speaker,
              },
            };
          } else {
            const offered = this.#offers
              .get(key(request.person, request.offerRevision))
              ?.find((o) => o.id === request.offerId);
            const priorActivity = candidate.active.find(
              (a) => a.id === request.activityId && a.person === request.person,
            );
            const active =
              priorActivity ??
              (offered
                ? {
                    id: request.activityId,
                    person: request.person,
                    offer: structuredClone(offered) as Offer,
                    offerRevision: request.offerRevision,
                    start: request.boundaryAt,
                  }
                : undefined);
            if (!active) throw new Error('The building has no admitted offer for this HF request.');
            const actual = resolver.action(candidateWorld, request, active);
            if (request.stage === 'start' && actual.disposition === 'accepted') {
              if (priorActivity) throw new Error('The building already accepted this activity.');
              candidate.active.push(active);
            } else if (request.stage !== 'start') {
              if (!priorActivity) throw new Error('The building cannot finish work it did not accept.');
              candidate.active = candidate.active.filter((a) => a.id !== active.id);
            }
            reply = {
              ...common,
              kind: 'action.resolved',
              payload: {
                ...actual,
                requestId: request.id,
                requestHash: request.requestHash,
                worldRevision: prior,
                person: request.person,
                activityId: request.activityId,
                stage: request.stage,
              },
            };
          }
          reply.payload.worldChange = {
            expectedRevision: prior,
            revision,
            put: [],
            remove: [],
            hostState: json(candidate),
          };
          return reply;
        });
      // A rejection throws before the candidate world/ledger is published. HF
      // owns duplicate-settlement rejection; the host never maintains a rival log.
      const accepted = this.ingest(until, replies);
      // Existing host rules may hold a resident/task reference while submitting
      // an input. Preserve those world references after acceptance; the staged
      // candidate was detached throughout validation and rejection changes none.
      this.#world = publishWorld(this.#world, candidateWorld) as W;
      this.#ledger = candidate;
      this.#revision = revision;
      next = accepted;
      events.push(...accepted.events);
    }
    throw new Error('The building reached its HF request budget without making progress.');
  }
}
