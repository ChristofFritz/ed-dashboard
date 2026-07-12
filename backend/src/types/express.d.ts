import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireAuth (session cookie) or requireIngestToken (bearer). */
    userId?: number;
  }
}
