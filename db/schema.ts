import {
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AvatarOptions } from "@/lib/avatar";

/** Every place a metric can come from. Also the `source` column's value set. */
export const SOURCES = ["google", "whoop", "apple"] as const;
export type Source = (typeof SOURCES)[number];

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  avatarEmoji: text("avatar_emoji").notNull().default("🐣"),
  // Explicit portrait picks from the character builder. Null = seeded portrait.
  avatarOptions: jsonb("avatar_options").$type<AvatarOptions>(),
  // Legacy: superseded by `identities`. Kept nullable so old rows survive the
  // migration; dropped once nothing reads it.
  googleUserId: text("google_user_id").unique(),
  /**
   * Which device wins when two of them report the same day. Null = fall back to
   * connection order. Mirrors how Apple Health resolves competing sources.
   */
  primarySource: text("primary_source").$type<Source>(),
  // Optional; powers the Age Defied board (only the body-vs-real difference is public).
  birthDate: date("birth_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per (provider, provider account) a user has connected. Sign-in is
 * find-or-create against this table, so any provider can be the login — and a
 * user can hold several.
 */
export const identities = pgTable(
  "identities",
  {
    provider: text("provider").$type<Source>().notNull(),
    providerUserId: text("provider_user_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.provider, t.providerUserId] }) }),
);

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").$type<Source>().notNull().default("google"),
    // AES-256-GCM encrypted at rest (see lib/crypto.ts)
    refreshToken: text("refresh_token").notNull(),
    accessToken: text("access_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    grantedScopes: text("granted_scopes").array().notNull().default([]),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.provider] }) }),
);

/**
 * Push-only providers (Apple) authenticate with a bearer token instead of OAuth.
 * Only the hash is stored — the token itself is shown once, at pairing.
 */
export const applePairings = pgTable("apple_pairings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Short code the phone types once to claim its token. Single use. */
  pairCode: text("pair_code").unique(),
  pairCodeExpiresAt: timestamp("pair_code_expires_at", { withTimezone: true }),
  /**
   * SHA-256 of the bearer token, set when the code is redeemed. The raw token
   * is returned exactly once, to the phone, and never stored.
   */
  tokenHash: text("token_hash").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Last successful ingest — drives the "data is arriving" check on setup. */
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** Which device wrote this row. One row per source per day; see resolveRows(). */
    source: text("source").$type<Source>().notNull().default("google"),
    steps: integer("steps"),
    activeZoneMinutes: integer("active_zone_minutes"),
    restingHeartRate: integer("resting_heart_rate"),
    sleepMinutes: integer("sleep_minutes"),
    sleepEfficiency: real("sleep_efficiency"),
    deepMinutes: integer("deep_minutes"),
    remMinutes: integer("rem_minutes"),
    /**
     * RMSSD, milliseconds. Fitbit and WHOOP both report this metric.
     * Apple reports SDNN instead — a different measurement on a different
     * scale — so it lives in its own column and is NEVER written here.
     */
    hrvDailyRmssd: real("hrv_daily_rmssd"),
    /** SDNN, milliseconds. Apple Watch only. Not comparable to RMSSD. */
    hrvSdnn: real("hrv_sdnn"),
    breathingRate: real("breathing_rate"),
    vo2maxEstimate: real("vo2max_estimate"),
    /** WHOOP's own 0–21 day strain. Shown on /me; never used for group ranking. */
    strainNative: real("strain_native"),
    /** WHOOP's own 0–100 recovery. Shown on /me; never used for group ranking. */
    recoveryNative: integer("recovery_native"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.date, t.source] }) }),
);

export type User = typeof users.$inferSelect;
export type Identity = typeof identities.$inferSelect;
export type OauthTokenRow = typeof oauthTokens.$inferSelect;
export type DailyMetricRow = typeof dailyMetrics.$inferSelect;
export type ApplePairing = typeof applePairings.$inferSelect;
