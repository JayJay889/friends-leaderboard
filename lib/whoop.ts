/**
 * WHOOP OAuth 2.0 client. Mirrors lib/google.ts, with two differences that
 * matter:
 *
 *  1. WHOOP's docs describe no PKCE support, so this flow carries `state` only.
 *  2. The `offline` scope is mandatory — without it no refresh token is issued
 *     at all, and the connection dies at the first token expiry.
 */

const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const API_BASE = "https://api.prod.whoop.com/developer/v2";

export const SCOPES = [
  "offline",
  "read:profile",
  "read:cycles",
  "read:recovery",
  "read:sleep",
  "read:workout",
  "read:body_measurement",
];

export const SCOPE = {
  profile: "read:profile",
  cycles: "read:cycles",
  recovery: "read:recovery",
  sleep: "read:sleep",
} as const;

function clientId(): string {
  const v = process.env.WHOOP_CLIENT_ID;
  if (!v) throw new Error("WHOOP_CLIENT_ID is not set");
  return v;
}

function clientSecret(): string {
  const v = process.env.WHOOP_CLIENT_SECRET;
  if (!v) throw new Error("WHOOP_CLIENT_SECRET is not set");
  return v;
}

export function isConfigured(): boolean {
  return !!process.env.WHOOP_CLIENT_ID && !!process.env.WHOOP_CLIENT_SECRET;
}

export function redirectUri(): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/whoop/callback`;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    state, // WHOOP requires at least 8 characters
  });
  return `${AUTH_URL}?${params}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

async function tokenRequest(body: URLSearchParams, label: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`WHOOP ${label} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest(
    new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }),
    "token exchange",
  );
}

/**
 * WHOOP rotates the refresh token on EVERY refresh and invalidates the old one
 * immediately. Callers must persist the returned refresh_token before doing
 * anything else with the access token — a lost write means the member has to
 * reconnect by hand. `scope` must be resent or the new token loses `offline`.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const tokens = await tokenRequest(
    new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "offline",
    }),
    "token refresh",
  );
  if (!tokens.refresh_token) {
    throw new Error("WHOOP refresh returned no new refresh token — connection would be lost");
  }
  return tokens;
}

/** Revokes this app's access. Also stops webhook delivery for the member. */
export async function revokeToken(accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE}/user/access`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 401/404 = already gone; disconnect must always complete locally.
  if (!res.ok && res.status !== 401 && res.status !== 404) {
    throw new Error(`WHOOP revoke failed (${res.status}): ${await res.text()}`);
  }
}

export async function whoopFetch<T = any>(
  accessToken: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) return res.json();
    const body = await res.text();
    lastError = new Error(`WHOOP API ${res.status} on ${path}: ${body.slice(0, 500)}`);
    if (res.status !== 429 && res.status < 500) throw lastError;
  }
  throw lastError ?? new Error(`WHOOP API failed on ${path}`);
}

/** Pages a collection endpoint until exhausted. `limit` maxes out at 25. */
export async function whoopCollect<T = any>(
  accessToken: string,
  path: string,
  params: Record<string, string>,
  maxPages = 8,
): Promise<T[]> {
  const records: T[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const body = await whoopFetch(accessToken, path, {
      ...params,
      limit: "25",
      ...(nextToken ? { nextToken } : {}),
    });
    records.push(...((body.records ?? []) as T[]));
    nextToken = body.next_token;
    if (!nextToken) break;
  }
  return records;
}

export interface WhoopProfile {
  user_id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
}

export async function fetchProfile(accessToken: string): Promise<WhoopProfile> {
  return whoopFetch<WhoopProfile>(accessToken, "/user/profile/basic");
}
