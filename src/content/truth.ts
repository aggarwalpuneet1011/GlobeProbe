// Science truth sheet. Every sim, line of copy and AI answer must agree with this.
// It is sent to Gemini with every "Why?" request.
export interface TruthRow { topic: string; truth: string; simplification: string; neverSay: string }

export const TRUTH: TruthRow[] = [
  { topic: 'Water vapour', truth: 'An invisible gas.', simplification: 'Invisible water in the air.', neverSay: '"Steam is vapour." (Visible steam is droplets.)' },
  { topic: 'Clouds', truth: 'Huge numbers of tiny liquid droplets or ice crystals.', simplification: 'Millions of tiny droplets.', neverSay: '"Clouds are vapour / smoke / cotton."' },
  { topic: 'Rising air', truth: 'Expands as pressure falls, and cools.', simplification: 'Air cools as it rises.', neverSay: '"It\'s colder up high because it\'s further from the ground\'s heat" as the only reason.' },
  { topic: 'Sinking air', truth: 'Compresses and warms; relative humidity falls.', simplification: 'Sinking air warms up and dries.', neverSay: '' },
  { topic: 'Rain formation', truth: 'Droplets grow mainly by colliding and merging (and, in cold clouds, via ice).', simplification: 'Droplets bump and join until they\'re too heavy.', neverSay: '"Clouds burst / get squeezed."' },
  { topic: 'Drizzle', truth: 'Drops smaller than 0.5 mm.', simplification: 'Smaller than a grain of sugar.', neverSay: '' },
  { topic: 'Wind naming', truth: 'Named for the direction it comes from.', simplification: 'A west wind comes from the west.', neverSay: '"A west wind blows to the west."' },
  { topic: 'Wind cause', truth: 'Air moves from higher to lower pressure; local heating differences drive breezes.', simplification: 'Air moves in to replace rising warm air.', neverSay: '"The sun pulls the wind."' },
  { topic: 'Land vs water', truth: 'Land heats and cools faster than water.', simplification: 'As stated.', neverSay: '"The sea is hotter in the afternoon."' },
  { topic: 'Rain shadow', truth: 'Moist air is lifted over mountains, rains on the windward side, and descends dry and warmer on the leeward side.', simplification: 'The air drops its rain going up, and comes down dry.', neverSay: '"The mountain blocks the rain like a wall." "It\'s in a shadow."' },
  { topic: 'Mumbai vs Pune', truth: 'Mumbai roughly 2,000 to 2,500 mm/year; Pune roughly 700 mm.', simplification: 'About three times more rain.', neverSay: 'Exact single-year figures.' },
  { topic: 'Monsoon wind', truth: 'The summer monsoon reaches Mumbai mainly from the south-west, June to September.', simplification: 'The monsoon wind comes from the south-west, off the sea.', neverSay: 'Exact onset dates.' },
  { topic: 'Tides', truth: 'Mainly the Moon\'s gravity (plus the Sun); most coasts get two highs and two lows in about 24 h 50 min.', simplification: 'Twice a day, about 50 minutes later each day.', neverSay: '"Waves cause tides." "Tides happen once a day."' },
  { topic: 'Islands', truth: 'Land surrounded by water; size does not matter. Greenland is the largest island; Australia is usually counted as a continent.', simplification: 'Water on every side.', neverSay: '"Islands are small."' },
  { topic: 'Peninsula', truth: 'Land with water on three sides, joined to a larger landmass.', simplification: 'As stated.', neverSay: '' },
  { topic: 'India', truth: 'A peninsula; Kanyakumari is its southern tip; the Arabian Sea is west of Mumbai.', simplification: 'As stated.', neverSay: '' },
  { topic: 'Fog', truth: 'A cloud at ground level.', simplification: 'As stated.', neverSay: '"Fog is smoke."' },
  { topic: 'Deserts', truth: 'Defined by very low precipitation, not heat; Antarctica is a cold desert.', simplification: 'A desert is a place with very little rain.', neverSay: '"Deserts are always hot."' },
];

export function truthSheetText(): string {
  return TRUTH.map((r) => `- ${r.topic}: ${r.truth} Say: ${r.simplification}${r.neverSay ? ' Never say: ' + r.neverSay : ''}`).join('\n');
}
