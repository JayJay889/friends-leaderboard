import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy singleton so `next build` never needs DATABASE_URL.
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const client = postgres(url, { max: 1, ssl: url.includes("localhost") ? false : "require" });
    _db = drizzle(client, { schema });
  }
  return _db;
}

export { schema };
