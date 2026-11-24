import { createHash } from "node:crypto";
import { getDatabase } from "@/lib/db";

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("Too many requests. Try again later.");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function enforceRateLimit(identity: string, action: string, limit: number, windowMs: number, now = new Date()) {
  const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + windowMs * 2);
  const key = createHash("sha256").update(`${action}:${identity}:${windowStart.toISOString()}`).digest("hex");
  const bucket = await getDatabase().rateLimitBucket.upsert({
    where: { key }, create: { key, windowStart, expiresAt, count: 1 }, update: { count: { increment: 1 }, expiresAt },
  });
  if (bucket.count > limit) throw new RateLimitError(Math.max(1, Math.ceil((windowStartMs + windowMs - now.getTime()) / 1000)));
  return { remaining: Math.max(0, limit - bucket.count), resetAt: new Date(windowStartMs + windowMs) };
}

export function clientIdentity(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
