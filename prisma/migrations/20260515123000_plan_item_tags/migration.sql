CREATE TABLE "Tag" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanItemTag" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planItemId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanItemTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tag_userId_normalized_key" ON "Tag"("userId", "normalized");
CREATE INDEX "Tag_userId_name_idx" ON "Tag"("userId", "name");
CREATE UNIQUE INDEX "PlanItemTag_planItemId_tagId_key" ON "PlanItemTag"("planItemId", "tagId");
CREATE INDEX "PlanItemTag_userId_tagId_idx" ON "PlanItemTag"("userId", "tagId");
CREATE INDEX "PlanItemTag_userId_planItemId_idx" ON "PlanItemTag"("userId", "planItemId");

ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanItemTag" ADD CONSTRAINT "PlanItemTag_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanItemTag" ADD CONSTRAINT "PlanItemTag_planItemId_fkey"
  FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanItemTag" ADD CONSTRAINT "PlanItemTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
