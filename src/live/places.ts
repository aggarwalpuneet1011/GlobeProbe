// Live data places. Wind etc. for Mumbai, tide for Haji Ali, rain comparison for the rest.
export interface LivePlace { id: string; name: string; lat: number; lon: number; used: string }
export const LIVE_PLACES: LivePlace[] = [
  { id: 'mum', name: 'Mumbai (Marine Drive)', lat: 18.944, lon: 72.823, used: 'Wind, rain, temperature, humidity, weather type' },
  { id: 'hajiali', name: 'Haji Ali (sea)', lat: 18.982, lon: 72.809, used: 'Tide (marine API)' },
  { id: 'pune', name: 'Pune', lat: 18.52, lon: 73.856, used: 'Rain comparison (leeward)' },
  { id: 'sohra', name: 'Cherrapunji (Sohra)', lat: 25.271, lon: 91.732, used: 'Rain comparison (very wet)' },
  { id: 'jsm', name: 'Jaisalmer', lat: 26.915, lon: 70.908, used: 'Rain comparison (desert)' },
  { id: 'chennai', name: 'Chennai', lat: 13.083, lon: 80.27, used: 'Sea breeze from the east (Case 3 link)' },
];
/** The only hosts the app talks to: weather, marine and Gemini. */
export const WEATHER_HOST = 'https://api.open-meteo.com';
export const MARINE_HOST = 'https://marine-api.open-meteo.com';
export const RAIN_RACE_IDS = ['mum', 'pune', 'sohra', 'jsm'] as const;
export const ATTRIBUTION = 'Weather data by Open-Meteo.com';

export function weatherUrl(p: LivePlace): string {
  return `${WEATHER_HOST}/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
    '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day' +
    '&daily=precipitation_sum&past_days=6&forecast_days=1&timezone=Asia%2FKolkata';
}
export function tideUrl(p: LivePlace): string {
  return `${MARINE_HOST}/v1/marine?latitude=${p.lat}&longitude=${p.lon}` +
    '&hourly=sea_level_height_msl&forecast_days=3&cell_selection=sea&timezone=Asia%2FKolkata';
}
