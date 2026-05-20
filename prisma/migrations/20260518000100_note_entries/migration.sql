CREATE TYPE "NoteEntryKind" AS ENUM ('PLAIN', 'PROJECT');

CREATE TABLE "NoteEntry" (
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

CREATE INDEX "NoteEntry_userId_dayId_displayOrder_idx" ON "NoteEntry"("userId", "dayId", "displayOrder");
CREATE INDEX "NoteEntry_planItemId_idx" ON "NoteEntry"("planItemId");

ALTER TABLE "NoteEntry" ADD CONSTRAINT "NoteEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NoteEntry" ADD CONSTRAINT "NoteEntry_dayId_fkey"
  FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NoteEntry" ADD CONSTRAINT "NoteEntry_planItemId_fkey"
  FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
