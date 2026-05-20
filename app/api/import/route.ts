import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthError, requireCurrentUser } from "@/lib/server/auth";
import { NoteEntryKind } from "@/generated/prisma";
import { db } from "@/lib/db";
import { fromDateKey } from "@/lib/dates";
import { parseNoteEntries } from "@/lib/note-entries";
import { assertSameOrigin, RequestGuardError } from "@/lib/server/request-guard";

const daySchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const weekSchema = z.object({
  id: z.string(),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  review: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const planSectionSchema = z.object({
  id: z.string(),
  dayId: z.string(),
  kind: z.enum(["TODAY", "WEEK", "LONG", "CUSTOM"]),
  title: z.string(),
  placeholder: z.string(),
  tone: z.enum(["PRIMARY", "SECONDARY"]),
  isCustom: z.boolean(),
  displayOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const planItemSchema = z.object({
  id: z.string(),
  sectionId: z.string().nullable(),
  weekId: z.string().nullable(),
  scope: z.enum(["DAY", "WEEK", "MONTH"]),
  sectionKind: z.enum(["TODAY", "WEEK", "LONG", "CUSTOM"]),
  title: z.string(),
  monthStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  sourceItemId: z.string().nullable(),
  displayOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const tagSchema = z.object({
  id: z.string(),
  name: z.string(),
  normalized: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const planItemTagSchema = z.object({
  id: z.string(),
  planItemId: z.string(),
  tagId: z.string(),
  createdAt: z.string()
});

const planItemDayStateSchema = z.object({
  id: z.string(),
  planItemId: z.string(),
  dayId: z.string(),
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const legacyProgressEntrySchema = z.object({
  id: z.string(),
  dayId: z.string(),
  planItemId: z.string(),
  titleSnapshot: z.string(),
  source: z.enum(["MANUAL", "COMPLETION"]),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const progressEntrySchema = z.union([
  legacyProgressEntrySchema,
  z.object({
    id: z.string(),
    dayId: z.string(),
    planItemId: z.string().nullable(),
    titleSnapshot: z.string(),
    content: z.string(),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(0).max(1439),
    createdAt: z.string(),
    updatedAt: z.string()
  })
]);

const manualActualGroupSchema = z.object({
  id: z.string(),
  dayId: z.string(),
  title: z.string(),
  displayOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const manualActualItemSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  content: z.string(),
  displayOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const noteEntrySchema = z.object({
  id: z.string(),
  dayId: z.string(),
  planItemId: z.string().nullable(),
  kind: z.enum(["PLAIN", "PROJECT"]),
  titleSnapshot: z.string().nullable(),
  content: z.string(),
  displayOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const importSchema = z.object({
  meta: z.object({
    product: z.string(),
    exportVersion: z.number(),
    exportedAt: z.string()
  }),
  data: z.object({
    days: z.array(daySchema),
    weeks: z.array(weekSchema),
    planSections: z.array(planSectionSchema),
    planItems: z.array(planItemSchema),
    tags: z.array(tagSchema).default([]),
    planItemTags: z.array(planItemTagSchema).default([]),
    planItemDayStates: z.array(planItemDayStateSchema),
    progressEntries: z.array(progressEntrySchema),
    noteEntries: z.array(noteEntrySchema).default([]),
    manualActualGroups: z.array(manualActualGroupSchema),
    manualActualItems: z.array(manualActualItemSchema)
  })
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const body = await request.json();
    const parsed = importSchema.parse(body);

    if (parsed.meta.product !== "Dayfold" || ![1, 2, 3, 4].includes(parsed.meta.exportVersion)) {
      return NextResponse.json({ error: "暂不支持这个备份文件版本。" }, { status: 400 });
    }

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

      if (parsed.data.days.length) {
        await tx.day.createMany({
          data: parsed.data.days.map((day) => ({
            id: day.id,
            userId: user.id,
            date: fromDateKey(day.date),
            note: day.note,
            createdAt: new Date(day.createdAt),
            updatedAt: new Date(day.updatedAt)
          }))
        });
      }

      if (parsed.data.weeks.length) {
        await tx.week.createMany({
          data: parsed.data.weeks.map((week) => ({
            id: week.id,
            userId: user.id,
            weekStartDate: fromDateKey(week.weekStartDate),
            review: week.review,
            createdAt: new Date(week.createdAt),
            updatedAt: new Date(week.updatedAt)
          }))
        });
      }

      if (parsed.data.planSections.length) {
        await tx.planSection.createMany({
          data: parsed.data.planSections.map((section) => ({
            id: section.id,
            userId: user.id,
            dayId: section.dayId,
            kind: section.kind,
            title: section.title,
            placeholder: section.placeholder,
            tone: section.tone,
            isCustom: section.isCustom,
            displayOrder: section.displayOrder,
            createdAt: new Date(section.createdAt),
            updatedAt: new Date(section.updatedAt)
          }))
        });
      }

      if (parsed.data.planItems.length) {
        await tx.planItem.createMany({
          data: parsed.data.planItems.map((item) => ({
            id: item.id,
            userId: user.id,
            sectionId: item.sectionId,
            weekId: item.weekId,
            scope: item.scope,
            sectionKind: item.sectionKind,
            title: item.title,
            monthStart: item.monthStart ? fromDateKey(item.monthStart) : null,
            sourceItemId: item.sourceItemId,
            displayOrder: item.displayOrder,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt)
          }))
        });
      }

      if (parsed.data.tags.length) {
        await tx.tag.createMany({
          data: parsed.data.tags.map((tag) => ({
            id: tag.id,
            userId: user.id,
            name: tag.name,
            normalized: tag.normalized,
            createdAt: new Date(tag.createdAt),
            updatedAt: new Date(tag.updatedAt)
          }))
        });
      }

      if (parsed.data.planItemTags.length) {
        await tx.planItemTag.createMany({
          data: parsed.data.planItemTags.map((entry) => ({
            id: entry.id,
            userId: user.id,
            planItemId: entry.planItemId,
            tagId: entry.tagId,
            createdAt: new Date(entry.createdAt)
          }))
        });
      }

      if (parsed.data.planItemDayStates.length) {
        await tx.planItemDayState.createMany({
          data: parsed.data.planItemDayStates.map((entry) => ({
            id: entry.id,
            userId: user.id,
            planItemId: entry.planItemId,
            dayId: entry.dayId,
            completed: entry.completed,
            createdAt: new Date(entry.createdAt),
            updatedAt: new Date(entry.updatedAt)
          }))
        });
      }

      if (parsed.data.progressEntries.length) {
        await tx.progressEntry.createMany({
          data: parsed.data.progressEntries.map((entry) => {
            const legacyMinuteSeed = new Date(entry.createdAt);
            const legacyStartMinute = legacyMinuteSeed.getHours() * 60 + legacyMinuteSeed.getMinutes();

            return {
              id: entry.id,
              userId: user.id,
              dayId: entry.dayId,
              planItemId: "source" in entry ? entry.planItemId : entry.planItemId,
              titleSnapshot: entry.titleSnapshot,
              content: entry.content,
              startMinute: "startMinute" in entry ? entry.startMinute : legacyStartMinute,
              endMinute: "endMinute" in entry ? entry.endMinute : Math.min(1439, legacyStartMinute + 30),
              createdAt: new Date(entry.createdAt),
              updatedAt: new Date(entry.updatedAt)
            };
          })
        });
      }

      if (parsed.data.noteEntries.length) {
        const planItemIds = new Set(parsed.data.planItems.map((item) => item.id));

        await tx.noteEntry.createMany({
          data: parsed.data.noteEntries.map((entry) => ({
            id: entry.id,
            userId: user.id,
            dayId: entry.dayId,
            planItemId: entry.planItemId && planItemIds.has(entry.planItemId) ? entry.planItemId : null,
            kind: entry.kind,
            titleSnapshot: entry.titleSnapshot,
            content: entry.content,
            displayOrder: entry.displayOrder,
            createdAt: new Date(entry.createdAt),
            updatedAt: new Date(entry.updatedAt)
          }))
        });
      } else {
        const planItemIds = new Set(parsed.data.planItems.map((item) => item.id));
        const noteRows = parsed.data.days.flatMap((day) =>
          parseNoteEntries(day.note).map((entry, index) => {
            if (entry.kind === "project") {
              return {
                userId: user.id,
                dayId: day.id,
                planItemId: entry.projectId && planItemIds.has(entry.projectId) ? entry.projectId : null,
                kind: NoteEntryKind.PROJECT,
                titleSnapshot: entry.projectTitle,
                content: entry.content,
                displayOrder: index,
                createdAt: new Date(day.updatedAt),
                updatedAt: new Date(day.updatedAt)
              };
            }

            return {
              userId: user.id,
              dayId: day.id,
              planItemId: null,
              kind: NoteEntryKind.PLAIN,
              titleSnapshot: null,
              content: entry.content,
              displayOrder: index,
              createdAt: new Date(day.updatedAt),
              updatedAt: new Date(day.updatedAt)
            };
          })
        );

        if (noteRows.length) {
          await tx.noteEntry.createMany({
            data: noteRows
          });
        }
      }

      if (parsed.data.manualActualGroups.length) {
        await tx.manualActualGroup.createMany({
          data: parsed.data.manualActualGroups.map((group) => ({
            id: group.id,
            userId: user.id,
            dayId: group.dayId,
            title: group.title,
            displayOrder: group.displayOrder,
            createdAt: new Date(group.createdAt),
            updatedAt: new Date(group.updatedAt)
          }))
        });
      }

      if (parsed.data.manualActualItems.length) {
        await tx.manualActualItem.createMany({
          data: parsed.data.manualActualItems.map((item) => ({
            id: item.id,
            groupId: item.groupId,
            content: item.content,
            displayOrder: item.displayOrder,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt)
          }))
        });
      }
    });

    return NextResponse.json({
      ok: true,
      counts: {
        days: parsed.data.days.length,
        weeks: parsed.data.weeks.length,
        planItems: parsed.data.planItems.length,
        tags: parsed.data.tags.length,
        progressEntries: parsed.data.progressEntries.length,
        noteEntries: parsed.data.noteEntries.length
      }
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof RequestGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "备份文件格式不正确。" }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "导入失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
