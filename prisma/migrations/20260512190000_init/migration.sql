CREATE TYPE "SectionKind" AS ENUM ('TODAY', 'WEEK', 'LONG', 'CUSTOM');
CREATE TYPE "SectionTone" AS ENUM ('PRIMARY', 'SECONDARY');
CREATE TYPE "PlanItemScope" AS ENUM ('DAY', 'WEEK', 'MONTH');
CREATE TYPE "ProgressEntrySource" AS ENUM ('MANUAL', 'COMPLETION');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Day" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Day_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Week" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekStartDate" TIMESTAMP(3) NOT NULL,
  "review" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanSection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dayId" TEXT NOT NULL,
  "kind" "SectionKind" NOT NULL,
  "title" TEXT NOT NULL,
  "placeholder" TEXT NOT NULL,
  "tone" "SectionTone" NOT NULL,
  "isCustom" BOOLEAN NOT NULL DEFAULT false,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sectionId" TEXT,
  "weekId" TEXT,
  "scope" "PlanItemScope" NOT NULL,
  "sectionKind" "SectionKind" NOT NULL,
  "title" TEXT NOT NULL,
  "monthStart" TIMESTAMP(3),
  "sourceItemId" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanItemDayState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planItemId" TEXT NOT NULL,
  "dayId" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanItemDayState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProgressEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dayId" TEXT NOT NULL,
  "planItemId" TEXT NOT NULL,
  "titleSnapshot" TEXT NOT NULL,
  "source" "ProgressEntrySource" NOT NULL DEFAULT 'MANUAL',
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgressEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualActualGroup" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dayId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualActualGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualActualItem" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualActualItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Day_userId_date_key" ON "Day"("userId", "date");
CREATE INDEX "Day_userId_date_idx" ON "Day"("userId", "date");
CREATE UNIQUE INDEX "Week_userId_weekStartDate_key" ON "Week"("userId", "weekStartDate");
CREATE INDEX "Week_userId_weekStartDate_idx" ON "Week"("userId", "weekStartDate");
CREATE UNIQUE INDEX "PlanSection_dayId_kind_displayOrder_key" ON "PlanSection"("dayId", "kind", "displayOrder");
CREATE INDEX "PlanSection_userId_dayId_displayOrder_idx" ON "PlanSection"("userId", "dayId", "displayOrder");
CREATE INDEX "PlanItem_userId_sectionId_displayOrder_idx" ON "PlanItem"("userId", "sectionId", "displayOrder");
CREATE INDEX "PlanItem_userId_weekId_displayOrder_idx" ON "PlanItem"("userId", "weekId", "displayOrder");
CREATE INDEX "PlanItem_userId_monthStart_displayOrder_idx" ON "PlanItem"("userId", "monthStart", "displayOrder");
CREATE INDEX "PlanItem_sourceItemId_idx" ON "PlanItem"("sourceItemId");
CREATE UNIQUE INDEX "PlanItemDayState_planItemId_dayId_key" ON "PlanItemDayState"("planItemId", "dayId");
CREATE INDEX "PlanItemDayState_userId_dayId_idx" ON "PlanItemDayState"("userId", "dayId");
CREATE INDEX "ProgressEntry_userId_dayId_createdAt_idx" ON "ProgressEntry"("userId", "dayId", "createdAt");
CREATE INDEX "ProgressEntry_planItemId_idx" ON "ProgressEntry"("planItemId");
CREATE INDEX "ManualActualGroup_userId_dayId_displayOrder_idx" ON "ManualActualGroup"("userId", "dayId", "displayOrder");
CREATE INDEX "ManualActualItem_groupId_displayOrder_idx" ON "ManualActualItem"("groupId", "displayOrder");

ALTER TABLE "Day" ADD CONSTRAINT "Day_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Week" ADD CONSTRAINT "Week_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanSection" ADD CONSTRAINT "PlanSection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanSection" ADD CONSTRAINT "PlanSection_dayId_fkey"
  FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "PlanSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_weekId_fkey"
  FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_sourceItemId_fkey"
  FOREIGN KEY ("sourceItemId") REFERENCES "PlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanItemDayState" ADD CONSTRAINT "PlanItemDayState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanItemDayState" ADD CONSTRAINT "PlanItemDayState_planItemId_fkey"
  FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanItemDayState" ADD CONSTRAINT "PlanItemDayState_dayId_fkey"
  FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_dayId_fkey"
  FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_planItemId_fkey"
  FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualActualGroup" ADD CONSTRAINT "ManualActualGroup_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualActualGroup" ADD CONSTRAINT "ManualActualGroup_dayId_fkey"
  FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualActualItem" ADD CONSTRAINT "ManualActualItem_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "ManualActualGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
