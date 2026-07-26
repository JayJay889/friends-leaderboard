/**
 * Minimal client for the Google Health API (v4).
 * Verified against https://developers.google.com/health/reference/rest (July 2026).
 *
 * Endpoint shapes:
 *   POST /v4/users/me/dataTypes/{type}/dataPoints:dailyRollUp   — civil-time daily aggregates
 *   GET  /v4/users/me/dataTypes/{type}/dataPoints:reconcile     — single reconciled stream
 *                                                                  across all data sources
 */

const BASE = "https://health.googleapis.com/v4";

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export function toCivilDate(isoDate: string): CivilDate {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
}

export function civilToIso(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

async function healthFetch(accessToken: string, path: string, init?: RequestInit): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (res.ok) return res.json();
    const body = await res.text();
    lastError = new Error(`Health API ${res.status} on ${path}: ${body.slice(0, 500)}`);
    // Retry only on rate limiting / transient server errors.
    if (res.status !== 429 && res.status < 500) throw lastError;
  }
  throw lastError;
}

/**
 * Daily civil-time roll-up for interval data types (steps, active-zone-minutes, …).
 * `start`/`endExclusive` are ISO dates; the range is closed-open per the docs.
 */
export async function dailyRollUp(
  accessToken: string,
  dataType: string,
  start: string,
  endExclusive: string,
): Promise<any[]> {
  const points: any[] = [];
  let pageToken: string | undefined;
  do {
    const body: Record<string, unknown> = {
      range: { start: toCivilDate(start), end: toCivilDate(endExclusive) },
      windowSizeDays: 1,
    };
    if (pageToken) body.pageToken = pageToken;
    const json = await healthFetch(
      accessToken,
      `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
      { method: "POST", body: JSON.stringify(body) },
    );
    points.push(...(json.rollupDataPoints ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return points;
}

/**
 * Reconciled data points for a data type, optionally filtered (AIP-160 syntax).
 * Falls back to an unfiltered request if the filter expression is rejected —
 * callers must then filter client-side.
 */
export async function reconcile(
  accessToken: string,
  dataType: string,
  filter?: string,
): Promise<any[]> {
  const points: any[] = [];
  let pageToken: string | undefined;
  let useFilter = Boolean(filter);
  do {
    const params = new URLSearchParams();
    if (useFilter && filter) params.set("filter", filter);
    if (pageToken) params.set("pageToken", pageToken);
    const qs = params.toString();
    let json: any;
    try {
      json = await healthFetch(
        accessToken,
        `/users/me/dataTypes/${dataType}/dataPoints:reconcile${qs ? `?${qs}` : ""}`,
      );
    } catch (e) {
      // If the server rejects our filter expression (400), retry without it once.
      if (useFilter && String(e).includes("400")) {
        useFilter = false;
        pageToken = undefined;
        points.length = 0;
        continue;
      }
      throw e;
    }
    points.push(...(json.dataPoints ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return points;
}

/** Digs the first numeric value out of an object trying several key spellings. */
export function pickNumber(obj: any, keys: string[]): number | null {
  if (obj == null) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}
