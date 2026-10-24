/** Display only. Replay, stored dialogue, claims and deterministic rules keep their original bytes. */
const COPY: Record<string, string> = {
  'Good. Now I can breathe.': 'Good. I do not have to worry about that job now.',
  'Burak is careful, not crooked. The building forgets the difference when it is cold.':
    'Burak is careful, not dishonest. When the building is cold, people forget the difference.',

  'Thank you. Exactly right, for once.': 'Thank you. You got it exactly right, for once.',
  'Could you hold this fold a moment? No, another evening. It is not quite ready.':
    'Could you hold this fold a moment? No, let us do it another evening. It is not quite ready.',
  'The man at night? That’s Volkan, my brother.':
    'Do you mean the man who comes at night? That’s Volkan, my brother.',
  'You are already here. Nothing to pick up or hand over just now.':
    'You are already here. There is nothing to pick up or deliver just now.',
  "I'll still have enough for the next errands.": 'I will still have enough energy for the next errands.',
  "I can do it, but I'll be spent for the next errands.":
    'I can do it, but I will be exhausted during the next errands.',
  'The gate on the latch': 'The gate left open',
  'You left the courtyard gate on the latch.': 'You left the courtyard gate open.',

  'Retired shop assistant. Staying by the entrance during family business.':
    'She is a retired shop assistant. She is staying by the entrance while handling family business.',
  'Widowed retired teacher and volunteer tutor. Corrects the notices on the board.':
    'She is a widowed retired teacher and volunteer tutor. She corrects the notices on the board.',
  'Single accountant. Keeps the shared building account separate from his work.':
    'He is a single accountant. He keeps the shared building account separate from his work.',
  'Night nurse. Sleeps in the mornings.': 'She is a night nurse. She sleeps in the mornings.',
  'Widowed retired ferry captain. Top floor; the stairs take effort.':
    'He is a widowed retired ferry captain. He lives on the top floor, and the stairs take effort.',
  'Back at flat 5. I still need my morning sleep.': 'I am back at flat 5. I still need my morning sleep.',
  'Bread first, before anything. They all want it by eight, and they all say theirs is first.':
    'Deliver the bread first. Everyone wants it by eight, and everyone says their order comes first.',
  'Monday. Your first day at Lale Apartmanı. The bread order is on the board, and a notice from Burak Bey: water off Wednesday, ten to twelve.':
    'It is Monday, your first day at Lale Apartmanı. The bread order is on the board. Burak Bey’s notice says the water will be off on Wednesday from 10:00 to 12:00.',
  'Paper supplies. That label tells you what arrived, not what he is making. Let him choose whether to show you.':
    'These are paper supplies. The label tells you what arrived. It does not tell you what he is making. Let him choose whether to show you.',
  'Ah, there you are. Sit a minute. No? Always running.':
    'Ah, there you are. Will you sit for a minute? No? You are always busy.',
  'Good boy. Rıza was never this quick.': 'You are a good boy. Rıza was never this quick.',
  'On time. I noticed.': 'You arrived on time. I noticed.',
  'Thanks, abi. Really.': 'Thanks, abi. I mean it.',
  'You’re a lifesaver.': 'You have helped me so much.',
  'You’re a lifesaver, honestly.': 'You have helped me so much, honestly.',
  'Oh, thank you. I’m dead on my feet.': 'Oh, thank you. I am very tired.',
  'Thanks, really.': 'Thank you. I mean it.',
  'Thank you, son. These stairs.': 'Thank you, son. These stairs are hard for me.',
  'Bless your legs. Thank you.': 'Bless your legs for carrying you up here. Thank you.',
  'Look at that. Like new. Rıza used to grumble the whole time.':
    'Look at that. It is like new. Rıza used to complain the whole time.',
  'Done properly. Thank you.': 'You did it properly. Thank you.',
  'Thank you. One less thing.': 'Thank you. That is one less thing to do.',
  'Sit, have a tea. Five minutes.': 'Sit and have a tea for five minutes.',
  'Finally. I nearly sent someone down for you.': 'You are here at last. I nearly sent someone down for you.',
  'Late. Rıza would have been late too, but he would have had a story.':
    'You are late. Rıza would have been late too, but he would have had a story.',
  'Ah, I’d already gone without. Thanks.': 'Ah, I had already managed without it. Thank you.',
  'The truck comes at a quarter to nine. It had gone; the bins sat on the pavement all night.':
    'The truck comes at 20:45. It had already gone, so the bins stayed on the pavement all night.',
  'Forty years of children reading aloud. I still hear them in the evenings.':
    'I listened to children reading aloud for forty years. I still hear them in the evenings.',
  'Forty years on the Kadıköy run. I could do it with my eyes shut. Some mornings I did.':
    'I worked on the Kadıköy run for forty years. I knew it so well I could do it with my eyes shut. Some mornings I did.',
  'My legs thank you. The rest of me too.': 'My legs thank you. The rest of me thanks you too.',
  'You asked me already. Nothing since.': 'You asked me already. Nothing has happened since.',
  'Nothing for you today.': 'I have no news for you today.',
  'My knee again. Rain coming, you’ll see.': 'My knee hurts again. Rain is coming, you’ll see.',
  'The grocer gave me short change. Twice this month.':
    'The grocer gave me too little change. That has happened twice this month.',
  'Nothing. I sat by the window all morning and nothing.':
    'Nothing happened. I sat by the window all morning and saw nothing.',
  'My child rang from abroad. Too busy, as usual.':
    'My child rang from abroad but was too busy to talk, as usual.',
  'Nothing worth repeating.': 'I heard nothing worth repeating.',
  'Month end. I live at the office.': 'It is the end of the month. I spend all my time at the office.',
  'Nothing much. Work.': 'I have little news. I have been working.',
  'Honestly? Tired. That’s the news.': 'Honestly, I am tired. That is my news.',
  'My mother rang. She asks when I will settle down. Every call.':
    'My mother rang. She asks when I will settle down every time she calls.',
  'Long night. Two admissions at four.': 'It was a long night. Two patients arrived at four.',
  'Nothing, I slept through it all.': 'I have no news. I slept through it all.',
  'My family may ring on Sunday. May.': 'My family may ring on Sunday. I am not sure they will.',
  'The gulls woke me at five. Same as always.': 'The gulls woke me at five, as they always do.',
  'I hear enough at the hospital. Not here.': 'I hear enough gossip at the hospital. I do not want it here.',
  'At my age you stop carrying stories.': 'At my age you stop repeating gossip.',
  'Not to their face.': 'You cannot make up a story about someone while speaking to them.',
  'Nobody would believe that of a married person. Only people who are single.':
    'Nobody would believe that about a married person. You can only choose people who are single.',
  'Old news, evladım.': 'That is old news, evladım.',
  'Who would have thought.': 'Who would have thought that?',
  'Good. Good for them.': 'That is good. I am happy for them.',
  'Is that so.': 'Is that so?',
  'Interesting.': 'That is interesting.',
  'Take this down to Burak for me. Part of my dues.':
    'Take this down to Burak for me. It is part of my dues.',
  'The boiler’s pump has gone.': 'The boiler’s pump has broken.',
  'The fund is thin. Some flats are behind. I won’t say who.':
    'The fund has too little money. Some flats are behind on their payments. I won’t say who.',
  'The boiler fund is short.': 'The boiler fund has too little money.',
  'The water is off on Wednesday, ten to twelve.': 'The water will be off on Wednesday from 10:00 to 12:00.',
  'Nobody here to take it. A parcel is never left on a handle.':
    'Nobody is here to take it. You never leave a parcel on a door handle.',
  'No answer.': 'Nobody answers.',
  'Derya sleeps till three. Bread on the hook, never the bell.':
    'Derya sleeps until three. Leave her bread on the hook. Never ring the bell.',
  'A new line in the notebook.': 'You added a new line to the notebook.',
  'Your two stories met.': 'They noticed that you told them different stories.',
  'They always compare. Always. Tell them the same thing or tell them nothing.':
    'They always compare what you told them. Tell them the same thing or tell them nothing.',
  'Nothing you had not heard already today.': 'You have already heard these stories today.',
  'The same stories, round again.': 'They repeated the same stories.',
  'Only the weather, and the price of bread.': 'They talked only about the weather and the price of bread.',
  'Grandchildren, mostly.': 'They talked mostly about grandchildren.',
  'The price of tomatoes at the market.': 'They talked about the price of tomatoes at the market.',
  'The football, then the weather.': 'They talked about football, then the weather.',
  'Whose turn it is to water the plants on the landing.':
    'They discussed whose turn it is to water the plants on the landing.',
  'Come, look at the book. ₺1,800 left; the pump is ₺2,400.':
    'Come and look at the book. We have ₺1,800 left, and the pump costs ₺2,400.',
  'The supplier offered a week for the last ₺600.': 'The supplier gave us a week to pay the last ₺600.',
  'No names on the stairs, please.': 'Please do not name anyone when you talk on the stairs.',
  'Quiet mornings, no explanations demanded.':
    'The notice asked for quiet mornings. It did not demand explanations.',
  'The same man at flat 5 again, late.': 'The same man came to flat 5 late again.',
  'Flat 5 again after eleven.': 'The man came to flat 5 again after eleven.',
  'Sunday. The residents’ meeting in Burak Bey’s flat. Tea, the good glasses.':
    'It is Sunday. The residents meet in Burak Bey’s flat. He serves tea in the good glasses.',
  'Here is the book. Every kuruş.': 'Here is the book. Every kuruş is recorded.',
  'The ginger cat again. Burak has started calling it Pamuk.':
    'The ginger cat came back. Burak has started calling it Pamuk.',
  'It came back to you. It always does, in a building. Lie low a day.':
    'People heard what you said about them. That always happens in a building. Stay quiet for a day.',
  'Whatever you tell Hacer, the step hears by six.':
    'Whatever you tell Hacer, people on the step hear by six.',
  'Wise, or dull. They will decide which.': 'They will decide whether you are wise or dull.',
  'Never again. Mostly.': 'I decided never to do it again. I mostly kept to that.',
  'Sleep. Bread at seven.': 'Go to sleep. You need to collect bread at seven.',
  'What Hacer sees at night, the step hears by noon.':
    'What Hacer sees at night, people on the step hear about by noon.',
  'Tomorrow at eleven: the meeting, and the vote on your tea money.':
    'The meeting is tomorrow at eleven. The residents will vote on your tea money.',
  'Burak asked what the weather will be on Saturday evening. On the roof.':
    'Burak asked what the weather will be like on the roof on Saturday evening.',
};

const REWRITES = Object.entries(COPY).sort((a, b) => b[0].length - a[0].length);

export function displayText(text: string): string {
  // Longer keys first prevent a short thank-you from swallowing a longer variant.
  let result = text;
  for (const [before, after] of REWRITES) result = result.replaceAll(before, after);
  return result
    .replace(/\bis sweet on\b/g, 'has romantic feelings for')
    .replace(/\bis not sweet on\b/g, 'does not have romantic feelings for')
    .replace(/\bis tight with money\b/g, 'is unwilling to spend money')
    .replace(/\bis not tight with money\b/g, 'is willing to spend money')
    .replace(
      /(Hacer|Sevim|Burak|Derya|Tarık) and (Hacer|Sevim|Burak|Derya|Tarık) (on the step|on the stairs|in flat \d+)\. You could hear them\./g,
      '$1 and $2 were talking $3. You could hear them.',
    )
    .replace(
      /(Hacer|Sevim|Burak|Derya|Tarık) and (Hacer|Sevim|Burak|Derya|Tarık) on (.+)\. Not a word\./g,
      '$1 and $2 were at $3. They did not speak.',
    )
    .replace(/(Hacer|Sevim|Burak|Derya|Tarık) pressed (.+?) on you\./g, '$1 gave you $2.')
    .replace(
      /\b(a loaf|two loaves)( and the paper)?(?=$|[.,])/g,
      (_match, bread: string, paper: string | undefined) =>
        `${bread} of bread${paper ? ' and a newspaper' : ''}`,
    )
    .replace(/^(Tuesday|Wednesday|Thursday|Friday|Saturday)\. /, 'It is $1. ')
    .replace(/; the writers’ perspectives are unrecorded\./g, '. You do not know what the writers thought.')
    .replace(
      /Count the hands before you sleep\. (.*?) Four hands raise the tea money\./g,
      (_match, estimates: string) =>
        `Think about the vote before you sleep. ${estimates
          .replace(/([^.:]+): likely\./g, '$1 will probably vote for your raise.')
          .replace(/([^.:]+): maybe\./g, '$1 may vote for your raise.')
          .replace(
            'Nobody you can be sure of.',
            'There is nobody you can be sure of.',
          )} Four votes will raise the tea money.`,
    )
    .replace(/would not count on that word for Sunday/g, 'could no longer count on their support on Sunday');
}

export function residentRead(read: { warmth: string; word: string }): { warmth: string; word: string } {
  const warmth: Record<string, string> = {
    'fond of you': 'They are fond of you.',
    warm: 'They seem friendly.',
    polite: 'They are polite to you.',
    cool: 'They seem distant.',
    cold: 'They seem unfriendly.',
  };
  const word: Record<string, string> = {
    'thinks you lie': 'They think you lie.',
    'not sure of you': 'They are not sure they can trust you.',
    'takes your word': 'They believe what you say.',
    'listens to you': 'They listen to you.',
    'doubts you': 'They doubt what you say.',
  };
  return { warmth: warmth[read.warmth] ?? read.warmth, word: word[read.word] ?? read.word };
}
