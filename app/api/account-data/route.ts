import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { assertSameOrigin, RequestGuardError } from "@/lib/server/request-guard";

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();

    await db.$transaction(async (tx) => {
      await tx.manualActualItem.deleteMany({
        where: {
          group: {
            userId: user.id
          }
        }
      });

      await tx.progressEntry.deleteMany({
        where: { userId: user.id }
      });

      await tx.noteEntry.deleteMany({
        where: { userId: user.id }
      });

      await tx.planItemTag.deleteMany({
        where: { userId: user.id }
      });

      await tx.tag.deleteMany({
        where: { userId: user.id }
      });

      await tx.planItemDayState.deleteMany({
        where: { userId: user.id }
      });

      await tx.manualActualGroup.deleteMany({
        where: { userId: user.id }
      });

      await tx.planItem.deleteMany({
        where: { userId: user.id }
      });

      await tx.planSection.deleteMany({
        where: { userId: user.id }
      });

      await tx.day.deleteMany({
        where: { userId: user.id }
      });

      await tx.week.deleteMany({
        where: { userId: user.id }
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof RequestGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "清空数据失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
