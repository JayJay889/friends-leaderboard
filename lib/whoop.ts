import { createHmac, timingSafeEqual } from "crypto";

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

/**
 * Credentials are trimmed on the way in. Copying a value out of a dashboard
 * very easily brings a trailing newline with it, which then rides along into
 * the authorize URL as %0A and gets the request rejected — with an error that
 * points at the credential rather than at the whitespace.
 */
function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const clientId = () => env("WHOOP_CLIENT_ID");
const clientSecret = () => env("WHOOP_CLIENT_SECRET");

export function isConfigured(): boolean {
  return !!process.env.WHOOP_CLIENT_ID?.trim() && !!process.env.WHOOP_CLIENT_SECRET?.trim();
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

/**
 * Verifies a webhook actually came from WHOOP.
 *
 * Their scheme: base64(HMAC-SHA256(timestamp + raw body, client secret)),
 * compared against the X-WHOOP-Signature header. The RAW body matters — parsing
 * and re-serialising the JSON changes the bytes and every signature then fails.
 *
 * Compared in constant time, because a byte-by-byte early exit leaks how much of
 * a forged signature was correct, which is enough to guess one.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
): boolean {
  if (!signature || !timestamp) return false;

  // Replay guard: a captured webhook should not stay valid indefinitely.
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60_000) return false;

  const expected = createHmac("sha256", clientSecret())
    .update(timestamp + rawBody)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The six events WHOOP can send. `deleted` variants matter as much as updates. */
export type WhoopEventType =
  | "workout.updated"
  | "workout.deleted"
  | "sleep.updated"
  | "sleep.deleted"
  | "recovery.updated"
  | "recovery.deleted";

export interface WhoopWebhookEvent {
  user_id: number;
  id: number | string;
  type: WhoopEventType;
  trace_id: string;
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
