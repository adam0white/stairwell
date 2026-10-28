/** Optional edition11 authored month. Dates, errands and consequences belong to this building.
 * HF still owns assent, reputation, body and votes. No general planning, private publication,
 * financial discharge outside this chapter, or changes to edition9 continuation are modelled here.
 */
import type { Rid } from './people.ts';
export const MONTH_VERSION = 'stairwell@11';
/** Explicit same-place ordinary work, with unchanged edition11 month rules. */
export const WORK_START_VERSION = 'stairwell@13';
export interface MonthVisit {
  actor: Rid;
  other: Rid;
  kind: 'parcel' | 'dues';
  task?: number;
  amount?: number;
  startedAt: number;
  arrivesAt: number;
  finishesAt: number;
  done?: number;
  outcome?: 'completed' | 'interrupted';
}
export interface MonthState {
  rain: { started: boolean; ended: boolean };
  meetings: { day: number; yes: number; no: number; raise: boolean }[];
  seats: Partial<Record<Rid, Rid>>;
  helped: Partial<Record<Rid, boolean>>;
  testimony: {
    from: string;
    to: Rid;
    prop: string;
    value: boolean;
    at: number;
    caretaker?: { at: number; lie: boolean };
  }[];
  repaymentAt?: number;
  invoiceDueAt?: number;
  supplierLate?: boolean;
  duesPaid: boolean;
  duesBalance: number;
  tarikCash: number;
  fundCash: number;
  pensionReceived: boolean;
  paymentLedger: { at: number; amount: number; supplierPaid: number; remaining: number }[];
  supplierBalance: number;
  visits: MonthVisit[];
  accusations: string[];
  missedPaymentAt?: number;
  stay: boolean | null;
}
export const newMonth = (): MonthState => ({
  rain: { started: false, ended: false },
  meetings: [],
  seats: {},
  helped: {},
  duesPaid: false,
  duesBalance: 600,
  tarikCash: 0,
  fundCash: 0,
  pensionReceived: false,
  paymentLedger: [],
  supplierBalance: 0,
  visits: [],
  accusations: [],
  stay: null,
  testimony: [],
});
/** Deliberate host speech policies. These are authored choices, not inferred personality measurements.
 * HF confidentMin is distance from0.5, so0.25 means at least0.75 / at most0.25.
 */
export const RELAY_POLICY: Record<Rid, number> = {
  hacer: 0.15,
  sevim: 0.25,
  burak: 0.25,
  derya: 0.25,
  tarik: 0.2,
};
export const PRIVATE_WORK: Record<Rid, { label: string; minutes: number; outcome: string }> = {
  hacer: {
    label: 'hold the paper walls while Hacer glues her room',
    minutes: 18,
    outcome:
      'Hacer fitted the last wall of her paper room. She set it beside her chair, where she could choose who saw it.',
  },
  sevim: {
    label: 'help Sevim remove names from her lesson example',
    minutes: 22,
    outcome:
      'Sevim put an unnamed example in her lesson folder. She kept the pupil’s exercise books at home. Her own mistaken judgement remained in the lesson.',
  },
  burak: {
    label: 'hold Burak’s model harbour while he fits the ferry',
    minutes: 20,
    outcome:
      'Burak pulled the tab. His paper ferry crossed the harbour without catching. He chose to keep the model at his own table.',
  },
  derya: {
    label: 'help Derya put her private letters in date order',
    minutes: 25,
    outcome:
      'Derya put the dated letters in a folder she kept herself. The order was clearer. It still did not tell her why the training offers stopped.',
  },
  tarik: {
    label: 'help Tarık clean the tape player’s controls',
    minutes: 20,
    outcome:
      'Tarık chose a tape and stopped it before the voices began. A bird called from the speaker. The tapes stayed in his room.',
  },
};
