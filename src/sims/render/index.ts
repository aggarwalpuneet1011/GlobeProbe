import type { Sim } from '../engine';
import type { Sim2D } from '../index';
import type { Bounds, Interaction, Renderer } from './SimView';
import { renderEvap, evapBounds, evapSummary } from './evap';
import { renderCloud, cloudBounds, cloudSummary, cloudInteraction } from './cloud';
import { renderRain, rainBounds, rainSummary, rainInteraction } from './rain';
import { renderWind, windBounds, windSummary, windInteraction } from './wind';
import { renderBreeze, breezeBounds, breezeSummary } from './breeze';
import { renderMountain, mountainBounds, mountainSummary, mountainInteraction } from './mountain';
import { renderTide, tideBounds, tideSummary, tideInteraction } from './tide';

export interface RenderKit {
  render: Renderer<any>;
  bounds: Bounds<any>;
  summary: (s: any) => string;
  /** Direct manipulation on the canvas (drag the peak, hold the cloud ...). null = controls only. */
  interaction: ((s: any) => Interaction) | null;
}
const none: Bounds<any> = () => null;

export const RENDER_KITS: Record<Sim2D, RenderKit> = {
  SIM_EVAP: { render: renderEvap, bounds: evapBounds, summary: evapSummary, interaction: null },
  SIM_CLOUD: { render: renderCloud, bounds: cloudBounds, summary: cloudSummary, interaction: cloudInteraction },
  SIM_RAIN: { render: renderRain, bounds: rainBounds, summary: rainSummary, interaction: rainInteraction },
  SIM_WIND: { render: renderWind, bounds: windBounds, summary: windSummary, interaction: windInteraction },
  SIM_BREEZE: { render: renderBreeze, bounds: breezeBounds, summary: breezeSummary, interaction: null },
  SIM_MOUNTAIN: { render: renderMountain, bounds: mountainBounds, summary: mountainSummary, interaction: mountainInteraction },
  SIM_TIDE: { render: renderTide, bounds: tideBounds, summary: tideSummary, interaction: tideInteraction },
};
void none;
export type { Sim };
