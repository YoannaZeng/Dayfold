import { PrismaClient } from "@/generated/prisma";

declare global {
  var prismaDayfoldV2: PrismaClient | undefined;
}

export const db =
  global.prismaDayfoldV2 ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.prismaDayfoldV2 = db;
}
