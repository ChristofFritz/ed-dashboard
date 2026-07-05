import { WebSocketServer, WebSocket } from 'ws';
import type http from 'node:http';
import type { ServerMessage, SliceName } from '@ed/shared';
import type { StateStore } from '../state/store.js';

export function attachWebSocket(server: http.Server, store: StateStore): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcast = (msg: ServerMessage) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'snapshot', state: store.getState() } satisfies ServerMessage));
  });

  store.subscribe({
    onSlices(dirty: SliceName[], state) {
      for (const slice of dirty) {
        broadcast({ type: 'slice', slice, data: state[slice] });
      }
    },
    onEvent(event) {
      broadcast({ type: 'event', data: event });
    },
  });

  // Keepalive: terminate dead connections so broadcasts don't pile up.
  const interval = setInterval(() => {
    for (const client of wss.clients) client.ping();
  }, 30_000);
  wss.on('close', () => clearInterval(interval));

  return wss;
}
