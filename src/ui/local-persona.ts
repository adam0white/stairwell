/** File continuity stays in this origin. Reads and parent checks share one IndexedDB transaction. */
import {
  acceptPersona,
  type PersonaEnvelope,
  type PersonaShelfState,
  validatePersona,
} from '@adam0white/lab-client';

const DB = 'stairwell-persona-files';
const STORE = 'continuity';
const KEY = 'shelf';
let connection: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onerror = () => {
        connection = undefined;
        reject(request.error);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
    });
  return connection;
}
export interface LocalPersonaOptions {
  arrival?: PersonaEnvelope;
  fork?: boolean;
}
/** Only validated envelopes reach this synchronous reducer, while the write transaction owns the head. */
export function reduceLocalPersona(
  previous: PersonaShelfState | undefined,
  envelope: PersonaEnvelope,
  options: LocalPersonaOptions = {},
): PersonaShelfState {
  let state: PersonaShelfState = previous ?? { revisions: [], heads: {} };
  const arrival = options.arrival;
  if (arrival) {
    if (
      options.fork ||
      arrival.castId !== envelope.castId ||
      arrival.branchId !== envelope.branchId ||
      envelope.parentRevision !== arrival.revision
    )
      throw new Error('The file claim does not continue its selected arrival.');
    // Retry the current accepted claim without replaying its now-historical source insertion.
    if (state.heads[envelope.castId] === envelope.revision) return acceptPersona(state, envelope);
    // A file starts its local chain at an imported checkpoint. Its earlier revisions remain in the source.
    // This bootstrap is allowed only when this origin has no active continuation for that person.
    if (!Object.hasOwn(state.heads, arrival.castId) && arrival.parentRevision !== null)
      state = {
        revisions: state.revisions,
        heads: { ...state.heads, [arrival.castId]: arrival.parentRevision },
      };
    state = acceptPersona(state, arrival);
  }
  return acceptPersona(state, envelope, options.fork);
}
export async function acceptLocalPersona(
  input: PersonaEnvelope,
  options: LocalPersonaOptions = {},
): Promise<PersonaEnvelope> {
  // Cryptographic validation is asynchronous and therefore precedes the IndexedDB transaction.
  const envelope = await validatePersona(input);
  const arrival = options.arrival ? await validatePersona(options.arrival) : undefined;
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const read = store.get(KEY);
    let failure: unknown;
    read.onsuccess = () => {
      try {
        const next = reduceLocalPersona(read.result as PersonaShelfState | undefined, envelope, {
          arrival,
          fork: options.fork,
        });
        store.put(next, KEY);
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(envelope);
    tx.onerror = () => reject(failure ?? tx.error ?? new Error('File continuity storage failed.'));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('File continuity storage was interrupted.'));
  });
}
