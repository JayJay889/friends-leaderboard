import type { Source } from "@/db/schema";

/**
 * The normalized shape every provider writes. Columns map 1:1 onto
 * `daily_metrics`, so adding a device never changes the scoring code.
 */
export type PartialMetrics = {
  steps?: number | null;
  activeZoneMinutes?: number | null;
  restingHeartRate?: number | null;
  sleepMinutes?: number | null;
  sleepEfficiency?: number | null;
  deepMinutes?: number | null;
  remMinutes?: number | null;
  /** RMSSD, ms. Fitbit and WHOOP. Never Apple — see hrvSdnn. */
  hrvDailyRmssd?: number | null;
  /** SDNN, ms. Apple only. A different metric, not a different unit. */
  hrvSdnn?: number | null;
  breathingRate?: number | null;
  vo2maxEstimate?: number | null;
  strainNative?: number | null;
  recoveryNative?: number | null;
};

/**
 * Pull-based providers implement this. Push-based ones (Apple) have no fetch at
 * all — their data arrives at /api/ingest/apple and goes through the same
 * merge-and-upsert path in lib/sync.ts.
 */
export type ProviderFetch = (
  accessToken: string,
  grantedScopes: string[],
  dates: string[],
) => Promise<{ perDate: Map<string, PartialMetrics>; errors: string[] }>;

export function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDateUTC(d);
}

export function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    out.push(isoDateUTC(d));
  }
  return out.reverse();
}

/**
 * Converts an instant plus a WHOOP-style UTC offset ("+02:00", "Z") into the
 * calendar date the user experienced. Every provider must agree on this or the
 * boards silently misalign by a day.
 */
export function localDateOf(instant: string, timezoneOffset: string | null | undefined): string {
  const t = Date.parse(instant);
  if (Number.isNaN(t)) throw new Error(`Unparseable timestamp: ${instant}`);
  let offsetMinutes = 0;
  if (timezoneOffset && timezoneOffset !== "Z") {
    const m = /^([+-])(\d{2}):?(\d{2})$/.exec(timezoneOffset);
    if (m) {
      const sign = m[1] === "-" ? -1 : 1;
      offsetMinutes = sign * (Number(m[2]) * 60 + Number(m[3]));
    }
  }
  return isoDateUTC(new Date(t + offsetMinutes * 60_000));
}

export const PROVIDER_LABELS: Record<Source, string> = {
  google: "Fitbit",
  whoop: "WHOOP",
  apple: "Apple Watch",
};
