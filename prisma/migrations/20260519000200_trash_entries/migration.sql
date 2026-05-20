CREATE TABLE IF NOT EXISTS "TrashEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "restoredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrashEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrashEntry_userId_restoredAt_expiresAt_createdAt_idx"
  ON "TrashEntry"("userId", "restoredAt", "expiresAt", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrashEntry_userId_fkey') THEN
    ALTER TABLE "TrashEntry" ADD CONSTRAINT "TrashEntry_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
