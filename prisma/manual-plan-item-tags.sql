-- Safely add plan-item tag tables without resetting the local database.

CREATE TABLE IF NOT EXISTS "Tag" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlanItemTag" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planItemId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanItemTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tag_userId_normalized_key" ON "Tag"("userId", "normalized");
CREATE INDEX IF NOT EXISTS "Tag_userId_name_idx" ON "Tag"("userId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanItemTag_planItemId_tagId_key" ON "PlanItemTag"("planItemId", "tagId");
CREATE INDEX IF NOT EXISTS "PlanItemTag_userId_tagId_idx" ON "PlanItemTag"("userId", "tagId");
CREATE INDEX IF NOT EXISTS "PlanItemTag_userId_planItemId_idx" ON "PlanItemTag"("userId", "planItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Tag_userId_fkey'
  ) THEN
    ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlanItemTag_userId_fkey'
  ) THEN
    ALTER TABLE "PlanItemTag" ADD CONSTRAINT "PlanItemTag_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlanItemTag_planItemId_fkey'
  ) THEN
    ALTER TABLE "PlanItemTag" ADD CONSTRAINT "PlanItemTag_planItemId_fkey"
      FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlanItemTag_tagId_fkey'
  ) THEN
    ALTER TABLE "PlanItemTag" ADD CONSTRAINT "PlanItemTag_tagId_fkey"
      FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
