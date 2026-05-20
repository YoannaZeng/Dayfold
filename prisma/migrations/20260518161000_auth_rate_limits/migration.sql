CREATE TABLE "AuthRateLimit" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthRateLimit_scope_identifier_key" ON "AuthRateLimit"("scope", "identifier");
CREATE INDEX "AuthRateLimit_blockedUntil_idx" ON "AuthRateLimit"("blockedUntil");
