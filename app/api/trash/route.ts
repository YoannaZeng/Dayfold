import { NextResponse } from "next/server";

import { AuthError, requireCurrentUser } from "@/lib/server/auth";
import { getTrashEntries } from "@/lib/server/dayfold";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const entries = await getTrashEntries(user);
    return NextResponse.json({
      entries: entries.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        createdAt: entry.createdAt.toISOString(),
        expiresAt: entry.expiresAt.toISOString()
      }))
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "读取回收站失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
