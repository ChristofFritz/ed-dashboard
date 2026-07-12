import { Injectable, signal } from '@angular/core';
import type { AuthResponse, PublicUser } from '@ed/shared';
import { api, ApiError } from './api';

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** undefined = still checking; null = signed out; user = signed in. */
  readonly user = signal<PublicUser | null | undefined>(undefined);

  async check(): Promise<void> {
    try {
      const { user } = await api.get<AuthResponse>('/api/auth/me');
      this.user.set(user);
    } catch {
      this.user.set(null);
    }
  }

  async login(email: string, password: string): Promise<void> {
    const { user } = await api.post<AuthResponse>('/api/auth/login', { email, password });
    this.user.set(user);
  }

  async register(email: string, password: string, displayName?: string): Promise<void> {
    const { user } = await api.post<AuthResponse>('/api/auth/register', {
      email,
      password,
      displayName,
    });
    this.user.set(user);
  }

  async logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
    this.user.set(null);
    location.reload();
  }
}
