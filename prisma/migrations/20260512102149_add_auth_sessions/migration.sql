-- This migration name was accidentally created before the real init migration.
-- Keep it as a no-op so historical replay against Prisma's shadow database stays valid.
SELECT 1;
