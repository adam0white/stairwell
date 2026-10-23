/** Authored v4 stories. Facts are clues, not reputation traits or progress counters. */
export const STORY_FACTS = {
  nermin: 'nermin:recipe_saved',
  sevim: 'sevim:recipe_returned',
  book: 'fund:supplier_credit',
  instalments: 'tarik:repayment_offer',
} as const;

export const STORY_SECRETS = [
  { prop: STORY_FACTS.nermin, value: true, title: 'Nermin saved Sevim’s mother’s recipe in a notebook.' },
  {
    prop: STORY_FACTS.sevim,
    value: true,
    title: 'Sevim returned the dolma pot with a note that never arrived.',
  },
  { prop: STORY_FACTS.book, value: true, title: 'The pump supplier will accept the balance next week.' },
  {
    prop: STORY_FACTS.instalments,
    value: true,
    title: 'Tarık offered Hüseyin a private weekly repayment arrangement.',
  },
];

export const STORY_WORDS: Record<string, [string, string]> = {
  [STORY_FACTS.nermin]: [
    'Nermin kept Sevim’s mother’s dolma recipe safe. She thought Sevim wanted it back without speaking to her.',
    'Nermin did not keep the recipe.',
  ],
  [STORY_FACTS.sevim]: [
    'Sevim returned Nermin’s pot with a thank-you note. She thought Nermin threw the note away.',
    'Sevim did not send a thank-you note.',
  ],
  [STORY_FACTS.book]: [
    'The pump supplier will take the balance next week. The book has enough for the deposit.',
    'The pump supplier will not allow a later payment.',
  ],
  [STORY_FACTS.instalments]: [
    'Tarık asks to arrange his dues with you privately, in weekly payments. He asked me to tell you.',
    'Tarık has not offered a repayment arrangement.',
  ],
};

export const STORY_LINES = {
  nermin:
    'That dolma pot had her mother’s recipe under the lid. I copied it into my notebook so it wouldn’t get lost. Then the pot came back without a word. I thought she wanted nothing more to do with me. Does she still think I kept it?',
  sevim:
    'I sent the pot back with a thank-you note under the saucer. Her husband took it at the door. Then she stopped speaking. I thought she had read it and thrown it away. Perhaps you could ask her.',
  book: 'Come, look at the book. ₺1,800 left; the pump is ₺2,400. The supplier offered a week for the last ₺600. I need a repayment date I can stand behind. No names on the stairs, please.',
  instalments:
    'The pension comes next week. I can clear the dues in weekly payments. Tell Hüseyin that, just Hüseyin. I would rather agree it with him than hide upstairs.',
  agreement:
    'He asked you to tell me? Then I’ll speak with him privately. The supplier can have the deposit from the fund and the balance next week. Keep your own money. I’ll book the engineer.',
  repair:
    'The engineer fitted the new pump. Hot water ran at every tap. Hüseyin entered the deposit and the balance due in the fund book; Tarık’s repayment dates stayed between them.',
  tea: 'On Saturday, Sevim brought a pot of dolma downstairs. Nermin opened the old recipe notebook. “There was a note?” “You kept the recipe?” They sat at the entrance with two cups. This time they spoke to each other.',
};

export interface StoryState {
  feud: { nerminPassed: boolean; sevimPassed: boolean; reconciled: boolean };
  fund: {
    bookRead: boolean;
    consentPassed: boolean;
    agreed: boolean;
    repairAt: number | null;
    repaired: boolean;
  };
}

export function newStories(): StoryState {
  return {
    feud: { nerminPassed: false, sevimPassed: false, reconciled: false },
    fund: { bookRead: false, consentPassed: false, agreed: false, repairAt: null, repaired: false },
  };
}
