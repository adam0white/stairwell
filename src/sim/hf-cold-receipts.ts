/** Cold evidence from the restored Run's public host projection. Exported
 * diagnostic windows omit old requests; live inspection retains them. One lazy
 * projection supplies original requests to every cold building validator. */
import {
  type ActionResolution,
  type DeepReadonly,
  type HostRequest,
  inspect,
  type Offer,
  type Run,
  type RunArchive,
} from '@adam0white/human-framework';
import { admitted } from './hf-run.ts';

type Start = DeepReadonly<Extract<HostRequest, { kind: 'action' }>>;
export type ColdActionReceipt = {
  request: Start;
  offer: DeepReadonly<Offer>;
  outcome?: DeepReadonly<ActionResolution['outcome']>;
};

export class ColdActionReceipts {
  readonly #archive: DeepReadonly<RunArchive>;
  readonly #run: Run;
  #accepted?: Map<string, ColdActionReceipt>;
  constructor(archive: DeepReadonly<RunArchive>, run: Run) {
    this.#archive = archive;
    this.#run = run;
  }
  accepted(id: string, person: string): ColdActionReceipt | undefined {
    if (!this.#accepted) this.read();
    const receipt = this.#accepted?.get(id);
    return receipt?.request.person === person ? receipt : undefined;
  }
  private read(): void {
    // restoreRun has already replayed and verified the complete archive. This
    // privileged public projection supplies owner requests, never host ledger
    // claims or identity hashes invented by the receiving game.
    const events = admitted(
      inspect(this.#run, {
        perspective: { kind: 'host' },
        people: [],
        select: ['events'],
      }),
    ).events;
    const requests = new Map<string, Start>(),
      books = new Map<string, DeepReadonly<readonly Offer[]>>(),
      accepted = new Map<string, ColdActionReceipt>();
    for (const event of events) {
      if (
        'access' in event &&
        event.access === 'host' &&
        event.data.kind === 'action-requested' &&
        event.data.request.stage === 'start'
      )
        requests.set(event.data.request.id, event.data.request);
    }
    for (const transaction of this.#archive.history) {
      for (const input of transaction.inputs) {
        if (input.kind === 'offers.received')
          books.set(`${input.payload.person}:${input.payload.revision}`, input.payload.offers);
        if (input.kind !== 'action.resolved') continue;
        const reply = input.payload;
        if (reply.stage === 'start' && reply.disposition === 'accepted') {
          const request = requests.get(reply.requestId);
          if (
            !request ||
            request.activityId !== reply.activityId ||
            request.person !== reply.person ||
            request.requestHash !== reply.requestHash ||
            request.stage !== reply.stage
          )
            throw Error('The building has no original public action request. Keep the file.');
          const offer = books
            .get(`${request.person}:${request.offerRevision}`)
            ?.find((candidate) => candidate.id === request.offerId);
          if (!offer) throw Error('The building has no original public offer. Keep the file.');
          accepted.set(reply.activityId, { request, offer });
        } else if (reply.stage !== 'start') {
          const receipt = accepted.get(reply.activityId);
          if (receipt) receipt.outcome = reply.outcome;
        }
      }
    }
    this.#accepted = accepted;
  }
}
