ALTER TABLE "ProgressEntry"
ADD COLUMN "startMinute" INTEGER,
ADD COLUMN "endMinute" INTEGER;

ALTER TABLE "ProgressEntry"
ALTER COLUMN "planItemId" DROP NOT NULL;

UPDATE "ProgressEntry"
SET
  "startMinute" = LEAST(
    1439,
    (EXTRACT(HOUR FROM "createdAt")::INTEGER * 60) + EXTRACT(MINUTE FROM "createdAt")::INTEGER
  ),
  "endMinute" = LEAST(
    1439,
    ((EXTRACT(HOUR FROM "createdAt")::INTEGER * 60) + EXTRACT(MINUTE FROM "createdAt")::INTEGER) + 30
  );

ALTER TABLE "ProgressEntry"
ALTER COLUMN "startMinute" SET NOT NULL,
ALTER COLUMN "endMinute" SET NOT NULL;

DROP INDEX IF EXISTS "ProgressEntry_userId_dayId_createdAt_idx";
CREATE INDEX "ProgressEntry_userId_dayId_startMinute_createdAt_idx"
ON "ProgressEntry"("userId", "dayId", "startMinute", "createdAt");

ALTER TABLE "ProgressEntry"
DROP COLUMN "source";

DROP TYPE IF EXISTS "ProgressEntrySource";
