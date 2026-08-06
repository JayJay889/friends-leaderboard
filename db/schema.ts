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

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  avatarEmoji: text("avatar_emoji").notNull().default("🐣"),
  // Explicit portrait picks from the character builder. Null = seeded portrait.
  avatarOptions: jsonb("avatar_options").$type<AvatarOptions>(),
  googleUserId: text("google_user_id").notNull().unique(),
  // Optional; powers the Age Defied board (only the body-vs-real difference is public).
  birthDate: date("birth_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oauthTokens = pgTable("oauth_tokens", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // AES-256-GCM encrypted at rest (see lib/crypto.ts)
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  grantedScopes: text("granted_scopes").array().notNull().default([]),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    steps: integer("steps"),
    activeZoneMinutes: integer("active_zone_minutes"),
    restingHeartRate: integer("resting_heart_rate"),
    sleepMinutes: integer("sleep_minutes"),
    sleepEfficiency: real("sleep_efficiency"),
    deepMinutes: integer("deep_minutes"),
    remMinutes: integer("rem_minutes"),
    hrvDailyRmssd: real("hrv_daily_rmssd"),
    breathingRate: real("breathing_rate"),
    vo2maxEstimate: real("vo2max_estimate"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.date] }) }),
);

export type User = typeof users.$inferSelect;
export type OauthTokenRow = typeof oauthTokens.$inferSelect;
export type DailyMetricRow = typeof dailyMetrics.$inferSelect;
