import { Injectable, signal } from '@angular/core';
import type {
  AppState,
  CarrierState,
  CommanderState,
  ExplorationState,
  JournalEvent,
  MiningState,
  ServerMessage,
  SessionState,
  TargetState,
} from '@ed/shared';

const MAX_TICKER_EVENTS = 100;

@Injectable({ providedIn: 'root' })
export class WsService {
  readonly connected = signal(false);

  readonly exploration = signal<ExplorationState | null>(null);
  readonly target = signal<TargetState | null>(null);
  readonly mining = signal<MiningState | null>(null);
  readonly session = signal<SessionState | null>(null);
  readonly commander = signal<CommanderState | null>(null);
  readonly carrier = signal<CarrierState | null>(null);

  /** Newest first, capped. */
  readonly recentEvents = signal<JournalEvent[]>([]);

  private socket: WebSocket | null = null;
  private retryDelay = 500;

  constructor() {
    this.connect();
  }

  private connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.socket = new WebSocket(`${proto}://${location.host}/ws`);

    this.socket.onopen = () => {
      this.connected.set(true);
      this.retryDelay = 500;
    };
    this.socket.onmessage = (ev) => {
      try {
        this.handle(JSON.parse(ev.data as string) as ServerMessage);
      } catch (err) {
        console.error('bad ws message', err);
      }
    };
    this.socket.onclose = () => {
      this.connected.set(false);
      this.socket = null;
      setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 10_000);
    };
  }

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case 'snapshot':
        this.applyState(msg.state);
        break;
      case 'slice':
        this.applySlice(msg.slice, msg.data);
        break;
      case 'event':
        this.recentEvents.update((list) => [msg.data, ...list].slice(0, MAX_TICKER_EVENTS));
        break;
    }
  }

  private applyState(state: AppState): void {
    this.exploration.set(state.exploration);
    this.target.set(state.target);
    this.mining.set(state.mining);
    this.session.set(state.session);
    this.commander.set(state.commander);
    this.carrier.set(state.carrier);
  }

  private applySlice<K extends keyof AppState>(slice: K, data: AppState[K]): void {
    (this[slice] as ReturnType<typeof signal<AppState[K] | null>>).set(data);
  }
}
