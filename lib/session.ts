import { cookies } from "next/headers";
import { sign, verifySignature } from "./crypto";

const COOKIE = "fl_session";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export function sessionCookieValue(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function setSession(userId: string) {
  cookies().set(COOKIE, sessionCookieValue(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}

/** Returns the logged-in user id, or null. */
export function currentUserId(): string | null {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  try {
    return verifySignature(userId, sig) ? userId : null;
  } catch {
    return null;
  }
}
