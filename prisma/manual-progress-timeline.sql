-- Safely upgrade ProgressEntry to the timeline-based schema without resetting the database.
-- This is intentionally idempotent for local recovery use.

ALTER TABLE "ProgressEntry"
ADD COLUMN IF NOT EXISTS "startMinute" INTEGER,
ADD COLUMN IF NOT EXISTS "endMinute" INTEGER;

UPDATE "ProgressEntry"
SET
  "startMinute" = LEAST(
    1439,
    (EXTRACT(HOUR FROM "createdAt")::INTEGER * 60) + EXTRACT(MINUTE FROM "createdAt")::INTEGER
  )
WHERE "startMinute" IS NULL;

UPDATE "ProgressEntry"
SET
  "endMinute" = LEAST(
    1439,
    COALESCE("startMinute", 0) + 30
  )
WHERE "endMinute" IS NULL;

ALTER TABLE "ProgressEntry"
ALTER COLUMN "planItemId" DROP NOT NULL,
ALTER COLUMN "startMinute" SET NOT NULL,
ALTER COLUMN "endMinute" SET NOT NULL;

DROP INDEX IF EXISTS "ProgressEntry_userId_dayId_createdAt_idx";

CREATE INDEX IF NOT EXISTS "ProgressEntry_userId_dayId_startMinute_createdAt_idx"
ON "ProgressEntry"("userId", "dayId", "startMinute", "createdAt");

ALTER TABLE "ProgressEntry"
DROP COLUMN IF EXISTS "source";

DROP TYPE IF EXISTS "ProgressEntrySource";
