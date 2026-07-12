import Pusher from 'pusher';
import type { ServerMessage } from '@ed/shared';
import { config } from '../config.js';

export function channelFor(userId: number): string {
  return `private-user-${userId}`;
}

/**
 * Publishes per-user state changes to Soketi (Pusher protocol). The dashboard
 * subscribes to the user's private channel; Soketi asks us to authorise it via
 * authorizeChannel() in the pusher-auth route.
 */
export class Publisher {
  private readonly pusher: Pusher;

  constructor() {
    this.pusher = new Pusher({
      appId: config.pusher.appId,
      key: config.pusher.key,
      secret: config.pusher.secret,
      host: config.pusher.host,
      port: String(config.pusher.port),
      useTLS: config.pusher.useTLS,
    });
  }

  publish(userId: number, msg: ServerMessage): void {
    // Snapshots are fetched over HTTP; only incremental messages go on the wire.
    if (msg.type === 'snapshot') return;
    this.pusher
      .trigger(channelFor(userId), msg.type, msg)
      .catch((err) => console.error('soketi publish failed:', err instanceof Error ? err.message : err));
  }

  /** Sign a private-channel subscription for a given socket (Soketi auth). */
  authorize(socketId: string, channel: string): Pusher.AuthResponse {
    return this.pusher.authorizeChannel(socketId, channel);
  }
}
