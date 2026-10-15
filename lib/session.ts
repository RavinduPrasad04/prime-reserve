import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "pr_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set.");
  }
  return "prime-reserve-dev-session-secret";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
};

export async function setSession(userId: string) {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${exp}`;
  const value = `${payload}.${sign(payload)}`;
  const jar = await cookies();
  jar.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function readSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, signature] = parts;
  const payload = `${userId}.${exp}`;
  const expected = sign(payload);
  try {
    if (
      !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  if (Number(exp) < Date.now()) return null;
  return userId;
}
