CREATE TABLE IF NOT EXISTS "ProgressEntryTag" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "progressEntryId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgressEntryTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManualActualGroupTag" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "manualActualGroupId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualActualGroupTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProgressEntryTag_progressEntryId_tagId_key" ON "ProgressEntryTag"("progressEntryId", "tagId");
CREATE INDEX IF NOT EXISTS "ProgressEntryTag_userId_tagId_idx" ON "ProgressEntryTag"("userId", "tagId");
CREATE INDEX IF NOT EXISTS "ProgressEntryTag_userId_progressEntryId_idx" ON "ProgressEntryTag"("userId", "progressEntryId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManualActualGroupTag_manualActualGroupId_tagId_key" ON "ManualActualGroupTag"("manualActualGroupId", "tagId");
CREATE INDEX IF NOT EXISTS "ManualActualGroupTag_userId_tagId_idx" ON "ManualActualGroupTag"("userId", "tagId");
CREATE INDEX IF NOT EXISTS "ManualActualGroupTag_userId_manualActualGroupId_idx" ON "ManualActualGroupTag"("userId", "manualActualGroupId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProgressEntryTag_userId_fkey') THEN
    ALTER TABLE "ProgressEntryTag" ADD CONSTRAINT "ProgressEntryTag_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProgressEntryTag_progressEntryId_fkey') THEN
    ALTER TABLE "ProgressEntryTag" ADD CONSTRAINT "ProgressEntryTag_progressEntryId_fkey"
      FOREIGN KEY ("progressEntryId") REFERENCES "ProgressEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProgressEntryTag_tagId_fkey') THEN
    ALTER TABLE "ProgressEntryTag" ADD CONSTRAINT "ProgressEntryTag_tagId_fkey"
      FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManualActualGroupTag_userId_fkey') THEN
    ALTER TABLE "ManualActualGroupTag" ADD CONSTRAINT "ManualActualGroupTag_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManualActualGroupTag_manualActualGroupId_fkey') THEN
    ALTER TABLE "ManualActualGroupTag" ADD CONSTRAINT "ManualActualGroupTag_manualActualGroupId_fkey"
      FOREIGN KEY ("manualActualGroupId") REFERENCES "ManualActualGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManualActualGroupTag_tagId_fkey') THEN
    ALTER TABLE "ManualActualGroupTag" ADD CONSTRAINT "ManualActualGroupTag_tagId_fkey"
      FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
