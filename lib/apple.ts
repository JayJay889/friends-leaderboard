import { createHash, randomBytes } from "crypto";
import type { PartialMetrics } from "./providers/types";

/**
 * Apple Watch ingest.
 *
 * Apple runs no server we can ask for data — HealthKit lives on the phone — so
 * this provider is the only push-shaped one: the phone posts days to
 * /api/ingest/apple and this module turns whatever it sent into the same
 * normalized metrics every other provider produces.
 */

/**
 * Apple exercise minutes are not Fitbit Active Zone Minutes. Apple counts any
 * minute at brisk-walk intensity or above; AZM weights moderate effort once and
 * vigorous effort twice. This constant is the bridge, and it is a PLACEHOLDER —
 * compare median weekly values per source once real Apple data exists and set it
 * from that, rather than trusting this number.
 */
export const EXERCISE_MINUTES_TO_AZM = 1.4;

/** Ambiguous characters removed: someone reads this off a screen and types it. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export const PAIR_CODE_TTL_MIN = 15;

export function newPairCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Ranges a real human body produces. Anything outside is dropped with a warning
 * rather than stored: unlike Fitbit and WHOOP, Apple data is whatever the phone
 * chose to send, so it is the one source that can be typed by hand.
 */
const LIMITS: Record<string, [number, number]> = {
  steps: [0, 200_000],
  exerciseMinutes: [0, 1440],
  restingHeartRate: [25, 200],
  sleepMinutes: [0, 1200],
  sleepEfficiency: [0, 100],
  deepMinutes: [0, 1200],
  remMinutes: [0, 1200],
  hrvSdnn: [1, 500],
  breathingRate: [3, 60],
  vo2max: [10, 95],
};

export interface AppleDay {
  date: string;
  steps?: number | null;
  exerciseMinutes?: number | null;
  restingHeartRate?: number | null;
  sleepMinutes?: number | null;
  sleepEfficiency?: number | null;
  deepMinutes?: number | null;
  remMinutes?: number | null;
  hrvSdnn?: number | null;
  breathingRate?: number | null;
  vo2max?: number | null;
}

export interface ParseResult {
  perDate: Map<string, PartialMetrics>;
  warnings: string[];
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Accepts the loose date formats exporters emit — "2026-08-08",
 * "2026-08-08 23:30:00 +0200", ISO instants — and returns the calendar day the
 * wearer experienced. Offsets are honoured rather than converted to UTC, since
 * a workout at 23:30 local belongs to that local day.
 */
export function localDayOf(value: string): string | null {
  const trimmed = value.trim();
  const plain = /^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/.exec(trimmed);
  const offset = /([+-]\d{2}:?\d{2})$/.exec(trimmed);
  if (plain && !offset) return plain[1];
  if (plain && offset) return plain[1]; // already written in local time
  const t = Date.parse(trimmed);
  return Number.isNaN(t) ? null : isoDate(new Date(t));
}

function accept(
  field: keyof typeof LIMITS,
  value: unknown,
  date: string,
  warnings: string[],
): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n)) {
    warnings.push(`${date}: ${field} was not a number, ignored`);
    return null;
  }
  const [lo, hi] = LIMITS[field];
  if (n < lo || n > hi) {
    warnings.push(`${date}: ${field}=${n} is outside ${lo}–${hi}, ignored`);
    return null;
  }
  return n;
}

/** Health Auto Export metric names → our fields. */
const HAE_METRICS: Record<string, keyof typeof LIMITS> = {
  step_count: "steps",
  apple_exercise_time: "exerciseMinutes",
  resting_heart_rate: "restingHeartRate",
  heart_rate_variability: "hrvSdnn",
  respiratory_rate: "breathingRate",
  vo2_max: "vo2max",
};

/** Pulls `{ data: { metrics: [...] } }` exports into our per-day shape. */
function fromHealthAutoExport(body: any): AppleDay[] {
  const metrics = body?.data?.metrics;
  if (!Array.isArray(metrics)) return [];
  const byDate = new Map<string, AppleDay>();
  const day = (date: string): AppleDay => {
    if (!byDate.has(date)) byDate.set(date, { date });
    return byDate.get(date)!;
  };

  for (const metric of metrics) {
    const points = Array.isArray(metric?.data) ? metric.data : [];

    if (metric?.name === "sleep_analysis") {
      for (const p of points) {
        // Attribute to the wake-up day, matching every other provider.
        const date = localDayOf(String(p?.sleepEnd ?? p?.date ?? ""));
        if (!date) continue;
        const d = day(date);
        const hours = (v: unknown) => (typeof v === "number" ? Math.round(v * 60) : null);
        const asleep =
          hours(p?.asleep) ??
          (typeof p?.totalSleep === "number" ? Math.round(p.totalSleep * 60) : null);
        const inBed = hours(p?.inBed);
        d.sleepMinutes = asleep;
        // Apple's "core" is light sleep; deep must not absorb it.
        d.deepMinutes = hours(p?.deep);
        d.remMinutes = hours(p?.rem);
        if (asleep != null && inBed && inBed > 0) {
          d.sleepEfficiency = Math.round((asleep / inBed) * 1000) / 10;
        }
      }
      continue;
    }

    const field = HAE_METRICS[metric?.name];
    if (!field) continue;
    for (const p of points) {
      const date = localDayOf(String(p?.date ?? ""));
      if (!date) continue;
      const qty = p?.qty ?? p?.Avg ?? p?.avg;
      if (qty == null) continue;
      (day(date) as any)[field] = qty;
    }
  }
  return [...byDate.values()];
}

/** Normalizes any accepted body into days, or throws if the shape is unusable. */
export function readPayload(body: any): AppleDay[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.days)) return body.days;
  const hae = fromHealthAutoExport(body);
  if (hae.length > 0) return hae;
  throw new Error(
    'Unrecognised body. Send {"days":[{"date":"YYYY-MM-DD", ...}]} or a Health Auto Export payload.',
  );
}

export const MAX_DAYS_PER_POST = 120;
const MAX_AGE_DAYS = 90;

/**
 * Validates and converts days into the same metric shape the pull-based
 * providers produce. Bad values are dropped with a warning instead of failing
 * the whole post, so one nonsense field never costs a friend their whole week.
 */
export function parseAppleDays(days: AppleDay[], today = new Date()): ParseResult {
  const warnings: string[] = [];
  const perDate = new Map<string, PartialMetrics>();

  const todayIso = isoDate(today);
  const oldest = isoDate(new Date(today.getTime() - MAX_AGE_DAYS * 86_400_000));

  for (const raw of days.slice(0, MAX_DAYS_PER_POST)) {
    const date = raw?.date ? localDayOf(String(raw.date)) : null;
    if (!date) {
      warnings.push(`skipped an entry with no usable date`);
      continue;
    }
    if (date > todayIso) {
      warnings.push(`${date}: in the future, ignored`);
      continue;
    }
    if (date < oldest) {
      warnings.push(`${date}: older than ${MAX_AGE_DAYS} days, ignored`);
      continue;
    }

    const v = (f: keyof typeof LIMITS) => accept(f, (raw as any)[f], date, warnings);
    const sleepMinutes = v("sleepMinutes");
    let deep = v("deepMinutes");
    let rem = v("remMinutes");
    // Stages cannot exceed the night that contains them.
    if (sleepMinutes != null && deep != null && deep > sleepMinutes) {
      warnings.push(`${date}: deep sleep exceeded total sleep, ignored`);
      deep = null;
    }
    if (sleepMinutes != null && rem != null && rem > sleepMinutes) {
      warnings.push(`${date}: REM sleep exceeded total sleep, ignored`);
      rem = null;
    }

    const exercise = v("exerciseMinutes");
    const metrics: PartialMetrics = {
      steps: v("steps"),
      activeZoneMinutes: exercise == null ? null : Math.round(exercise * EXERCISE_MINUTES_TO_AZM),
      restingHeartRate: v("restingHeartRate"),
      sleepMinutes,
      sleepEfficiency: v("sleepEfficiency"),
      deepMinutes: deep,
      remMinutes: rem,
      // SDNN — deliberately never written to hrvDailyRmssd, which is RMSSD.
      hrvSdnn: v("hrvSdnn"),
      breathingRate: v("breathingRate"),
      vo2maxEstimate: v("vo2max"),
    };

    const hasAnything = Object.values(metrics).some((x) => x != null);
    if (hasAnything) perDate.set(date, metrics);
    else warnings.push(`${date}: no usable values`);
  }

  if (days.length > MAX_DAYS_PER_POST) {
    warnings.push(`only the first ${MAX_DAYS_PER_POST} days of this post were read`);
  }
  return { perDate, warnings };
}
