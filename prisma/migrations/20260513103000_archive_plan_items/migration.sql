ALTER TABLE "PlanItem" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "PlanItem_userId_archivedAt_idx" ON "PlanItem"("userId", "archivedAt");
