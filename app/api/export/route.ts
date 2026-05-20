import { NextResponse } from "next/server";

import { AuthError, requireCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { toDateKey } from "@/lib/dates";

export async function GET() {
  try {
    const user = await requireCurrentUser();

    const [
      days,
      weeks,
      planSections,
      planItems,
      tags,
      planItemTags,
      planItemDayStates,
      progressEntries,
      noteEntries,
      manualActualGroups,
      manualActualItems
    ] = await Promise.all([
      db.day.findMany({
        where: { userId: user.id },
        orderBy: [{ date: "asc" }]
      }),
      db.week.findMany({
        where: { userId: user.id },
        orderBy: [{ weekStartDate: "asc" }]
      }),
      db.planSection.findMany({
        where: { userId: user.id },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
      }),
      db.planItem.findMany({
        where: { userId: user.id },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
      }),
      db.tag.findMany({
        where: { userId: user.id },
        orderBy: [{ name: "asc" }, { createdAt: "asc" }]
      }),
      db.planItemTag.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: "asc" }]
      }),
      db.planItemDayState.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: "asc" }]
      }),
      db.progressEntry.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: "asc" }]
      }),
      db.noteEntry.findMany({
        where: { userId: user.id },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
      }),
      db.manualActualGroup.findMany({
        where: { userId: user.id },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
      }),
      db.manualActualItem.findMany({
        where: {
          group: {
            userId: user.id
          }
        },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
      })
    ]);

    const payload = {
      meta: {
        product: "Dayfold",
        exportVersion: 4,
        exportedAt: new Date().toISOString()
      },
      user: {
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString()
      },
      data: {
        days: days.map((day) => ({
          id: day.id,
          date: toDateKey(day.date),
          note: day.note,
          createdAt: day.createdAt.toISOString(),
          updatedAt: day.updatedAt.toISOString()
        })),
        weeks: weeks.map((week) => ({
          id: week.id,
          weekStartDate: toDateKey(week.weekStartDate),
          review: week.review,
          createdAt: week.createdAt.toISOString(),
          updatedAt: week.updatedAt.toISOString()
        })),
        planSections: planSections.map((section) => ({
          id: section.id,
          dayId: section.dayId,
          kind: section.kind,
          title: section.title,
          placeholder: section.placeholder,
          tone: section.tone,
          isCustom: section.isCustom,
          displayOrder: section.displayOrder,
          createdAt: section.createdAt.toISOString(),
          updatedAt: section.updatedAt.toISOString()
        })),
        planItems: planItems.map((item) => ({
          id: item.id,
          sectionId: item.sectionId,
          weekId: item.weekId,
          scope: item.scope,
          sectionKind: item.sectionKind,
          title: item.title,
          monthStart: item.monthStart ? toDateKey(item.monthStart) : null,
          sourceItemId: item.sourceItemId,
          displayOrder: item.displayOrder,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        })),
        tags: tags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          normalized: tag.normalized,
          createdAt: tag.createdAt.toISOString(),
          updatedAt: tag.updatedAt.toISOString()
        })),
        planItemTags: planItemTags.map((entry) => ({
          id: entry.id,
          planItemId: entry.planItemId,
          tagId: entry.tagId,
          createdAt: entry.createdAt.toISOString()
        })),
        planItemDayStates: planItemDayStates.map((entry) => ({
          id: entry.id,
          planItemId: entry.planItemId,
          dayId: entry.dayId,
          completed: entry.completed,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString()
        })),
        progressEntries: progressEntries.map((entry) => ({
          id: entry.id,
          dayId: entry.dayId,
          planItemId: entry.planItemId,
          titleSnapshot: entry.titleSnapshot,
          content: entry.content,
          startMinute: entry.startMinute,
          endMinute: entry.endMinute,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString()
        })),
        noteEntries: noteEntries.map((entry) => ({
          id: entry.id,
          dayId: entry.dayId,
          planItemId: entry.planItemId,
          kind: entry.kind,
          titleSnapshot: entry.titleSnapshot,
          content: entry.content,
          displayOrder: entry.displayOrder,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString()
        })),
        manualActualGroups: manualActualGroups.map((group) => ({
          id: group.id,
          dayId: group.dayId,
          title: group.title,
          displayOrder: group.displayOrder,
          createdAt: group.createdAt.toISOString(),
          updatedAt: group.updatedAt.toISOString()
        })),
        manualActualItems: manualActualItems.map((item) => ({
          id: item.id,
          groupId: item.groupId,
          content: item.content,
          displayOrder: item.displayOrder,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        }))
      }
    };

    const filename = `dayfold-backup-${toDateKey(new Date())}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "导出失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
