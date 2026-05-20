import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        ok: true,
        service: "dayfold",
        database: "reachable",
        checkedAt: new Date().toISOString()
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "dayfold",
        database: "unreachable",
        checkedAt: new Date().toISOString()
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
