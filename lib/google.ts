import { createHash } from "crypto";
import { randomToken } from "./crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

// The three Google Health API scopes registered on the "friends-leaderboard-web"
// OAuth client, plus `openid` — needed to receive an id_token carrying the stable
// Google user id (`sub`). Without an identity scope the token response contains
// no user identifier at all. `profile` additionally puts the user's name in the
// id_token so new members join with their real name prefilled. Both are
// non-sensitive basic scopes and always allowed.
export const SCOPES = [
  "openid",
  "profile",
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];

export const SCOPE = {
  activity: "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  metrics: "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  sleep: "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
} as const;

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID is not set");
  return v;
}

function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return v;
}

export function redirectUri(): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/callback`;
}

export function makePkce() {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function revokeToken(token: string): Promise<void> {
  // Revoking the refresh token also invalidates derived access tokens.
  const res = await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  // 400 = already revoked/expired; treat as success so disconnect always completes.
  if (!res.ok && res.status !== 400) {
    throw new Error(`Token revoke failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * Extracts the Google user id (`sub`) and name from an id_token. The token
 * arrived directly from Google's token endpoint over TLS, so decoding without
 * signature verification is safe here. Name claims are only present when the
 * `profile` scope was granted.
 */
export function identityFromIdToken(idToken: string): {
  googleUserId: string;
  givenName: string | null;
} {
  const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
  if (!payload.sub) throw new Error("id_token missing sub claim");
  const givenName = payload.given_name ?? payload.name ?? null;
  return {
    googleUserId: String(payload.sub),
    givenName: typeof givenName === "string" && givenName.trim() ? givenName.trim() : null,
  };
}
