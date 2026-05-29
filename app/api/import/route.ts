import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthError, requireCurrentUser } from "@/lib/server/auth";
import { NoteEntryKind, type Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { fromDateKey } from "@/lib/dates";
import { parseNoteEntries, serializeNoteEntries } from "@/lib/note-entries";
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

const progressEntryTagSchema = z.object({
  id: z.string(),
  progressEntryId: z.string(),
  tagId: z.string(),
  createdAt: z.string()
});

const manualActualGroupTagSchema = z.object({
  id: z.string(),
  manualActualGroupId: z.string(),
  tagId: z.string(),
  createdAt: z.string()
});

const trashEntrySchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  payload: z.record(z.string(), z.unknown()),
  expiresAt: z.string(),
  restoredAt: z.string().nullable(),
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
    progressEntryTags: z.array(progressEntryTagSchema).default([]),
    noteEntries: z.array(noteEntrySchema).default([]),
    manualActualGroups: z.array(manualActualGroupSchema),
    manualActualGroupTags: z.array(manualActualGroupTagSchema).default([]),
    manualActualItems: z.array(manualActualItemSchema),
    trashEntries: z.array(trashEntrySchema).default([])
  })
});

type ImportData = z.infer<typeof importSchema>["data"];
type IdMap = Map<string, string>;
type ImportIdMaps = {
  day: IdMap;
  week: IdMap;
  planSection: IdMap;
  planItem: IdMap;
  tag: IdMap;
  planItemTag: IdMap;
  planItemDayState: IdMap;
  progressEntry: IdMap;
  progressEntryTag: IdMap;
  noteEntry: IdMap;
  manualActualGroup: IdMap;
  manualActualGroupTag: IdMap;
  manualActualItem: IdMap;
  trashEntry: IdMap;
};
type TrashPayloadIdMaps = {
  planSection: IdMap;
  planItem: IdMap;
  planItemDayState: IdMap;
  progressEntry: IdMap;
  manualActualGroup: IdMap;
  manualActualItem: IdMap;
};

function createIdMap<T extends { id: string }>(entries: T[]) {
  return new Map(entries.map((entry) => [entry.id, randomUUID()]));
}

function requireMappedId(label: string, map: IdMap, referencedId: string) {
  const mappedId = map.get(referencedId);

  if (!mappedId) {
    throw new Error(`${label} 引用了不存在的记录：${referencedId}`);
  }

  return mappedId;
}

function optionalMappedId(label: string, map: IdMap, referencedId: string | null) {
  return referencedId ? requireMappedId(label, map, referencedId) : null;
}

function getOrCreateMappedId(map: IdMap, referencedId: string) {
  const existing = map.get(referencedId);

  if (existing) {
    return existing;
  }

  const nextId = randomUUID();
  map.set(referencedId, nextId);
  return nextId;
}

function resolveMappedOrTrashId(
  label: string,
  activeMap: IdMap,
  trashMap: IdMap,
  referencedId: string
) {
  return activeMap.get(referencedId) ?? getOrCreateMappedId(trashMap, referencedId);
}

function createImportIdMaps(data: ImportData): ImportIdMaps {
  return {
    day: createIdMap(data.days),
    week: createIdMap(data.weeks),
    planSection: createIdMap(data.planSections),
    planItem: createIdMap(data.planItems),
    tag: createIdMap(data.tags),
    planItemTag: createIdMap(data.planItemTags),
    planItemDayState: createIdMap(data.planItemDayStates),
    progressEntry: createIdMap(data.progressEntries),
    progressEntryTag: createIdMap(data.progressEntryTags),
    noteEntry: createIdMap(data.noteEntries),
    manualActualGroup: createIdMap(data.manualActualGroups),
    manualActualGroupTag: createIdMap(data.manualActualGroupTags),
    manualActualItem: createIdMap(data.manualActualItems),
    trashEntry: createIdMap(data.trashEntries)
  };
}

function toJsonInput(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function remapSerializedNoteContent(serializedContent: string, planItemIdMap: IdMap) {
  return serializeNoteEntries(
    parseNoteEntries(serializedContent).map((entry) =>
      entry.kind === "project"
        ? {
            ...entry,
            projectId: entry.projectId ? planItemIdMap.get(entry.projectId) ?? null : null
          }
        : entry
    )
  );
}

function remapTrashPayload(
  kind: string,
  payload: Record<string, unknown>,
  idMaps: ImportIdMaps,
  trashIdMaps: TrashPayloadIdMaps
): Record<string, unknown> {
  if (kind === "progress-entry") {
    const entry = payload.entry as Record<string, unknown> | undefined;

    if (!entry?.id || !entry.dayId) {
      throw new Error("TrashEntry.progress-entry payload 缺失必要字段。");
    }

    return {
      ...payload,
      entry: {
        ...entry,
        id: getOrCreateMappedId(trashIdMaps.progressEntry, String(entry.id)),
        dayId: requireMappedId("Trash progress entry dayId", idMaps.day, String(entry.dayId)),
        planItemId: entry.planItemId
          ? resolveMappedOrTrashId("Trash progress entry planItemId", idMaps.planItem, trashIdMaps.planItem, String(entry.planItemId))
          : null
      }
    };
  }

  if (kind === "manual-actual-item") {
    const item = payload.item as Record<string, unknown> | undefined;

    if (!item?.id || !item.groupId) {
      throw new Error("TrashEntry.manual-actual-item payload 缺失必要字段。");
    }

    return {
      ...payload,
      item: {
        ...item,
        id: getOrCreateMappedId(trashIdMaps.manualActualItem, String(item.id)),
        groupId: resolveMappedOrTrashId(
          "Trash manual actual item groupId",
          idMaps.manualActualGroup,
          trashIdMaps.manualActualGroup,
          String(item.groupId)
        )
      }
    };
  }

  if (kind === "manual-actual-group") {
    const group = payload.group as Record<string, unknown> | undefined;
    const items = Array.isArray(payload.items) ? payload.items : [];

    if (!group?.id || !group.dayId) {
      throw new Error("TrashEntry.manual-actual-group payload 缺失必要字段。");
    }

    return {
      ...payload,
      group: {
        ...group,
        id: getOrCreateMappedId(trashIdMaps.manualActualGroup, String(group.id)),
        dayId: requireMappedId("Trash manual actual group dayId", idMaps.day, String(group.dayId))
      },
      items: items.map((item) => {
        const value = item as Record<string, unknown>;

        if (!value.id) {
          throw new Error("TrashEntry.manual-actual-group item 缺失 id。");
        }

        return {
          ...value,
          id: getOrCreateMappedId(trashIdMaps.manualActualItem, String(value.id))
        };
      })
    };
  }

  if (kind === "plan-item") {
    const item = payload.item as Record<string, unknown> | undefined;
    const dayStates = Array.isArray(payload.dayStates) ? payload.dayStates : [];
    const progressEntries = Array.isArray(payload.progressEntries) ? payload.progressEntries : [];
    const noteEntryIds = Array.isArray(payload.noteEntryIds) ? payload.noteEntryIds : [];

    if (!item?.id) {
      throw new Error("TrashEntry.plan-item payload 缺失必要字段。");
    }

    return {
      ...payload,
      item: {
        ...item,
        id: getOrCreateMappedId(trashIdMaps.planItem, String(item.id)),
        sectionId: item.sectionId
          ? resolveMappedOrTrashId("Trash plan item sectionId", idMaps.planSection, trashIdMaps.planSection, String(item.sectionId))
          : null,
        weekId: item.weekId ? requireMappedId("Trash plan item weekId", idMaps.week, String(item.weekId)) : null,
        sourceItemId: item.sourceItemId
          ? resolveMappedOrTrashId("Trash plan item sourceItemId", idMaps.planItem, trashIdMaps.planItem, String(item.sourceItemId))
          : null
      },
      dayStates: dayStates.map((state) => {
        const value = state as Record<string, unknown>;

        if (!value.id || !value.dayId) {
          throw new Error("TrashEntry.plan-item dayState 缺失必要字段。");
        }

        return {
          ...value,
          id: getOrCreateMappedId(trashIdMaps.planItemDayState, String(value.id)),
          dayId: requireMappedId("Trash plan item dayState.dayId", idMaps.day, String(value.dayId))
        };
      }),
      progressEntries: progressEntries.map((progress) => {
        const value = progress as Record<string, unknown>;
        const entry = value.entry as Record<string, unknown> | undefined;

        if (!entry?.id || !entry.dayId) {
          throw new Error("TrashEntry.plan-item progress entry 缺失必要字段。");
        }

        return {
          ...value,
          entry: {
            ...entry,
            id: getOrCreateMappedId(trashIdMaps.progressEntry, String(entry.id)),
            dayId: requireMappedId("Trash plan item progress entry dayId", idMaps.day, String(entry.dayId))
          }
        };
      }),
      noteEntryIds: noteEntryIds.map((noteEntryId) =>
        requireMappedId("Trash plan item noteEntryId", idMaps.noteEntry, String(noteEntryId))
      )
    };
  }

  if (kind === "section") {
    const section = payload.section as Record<string, unknown> | undefined;
    const items = Array.isArray(payload.items) ? payload.items : [];

    if (!section?.id || !section.dayId) {
      throw new Error("TrashEntry.section payload 缺失必要字段。");
    }

    return {
      ...payload,
      section: {
        ...section,
        id: getOrCreateMappedId(trashIdMaps.planSection, String(section.id)),
        dayId: requireMappedId("Trash section dayId", idMaps.day, String(section.dayId))
      },
      items: items.map((item) => remapTrashPayload("plan-item", item as Record<string, unknown>, idMaps, trashIdMaps))
    };
  }

  if (kind === "day-note-entry") {
    return {
      ...payload,
      dayId: payload.dayId ? requireMappedId("Trash day note dayId", idMaps.day, String(payload.dayId)) : payload.dayId,
      entry:
        payload.entry && typeof payload.entry === "object" && !Array.isArray(payload.entry)
          ? (() => {
              const entry = payload.entry as Record<string, unknown>;

              if (entry.projectId) {
                return {
                  ...entry,
                  projectId: resolveMappedOrTrashId(
                    "Trash day note projectId",
                    idMaps.planItem,
                    trashIdMaps.planItem,
                    String(entry.projectId)
                  )
                };
              }

              return entry;
            })()
          : payload.entry
    };
  }

  return payload;
}

function remapImportData(data: ImportData): ImportData {
  const idMaps = createImportIdMaps(data);
  const trashIdMaps: TrashPayloadIdMaps = {
    planSection: new Map(),
    planItem: new Map(),
    planItemDayState: new Map(),
    progressEntry: new Map(),
    manualActualGroup: new Map(),
    manualActualItem: new Map()
  };

  return {
    days: data.days.map((day) => ({
      ...day,
      id: idMaps.day.get(day.id)!,
      note: remapSerializedNoteContent(day.note, idMaps.planItem)
    })),
    weeks: data.weeks.map((week) => ({
      ...week,
      id: idMaps.week.get(week.id)!
    })),
    planSections: data.planSections.map((section) => ({
      ...section,
      id: idMaps.planSection.get(section.id)!,
      dayId: requireMappedId("PlanSection.dayId", idMaps.day, section.dayId)
    })),
    planItems: data.planItems.map((item) => ({
      ...item,
      id: idMaps.planItem.get(item.id)!,
      sectionId: optionalMappedId("PlanItem.sectionId", idMaps.planSection, item.sectionId),
      weekId: optionalMappedId("PlanItem.weekId", idMaps.week, item.weekId),
      sourceItemId: optionalMappedId("PlanItem.sourceItemId", idMaps.planItem, item.sourceItemId)
    })),
    tags: data.tags.map((tag) => ({
      ...tag,
      id: idMaps.tag.get(tag.id)!
    })),
    planItemTags: data.planItemTags.map((entry) => ({
      ...entry,
      id: idMaps.planItemTag.get(entry.id)!,
      planItemId: requireMappedId("PlanItemTag.planItemId", idMaps.planItem, entry.planItemId),
      tagId: requireMappedId("PlanItemTag.tagId", idMaps.tag, entry.tagId)
    })),
    planItemDayStates: data.planItemDayStates.map((entry) => ({
      ...entry,
      id: idMaps.planItemDayState.get(entry.id)!,
      planItemId: requireMappedId("PlanItemDayState.planItemId", idMaps.planItem, entry.planItemId),
      dayId: requireMappedId("PlanItemDayState.dayId", idMaps.day, entry.dayId)
    })),
    progressEntries: data.progressEntries.map((entry) =>
      "source" in entry
        ? {
            ...entry,
            id: idMaps.progressEntry.get(entry.id)!,
            dayId: requireMappedId("ProgressEntry.dayId", idMaps.day, entry.dayId),
            planItemId: requireMappedId("ProgressEntry.planItemId", idMaps.planItem, entry.planItemId)
          }
        : {
            ...entry,
            id: idMaps.progressEntry.get(entry.id)!,
            dayId: requireMappedId("ProgressEntry.dayId", idMaps.day, entry.dayId),
            planItemId: optionalMappedId("ProgressEntry.planItemId", idMaps.planItem, entry.planItemId)
          }
    ),
    progressEntryTags: data.progressEntryTags.map((entry) => ({
      ...entry,
      id: idMaps.progressEntryTag.get(entry.id)!,
      progressEntryId: requireMappedId("ProgressEntryTag.progressEntryId", idMaps.progressEntry, entry.progressEntryId),
      tagId: requireMappedId("ProgressEntryTag.tagId", idMaps.tag, entry.tagId)
    })),
    noteEntries: data.noteEntries.map((entry) => ({
      ...entry,
      id: idMaps.noteEntry.get(entry.id)!,
      dayId: requireMappedId("NoteEntry.dayId", idMaps.day, entry.dayId),
      planItemId: optionalMappedId("NoteEntry.planItemId", idMaps.planItem, entry.planItemId)
    })),
    manualActualGroups: data.manualActualGroups.map((group) => ({
      ...group,
      id: idMaps.manualActualGroup.get(group.id)!,
      dayId: requireMappedId("ManualActualGroup.dayId", idMaps.day, group.dayId)
    })),
    manualActualGroupTags: data.manualActualGroupTags.map((entry) => ({
      ...entry,
      id: idMaps.manualActualGroupTag.get(entry.id)!,
      manualActualGroupId: requireMappedId(
        "ManualActualGroupTag.manualActualGroupId",
        idMaps.manualActualGroup,
        entry.manualActualGroupId
      ),
      tagId: requireMappedId("ManualActualGroupTag.tagId", idMaps.tag, entry.tagId)
    })),
    manualActualItems: data.manualActualItems.map((item) => ({
      ...item,
      id: idMaps.manualActualItem.get(item.id)!,
      groupId: requireMappedId("ManualActualItem.groupId", idMaps.manualActualGroup, item.groupId)
    })),
    trashEntries: data.trashEntries.map((entry) => ({
      ...entry,
      id: idMaps.trashEntry.get(entry.id)!,
      payload: remapTrashPayload(entry.kind, entry.payload, idMaps, trashIdMaps)
    }))
  };
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const body = await request.json();
    const parsed = importSchema.parse(body);

    if (parsed.meta.product !== "Dayfold" || ![1, 2, 3, 4, 5].includes(parsed.meta.exportVersion)) {
      return NextResponse.json({ error: "暂不支持这个备份文件版本。" }, { status: 400 });
    }

    const data = remapImportData(parsed.data);

    await db.$transaction(async (tx) => {
      await tx.progressEntryTag.deleteMany({
        where: { userId: user.id }
      });

      await tx.manualActualGroupTag.deleteMany({
        where: { userId: user.id }
      });

      await tx.trashEntry.deleteMany({
        where: { userId: user.id }
      });

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

      if (data.days.length) {
        await tx.day.createMany({
          data: data.days.map((day) => ({
            id: day.id,
            userId: user.id,
            date: fromDateKey(day.date),
            note: day.note,
            createdAt: new Date(day.createdAt),
            updatedAt: new Date(day.updatedAt)
          }))
        });
      }

      if (data.weeks.length) {
        await tx.week.createMany({
          data: data.weeks.map((week) => ({
            id: week.id,
            userId: user.id,
            weekStartDate: fromDateKey(week.weekStartDate),
            review: week.review,
            createdAt: new Date(week.createdAt),
            updatedAt: new Date(week.updatedAt)
          }))
        });
      }

      if (data.planSections.length) {
        await tx.planSection.createMany({
          data: data.planSections.map((section) => ({
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

      if (data.planItems.length) {
        await tx.planItem.createMany({
          data: data.planItems.map((item) => ({
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

      if (data.tags.length) {
        await tx.tag.createMany({
          data: data.tags.map((tag) => ({
            id: tag.id,
            userId: user.id,
            name: tag.name,
            normalized: tag.normalized,
            createdAt: new Date(tag.createdAt),
            updatedAt: new Date(tag.updatedAt)
          }))
        });
      }

      if (data.planItemTags.length) {
        await tx.planItemTag.createMany({
          data: data.planItemTags.map((entry) => ({
            id: entry.id,
            userId: user.id,
            planItemId: entry.planItemId,
            tagId: entry.tagId,
            createdAt: new Date(entry.createdAt)
          }))
        });
      }

      if (data.planItemDayStates.length) {
        await tx.planItemDayState.createMany({
          data: data.planItemDayStates.map((entry) => ({
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

      if (data.progressEntries.length) {
        await tx.progressEntry.createMany({
          data: data.progressEntries.map((entry) => {
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

      if (data.progressEntryTags.length) {
        await tx.progressEntryTag.createMany({
          data: data.progressEntryTags.map((entry) => ({
            id: entry.id,
            userId: user.id,
            progressEntryId: entry.progressEntryId,
            tagId: entry.tagId,
            createdAt: new Date(entry.createdAt)
          }))
        });
      }

      if (data.noteEntries.length) {
        const planItemIds = new Set(data.planItems.map((item) => item.id));

        await tx.noteEntry.createMany({
          data: data.noteEntries.map((entry) => ({
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
        const planItemIds = new Set(data.planItems.map((item) => item.id));
        const noteRows = data.days.flatMap((day) =>
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

      if (data.manualActualGroups.length) {
        await tx.manualActualGroup.createMany({
          data: data.manualActualGroups.map((group) => ({
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

      if (data.manualActualGroupTags.length) {
        await tx.manualActualGroupTag.createMany({
          data: data.manualActualGroupTags.map((entry) => ({
            id: entry.id,
            userId: user.id,
            manualActualGroupId: entry.manualActualGroupId,
            tagId: entry.tagId,
            createdAt: new Date(entry.createdAt)
          }))
        });
      }

      if (data.manualActualItems.length) {
        await tx.manualActualItem.createMany({
          data: data.manualActualItems.map((item) => ({
            id: item.id,
            groupId: item.groupId,
            content: item.content,
            displayOrder: item.displayOrder,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt)
          }))
        });
      }

      if (data.trashEntries.length) {
        await tx.trashEntry.createMany({
          data: data.trashEntries.map((entry) => ({
            id: entry.id,
            userId: user.id,
            kind: entry.kind,
            title: entry.title,
            payload: toJsonInput(entry.payload),
            expiresAt: new Date(entry.expiresAt),
            restoredAt: entry.restoredAt ? new Date(entry.restoredAt) : null,
            createdAt: new Date(entry.createdAt),
            updatedAt: new Date(entry.updatedAt)
          }))
        });
      }
    });

    return NextResponse.json({
      ok: true,
      counts: {
        days: data.days.length,
        weeks: data.weeks.length,
        planItems: data.planItems.length,
        tags: data.tags.length,
        progressEntries: data.progressEntries.length,
        noteEntries: data.noteEntries.length,
        progressEntryTags: data.progressEntryTags.length,
        manualActualGroupTags: data.manualActualGroupTags.length,
        trashEntries: data.trashEntries.length
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

    if (error instanceof Error && error.message.includes("引用了不存在的记录")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "导入失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
