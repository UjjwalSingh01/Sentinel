/**
 * Sentinel Auth Utilities
 */

export interface AuthUser {
  user_id: string;
  email: string;
  name: string;
  role: string;
}

export function getAccessToken(): string | null {
  return localStorage.getItem('sentinel_access_token');
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('sentinel_refresh_token');
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem('sentinel_access_token', access);
  localStorage.setItem('sentinel_refresh_token', refresh);
}

export function clearTokens(): void {
  localStorage.removeItem('sentinel_access_token');
  localStorage.removeItem('sentinel_refresh_token');
  localStorage.removeItem('sentinel_user');
}

export function setUser(user: AuthUser): void {
  localStorage.setItem('sentinel_user', JSON.stringify(user));
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem('sentinel_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(error.detail || 'Invalid credentials');
  }

  const data = await response.json();
  setTokens(data.access_token, data.refresh_token);
  const user: AuthUser = {
    user_id: data.user_id,
    email: data.email,
    name: data.name,
    role: data.role,
  };
  setUser(user);
  return user;
}

export function logout(): void {
  clearTokens();
  window.location.href = '/login';
}
