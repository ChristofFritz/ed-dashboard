import bcrypt from 'bcryptjs';
import type { PublicUser } from '@ed/shared';
import type { Db } from '../db/pg.js';

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: Date;
}

function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at.toISOString(),
  };
}

export class UserRepo {
  constructor(private readonly db: Db) {}

  async create(email: string, password: string, displayName: string | null): Promise<PublicUser> {
    const hash = await bcrypt.hash(password, 10);
    const r = await this.db.query<UserRow>(
      `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING *`,
      [email.toLowerCase(), hash, displayName],
    );
    return toPublic(r.rows[0]!);
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const r = await this.db.query<UserRow>(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
    return r.rows[0] ?? null;
  }

  async findById(id: number): Promise<PublicUser | null> {
    const r = await this.db.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
    return r.rows[0] ? toPublic(r.rows[0]) : null;
  }

  /** Verify credentials; returns the public user on success, null otherwise. */
  async verify(email: string, password: string): Promise<PublicUser | null> {
    const row = await this.findByEmail(email);
    if (!row) return null;
    return (await bcrypt.compare(password, row.password_hash)) ? toPublic(row) : null;
  }
}
