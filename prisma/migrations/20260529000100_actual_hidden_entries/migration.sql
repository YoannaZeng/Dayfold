CREATE TABLE IF NOT EXISTS "ActualHiddenEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dayId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "groupKind" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActualHiddenEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ActualHiddenEntry_userId_dayId_targetType_groupKind_targetId_key"
  ON "ActualHiddenEntry"("userId", "dayId", "targetType", "groupKind", "targetId");

CREATE INDEX IF NOT EXISTS "ActualHiddenEntry_userId_dayId_idx"
  ON "ActualHiddenEntry"("userId", "dayId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActualHiddenEntry_userId_fkey') THEN
    ALTER TABLE "ActualHiddenEntry" ADD CONSTRAINT "ActualHiddenEntry_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActualHiddenEntry_dayId_fkey') THEN
    ALTER TABLE "ActualHiddenEntry" ADD CONSTRAINT "ActualHiddenEntry_dayId_fkey"
      FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
