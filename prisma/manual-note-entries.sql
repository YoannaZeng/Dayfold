-- Safely add structured day note entries without resetting the local database.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NoteEntryKind') THEN
    CREATE TYPE "NoteEntryKind" AS ENUM ('PLAIN', 'PROJECT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "NoteEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dayId" TEXT NOT NULL,
  "planItemId" TEXT,
  "kind" "NoteEntryKind" NOT NULL DEFAULT 'PLAIN',
  "titleSnapshot" TEXT,
  "content" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NoteEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NoteEntry" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "NoteEntry_userId_dayId_displayOrder_idx" ON "NoteEntry"("userId", "dayId", "displayOrder");
CREATE INDEX IF NOT EXISTS "NoteEntry_planItemId_idx" ON "NoteEntry"("planItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NoteEntry_userId_fkey'
  ) THEN
    ALTER TABLE "NoteEntry" ADD CONSTRAINT "NoteEntry_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NoteEntry_dayId_fkey'
  ) THEN
    ALTER TABLE "NoteEntry" ADD CONSTRAINT "NoteEntry_dayId_fkey"
      FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NoteEntry_planItemId_fkey'
  ) THEN
    ALTER TABLE "NoteEntry" ADD CONSTRAINT "NoteEntry_planItemId_fkey"
      FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
