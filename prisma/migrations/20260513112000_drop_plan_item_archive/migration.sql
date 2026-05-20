DROP INDEX IF EXISTS "PlanItem_userId_archivedAt_idx";

ALTER TABLE "PlanItem" DROP COLUMN IF EXISTS "archivedAt";
