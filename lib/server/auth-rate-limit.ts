import { db } from "@/lib/db";

export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("操作太频繁，请稍后再试。");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function secondsUntil(date: Date) {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase().slice(0, 180) || "unknown";
}

export async function consumeRateLimit(params: {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  blockSeconds: number;
}) {
  const now = new Date();
  const identifier = normalizeIdentifier(params.identifier);
  const existing = await db.authRateLimit.findUnique({
    where: {
      scope_identifier: {
        scope: params.scope,
        identifier
      }
    }
  });

  if (existing?.blockedUntil && existing.blockedUntil > now) {
    throw new RateLimitError(secondsUntil(existing.blockedUntil));
  }

  const windowExpired = !existing || now.getTime() - existing.windowStart.getTime() > params.windowSeconds * 1000;
  const nextAttemptCount = windowExpired ? 1 : existing.attemptCount + 1;
  const shouldBlock = nextAttemptCount > params.limit;
  const blockedUntil = shouldBlock ? new Date(now.getTime() + params.blockSeconds * 1000) : null;

  await db.authRateLimit.upsert({
    where: {
      scope_identifier: {
        scope: params.scope,
        identifier
      }
    },
    update: {
      attemptCount: nextAttemptCount,
      windowStart: windowExpired ? now : existing.windowStart,
      blockedUntil
    },
    create: {
      scope: params.scope,
      identifier,
      attemptCount: nextAttemptCount,
      windowStart: now,
      blockedUntil
    }
  });

  if (shouldBlock && blockedUntil) {
    throw new RateLimitError(secondsUntil(blockedUntil));
  }
}

export async function resetRateLimit(scope: string, identifier: string) {
  await db.authRateLimit.deleteMany({
    where: {
      scope,
      identifier: normalizeIdentifier(identifier)
    }
  });
}
