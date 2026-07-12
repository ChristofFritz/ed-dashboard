import { config } from './config.js';
import { getDb, migrate } from './db/pg.js';
import { EventStore } from './db/event-store.js';
import { UserRepo } from './auth/users.js';
import { IngestTokenRepo } from './auth/ingest-tokens.js';
import { Publisher } from './pusher/publisher.js';
import { SessionManager } from './users/session-manager.js';
import { createHttpServer } from './server/http.js';

async function main() {
  console.log('ed-dashboard server starting');

  const db = getDb();
  await migrate(db);
  console.log('postgres ready');

  const events = new EventStore(db);
  const users = new UserRepo(db);
  const tokens = new IngestTokenRepo(db);
  const publisher = new Publisher();
  const sessions = new SessionManager(db, events, publisher);

  const server = createHttpServer({ sessions, events, users, tokens, publisher });
  server.listen(config.port, config.host, () => {
    console.log(`listening on http://${config.host}:${config.port}`);
  });
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
