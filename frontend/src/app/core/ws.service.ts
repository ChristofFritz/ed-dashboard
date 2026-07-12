import { Injectable, signal } from '@angular/core';
import Pusher from 'pusher-js';
import type {
  AppState,
  CarrierState,
  ColonisationState,
  CommanderState,
  DashboardConfig,
  ExplorationState,
  JournalEvent,
  MiningState,
  ServerMessage,
  SessionState,
  TargetState,
} from '@ed/shared';
import { api } from './api';

const MAX_TICKER_EVENTS = 100;

/**
 * Live dashboard state. Fetches an initial snapshot over HTTP, then subscribes
 * to the user's private Soketi (Pusher) channel for incremental slice/event
 * updates. Channel subscription is authorised by the server (/api/pusher/auth).
 */
@Injectable({ providedIn: 'root' })
export class WsService {
  readonly connected = signal(false);

  readonly exploration = signal<ExplorationState | null>(null);
  readonly target = signal<TargetState | null>(null);
  readonly mining = signal<MiningState | null>(null);
  readonly session = signal<SessionState | null>(null);
  readonly commander = signal<CommanderState | null>(null);
  readonly carrier = signal<CarrierState | null>(null);
  readonly colonisation = signal<ColonisationState | null>(null);

  /** Newest first, capped. */
  readonly recentEvents = signal<JournalEvent[]>([]);

  private pusher: Pusher | null = null;

  constructor() {
    void this.start();
  }

  private async start(): Promise<void> {
    let cfg: DashboardConfig;
    try {
      cfg = await api.get<DashboardConfig>('/api/config');
    } catch (err) {
      console.error('failed to load dashboard config', err);
      return;
    }

    // Initial snapshot before subscribing, so the UI has full state immediately.
    try {
      this.applyState(await api.get<AppState>('/api/state'));
    } catch (err) {
      console.error('failed to load state snapshot', err);
    }

    // Default to the host the dashboard is served from (so remote/LAN/hosted
    // access works), and to wss automatically when the page is HTTPS. The
    // server can still override host/port/TLS via SOKETI_PUBLIC_* if needed.
    const isHttps = location.protocol === 'https:';
    const wsHost = cfg.pusher.wsHost || location.hostname;
    const forceTLS = cfg.pusher.forceTLS || isHttps;

    const pusher = new Pusher(cfg.pusher.key, {
      wsHost,
      wsPort: cfg.pusher.wsPort,
      wssPort: cfg.pusher.wsPort,
      forceTLS,
      enabledTransports: ['ws', 'wss'],
      cluster: cfg.pusher.cluster,
      channelAuthorization: {
        endpoint: '/api/pusher/auth',
        transport: 'ajax',
      },
    });
    this.pusher = pusher;

    pusher.connection.bind('connected', () => this.connected.set(true));
    pusher.connection.bind('disconnected', () => this.connected.set(false));
    pusher.connection.bind('unavailable', () => this.connected.set(false));
    pusher.connection.bind('failed', () => this.connected.set(false));

    const channel = pusher.subscribe(cfg.channel);
    channel.bind('slice', (msg: Extract<ServerMessage, { type: 'slice' }>) =>
      this.applySlice(msg.slice, msg.data),
    );
    channel.bind('event', (msg: Extract<ServerMessage, { type: 'event' }>) =>
      this.recentEvents.update((list) => [msg.data, ...list].slice(0, MAX_TICKER_EVENTS)),
    );

    // Re-sync the snapshot after a reconnect (we may have missed slice updates).
    pusher.connection.bind('connected', () => {
      void api
        .get<AppState>('/api/state')
        .then((s) => this.applyState(s))
        .catch(() => {});
    });
  }

  private applyState(state: AppState): void {
    this.exploration.set(state.exploration);
    this.target.set(state.target);
    this.mining.set(state.mining);
    this.session.set(state.session);
    this.commander.set(state.commander);
    this.carrier.set(state.carrier);
    this.colonisation.set(state.colonisation);
  }

  private applySlice<K extends keyof AppState>(slice: K, data: AppState[K]): void {
    (this[slice] as ReturnType<typeof signal<AppState[K] | null>>).set(data);
  }
}
