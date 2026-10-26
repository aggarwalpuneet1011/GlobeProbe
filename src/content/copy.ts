// Fixed child-facing microcopy.
// Strings marked "chrome" are plain button labels with no fixed wording in the design.

export const FEEDBACK = {
  correctFirst: ['Spot on, Detective.', "That's the cause. Nicely reasoned.", 'Case closed on that one.', 'Exactly what the evidence shows.'],
  correctSecond: ["Got it this time. The replay helped.", "Yes. Now you've seen why."],
  predictMatch: 'You predicted {choice}. You were right.',
  predictMiss: ['You predicted {choice}. Look what really happened.', 'Interesting guess. The world had other plans.'],
  explainNotQuite1: "Hmm, not quite. Let's watch that part again, closely.",
  explainNotQuite2a: "Here's what's really going on:",
  explainNotQuite2b: "Real detectives check twice. We'll see this again soon.",
  caseSolved: 'Case solved! You found every clue.',
  caseAlmost: "So close. You found {n} of the clues. Here's the one you missed:",
  caseNotYet: "This one's tricky. Here's how a detective cracks it:",
};

export const GREETINGS = {
  rain: "It's {drizzling/raining} in Mumbai right now. Go and check: drizzle or rain?",
  seaBreeze: 'The sea breeze is blowing right now. Can you feel it near a window?',
  caseUnlocked: 'A new case just landed on our desk.',
  morning: 'Good morning, {name}. What shall we investigate?',
  morningNoName: 'Good morning, Detective. What shall we investigate?',
  afternoon: "Good afternoon, Detective. The sun's working hard on those puddles.",
  evening: 'Good evening, Detective. One quick mystery before dinner?',
};

export const SYSTEM = {
  offlineWhy: "I can't reach my notebook right now. Here are some questions I already know:",
  offlineCase: "No internet, so let's build your answer with clue chips.",
  micDenied: "I need the microphone to hear you. Tap the mic again and say yes, or type your question.",
  micBlocked: "The microphone is switched off for this app. Open Settings to turn it on, or type your question.",
  micFailed: "The microphone did not start. Try once more, or type your question.",
  cameraDenied: "No problem. You can tick the mission without a photo.",
  lockedStop: 'Finish {prereq} to open this Stop.',
  lastChecked: 'Last checked {time}',
  weatherAttribution: 'Weather data by Open-Meteo.com',
  photoSaveFailed: "Couldn't save the photo. The mission still counts.",
  heardNothing: "I didn't catch that. Try again, a bit closer?",
  oops: 'Oops, this page got a bit cloudy.',
  skyDisagree: 'Interesting! The weather service measures one spot. Your window is a real observation too. Both count.',
  cantReachMic: 'Hold on, let me listen again.',
};

export const STOP = {
  hookButton: "Let's find out",
  lockedIn: "Locked in! Now let's test it.",
  lockIt: 'Lock it in',
  check: 'Check',
  gotIt: 'Got it',
  half: 'Explained once! Prove it again on another day to earn the full stamp.',
  spotted: 'Spotted!',
  stamped: 'STAMPED',
  explainTitle: 'Why did that happen?',
  nameTitle: 'Name it',
  leaveTitle: 'Leave this Stop?',
  leaveBody: 'Your progress is saved.',
  keepGoing: 'Keep going',
  leave: 'Leave',
  playLab: 'Play in the Lab',
  todaysMission: "Today's Mission",
  done: 'Done',
  next: 'Next',
  play: 'Play',
  pause: 'Pause',
  replay: 'Replay',
  speed: '2×',
  tryAgain: 'Try again',
  withHelp: 'Opening Why? first means this one will not count towards the stamp.',
  knowItFail: "Let's take the full tour, you'll ace it.",
  knowItWin: 'Mastered! You really do know this one.',
  knowItBlocked: 'Come back tomorrow to try that again.',
  windWentTo: 'That wind is going to the {dir}. Where is it coming from?',
  windMake: 'Make a {dir} wind.',
  checkIt: 'Check',
  helpNote: 'Why? is open, so this answer will not count towards the stamp.',
  twistTitle: 'The Twist',
  yourTurn: 'Your turn',
  hookWords: 'Words',
};

export const HOME = {
  allDone: 'All Stops stamped! Try a Case or the Lab.',
  continue: 'Continue',
  start: 'Start',
  iKnowThis: 'I know this!',
  newCase: 'New case: {title}',
  warmUp: 'Warm-up',
  warmUpBody: 'A quick look back before we start.',
  breakNudge: 'Great detecting! Time for a stretch? Your Stops are saved.',
  breakOk: 'Okay',
  breakMore: '5 more minutes',
  skyWind: 'Wind from the {where}',
  rainToday: 'Rain today: {amount}',
  nextTide: '{kind} tide about {time}',
};

export const LEVEL_LABEL: Record<number, string> = { 0: '', 1: 'Spotted', 2: 'Named', 3: 'Explained', 4: 'Mastered' };
export const RANKS = ['Junior Detective', 'Detective', 'Senior Detective', 'Chief Detective'] as const;
export type RankName = (typeof RANKS)[number];

export const DUEL = {
  title: 'Pair Duel',
  hint: 'Drag the card to a side',
  end: '{n} of {total} on the first try!',
  missed: 'One to look at again:',
  leaveTitle: 'Leave this Duel?',
  perfect: 'All of them on the first try!',
  listen: 'Listen again',
};

export const CASE = {
  folder: 'Case File #{n}',
  clues: 'Clues',
  bigWhy: 'The Big Why',
  explain: 'Explain it like a detective.',
  speak: 'Speak', type: 'Type', build: 'Build it',
  heard: 'I heard:',
  thatsRight: "That's right", tryAgain: 'Try again', typeIt: 'Type it',
  twist: 'The Twist',
  realPlaces: 'Places like this really exist!',
  retryLater: 'You can try this case again tomorrow.',
  slotHint: 'Tap to choose',
};

export const LAB = {
  challenges: 'Challenges',
  yes: 'Yes', no: 'No',
  solved: 'Solved',
  reset: 'Reset',
};

export const DIARY = {
  tabs: ['Missions', 'Sky log', 'Passport', 'Cases'] as const,
  days: 'Diary days: {n}',
  iDidIt: 'I did it',
  addPhoto: 'Take a photo',
  skyPrompt: 'What do you see outside?',
  places: 'Places found: {n} / 20',
  noMissions: 'Finish a Stop to open its mission.',
  needs: 'Needs: {x}',
  solved: 'SOLVED',
};

export const SKY = {
  title: 'Sky Today',
  mumbaiNow: 'Mumbai now',
  seeWhy: 'See why',
  yourCheck: 'Your check',
  rainRace: 'Rain race (last 7 days)',
  observe: ['Sunny', 'Cloudy', 'Drizzle', 'Rain', 'Downpour'],
  walk: 'Low tide about {time}: the path is usually walkable around then. Always check with a grown-up.',
};

export const WHY = {
  title: 'Ask Bindu',
  askOwn: 'Ask your own',
  ask: 'Ask',
  tryLab: 'Try it in the Lab',
  placeholder: 'Type your question',
  max: 140,
};

export const GLOBE = {
  places: 'Places', dayNight: 'Day / Night', borders: 'Borders', flatMap: 'Flat map',
  goToStop: 'Go to Stop',
  findPrefix: 'Find',
  found: 'Found it!',
  closeButNo: 'Not quite. Keep looking.',
};

export const SETUP = {
  hello: "Hello! I'm Bindu.",
  intro2: 'We solve Earth\'s mysteries together.',
  grownUp: 'Grown-up setup',
  setPin: 'Set a 4-digit Parent PIN',
  confirmPin: 'Enter the PIN again',
  pinMismatch: "Those didn't match. Try again.",
  keyOptional: 'Gemini key (optional)',
  later: 'Later',
  createProfile: 'Create the first profile',
  nameLabel: 'Name (up to 12 characters)',
  binduColour: "Bindu's colour",
  onboard: 'We solve Earth\'s mysteries. You change things, watch what happens, and explain why.',
  go: "Let's go",
  skip: 'Skip',
};

export const PARENT = {
  title: 'Parent Zone',
  holdHint: 'Press and hold for 3 seconds',
  pinTitle: 'Enter the Parent PIN',
  locked: 'Too many tries. Try again in {m} minutes.',
  noKeyBanner: 'Add a Gemini key to turn on spoken answers.',
  badKeyBanner: "Your Gemini key isn't working.",
  keyWorks: 'Key works',
  keyFails: "That key didn't work. Check it and try again.",
};
