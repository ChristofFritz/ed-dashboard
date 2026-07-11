export type PanelId =
  | 'exploration'
  | 'target'
  | 'mining'
  | 'session'
  | 'route'
  | 'carrier'
  | 'colonisation';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanelMeta {
  id: PanelId;
  title: string;
  /** Dims with the commander's status-stale flag (live-telemetry panels). */
  staleAware: boolean;
  /** Position/size used when the panel is added fresh or on reset. */
  defaultBox: Box;
}

/** Every panel the dashboard can show. Order = add-menu order. */
export const PANELS: PanelMeta[] = [
  { id: 'exploration', title: 'Exploration', staleAware: true, defaultBox: { x: 0, y: 0, w: 8, h: 4 } },
  { id: 'target', title: 'Target', staleAware: true, defaultBox: { x: 8, y: 0, w: 4, h: 4 } },
  { id: 'mining', title: 'Mining', staleAware: true, defaultBox: { x: 0, y: 4, w: 4, h: 4 } },
  { id: 'session', title: 'Session', staleAware: true, defaultBox: { x: 4, y: 4, w: 4, h: 4 } },
  { id: 'route', title: 'Route', staleAware: true, defaultBox: { x: 8, y: 4, w: 4, h: 4 } },
  { id: 'carrier', title: 'Carrier', staleAware: false, defaultBox: { x: 0, y: 8, w: 4, h: 4 } },
  { id: 'colonisation', title: 'Colonisation', staleAware: false, defaultBox: { x: 4, y: 8, w: 8, h: 5 } },
];

export const PANEL_MAP: Record<PanelId, PanelMeta> = Object.fromEntries(
  PANELS.map((p) => [p.id, p]),
) as Record<PanelId, PanelMeta>;

export const isPanelId = (v: unknown): v is PanelId =>
  typeof v === 'string' && v in PANEL_MAP;
