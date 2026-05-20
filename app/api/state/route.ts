import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireCurrentUser } from "@/lib/server/auth";
import { getDayfoldSnapshot } from "@/lib/server/dayfold";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "Missing date parameter." }, { status: 400 });
  }

  try {
    const user = await requireCurrentUser();
    const state = await getDayfoldSnapshot(user, date);
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
