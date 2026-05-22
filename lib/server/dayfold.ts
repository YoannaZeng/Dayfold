import {
  NoteEntryKind,
  PlanItemScope,
  SectionKind,
  SectionTone,
  type Day,
  type PlanItem,
  type PlanSection,
  type Prisma,
  type User,
  type Week
} from "@/generated/prisma";
import type { DayfoldSnapshot, WeekDaySnapshot } from "@/lib/api-types";
import {
  buildActualGroups,
  dedupeTagNames,
  normalizeTagName,
  type DayState,
  type PlanSection as ClientPlanSection,
  type WeekTagSummary
} from "@/lib/dayfold";
import { db } from "@/lib/db";
import { fromDateKey, getMonthDateKeys, getMonthStart, getWeekDateKeys, getWeekStart, toDateKey } from "@/lib/dates";
import { parseNoteEntries, serializeNoteEntries, type NoteEntryDraft } from "@/lib/note-entries";

type PlanItemWithTags = Prisma.PlanItemGetPayload<{
  include: {
    sourceItem: {
      include: {
        sourceItem: true;
      };
    };
    tags: {
      include: {
        tag: true;
      };
    };
  };
}>;

type TagTargetKind = "linked" | "manual" | "free";

type PersistedNoteEntry = Prisma.NoteEntryGetPayload<Record<string, never>>;

const DEFAULT_SECTIONS = [
  {
    kind: SectionKind.TODAY,
    title: "今日计划",
    placeholder: "添加今天要做的事",
    tone: SectionTone.PRIMARY,
    displayOrder: 0
  },
  {
    kind: SectionKind.WEEK,
    title: "本周计划",
    placeholder: "添加本周要推进的事",
    tone: SectionTone.SECONDARY,
    displayOrder: 1
  },
  {
    kind: SectionKind.LONG,
    title: "长期项目",
    placeholder: "添加长期项目",
    tone: SectionTone.SECONDARY,
    displayOrder: 2
  }
] as const;

const TRASH_RETENTION_DAYS = 5;

function trashExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TRASH_RETENTION_DAYS);
  return expiresAt;
}

function toTrashPayload(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function fromTrashDate(value: unknown) {
  return new Date(String(value));
}

function getPayloadObject(payload: Prisma.JsonValue) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("回收站数据格式异常。");
  }
  return payload as Record<string, any>;
}

function sectionKindToClient(kind: SectionKind): ClientPlanSection["kind"] {
  switch (kind) {
    case SectionKind.TODAY:
      return "today";
    case SectionKind.WEEK:
      return "week";
    case SectionKind.LONG:
      return "long";
    case SectionKind.CUSTOM:
      return "custom";
  }
}

function sectionToneToClient(tone: SectionTone): ClientPlanSection["tone"] {
  return tone === SectionTone.PRIMARY ? "primary" : "secondary";
}

function getDerivedTodayPlanSource(item: {
  sectionKind: SectionKind;
  sourceItemId: string | null;
  sourceItem?:
    | {
        id: string;
        title: string;
        sectionKind: SectionKind;
        sourceItemId?: string | null;
        sourceItem?: { id: string; title: string; sectionKind: SectionKind } | null;
      }
    | null;
}) {
  if (item.sectionKind !== SectionKind.TODAY || !item.sourceItemId || !item.sourceItem) {
    return null;
  }

  if (item.sourceItem.sectionKind === SectionKind.WEEK || item.sourceItem.sectionKind === SectionKind.LONG) {
    return item.sourceItem;
  }

  if (
    item.sourceItem.sectionKind === SectionKind.TODAY &&
    item.sourceItem.sourceItem &&
    (item.sourceItem.sourceItem.sectionKind === SectionKind.WEEK || item.sourceItem.sourceItem.sectionKind === SectionKind.LONG)
  ) {
    return item.sourceItem.sourceItem;
  }

  return null;
}

function isDerivedTodayPlan(item: Parameters<typeof getDerivedTodayPlanSource>[0]) {
  return Boolean(getDerivedTodayPlanSource(item));
}

function normalizeTagKey(value: string) {
  return normalizeTagName(value).toLocaleLowerCase("zh-CN");
}

async function ensureDay(userId: string, date: Date) {
  const day = await db.day.upsert({
    where: {
      userId_date: {
        userId,
        date
      }
    },
    update: {},
    create: {
      userId,
      date
    }
  });

  await Promise.all(
    DEFAULT_SECTIONS.map((section) =>
      db.planSection.upsert({
        where: {
          dayId_kind_displayOrder: {
            dayId: day.id,
            kind: section.kind,
            displayOrder: section.displayOrder
          }
        },
        update: {},
        create: {
          userId,
          dayId: day.id,
          kind: section.kind,
          title: section.title,
          placeholder: section.placeholder,
          tone: section.tone,
          isCustom: false,
          displayOrder: section.displayOrder
        }
      })
    )
  );

  return day;
}

async function ensureWeek(userId: string, weekStartDate: Date) {
  return db.week.upsert({
    where: {
      userId_weekStartDate: {
        userId,
        weekStartDate
      }
    },
    update: {},
    create: {
      userId,
      weekStartDate
    }
  });
}

async function getSectionOrThrow(userId: string, sectionId: string) {
  const section = await db.planSection.findFirst({
    where: {
      id: sectionId,
      userId
    }
  });

  if (!section) {
    throw new Error("Section not found.");
  }

  return section;
}

async function getPlanItemOrThrow(userId: string, planItemId: string) {
  const item = await db.planItem.findFirst({
    where: {
      id: planItemId,
      userId
    },
    include: {
      sourceItem: {
        include: {
          sourceItem: true
        }
      },
      tags: {
        include: {
          tag: true
        }
      }
    }
  });

  if (!item) {
    throw new Error("Plan item not found.");
  }

  return item;
}

async function getProgressEntryOrThrow(userId: string, progressEntryId: string) {
  const entry = await db.progressEntry.findFirst({
    where: {
      id: progressEntryId,
      userId
    },
    include: {
      planItem: true
    }
  });

  if (!entry) {
    throw new Error("Progress entry not found.");
  }

  return entry;
}

async function syncPlanItemTags(
  tx: Prisma.TransactionClient,
  userId: string,
  planItemId: string,
  tagNames: string[]
) {
  const normalizedNames = dedupeTagNames(tagNames);

  await tx.planItemTag.deleteMany({
    where: {
      userId,
      planItemId
    }
  });

  if (!normalizedNames.length) {
    return;
  }

  const tagIds: string[] = [];

  for (const tagName of normalizedNames) {
    const tag = await tx.tag.upsert({
      where: {
        userId_normalized: {
          userId,
          normalized: normalizeTagKey(tagName)
        }
      },
      update: {
        name: tagName
      },
      create: {
        userId,
        name: tagName,
        normalized: normalizeTagKey(tagName)
      }
    });
    tagIds.push(tag.id);
  }

  await tx.planItemTag.createMany({
    data: tagIds.map((tagId) => ({
      userId,
      planItemId,
      tagId
    })),
    skipDuplicates: true
  });
}

async function upsertTags(tx: Prisma.TransactionClient, userId: string, tagNames: string[]) {
  const normalizedNames = dedupeTagNames(tagNames);
  const tagIds: string[] = [];

  for (const tagName of normalizedNames) {
    const tag = await tx.tag.upsert({
      where: {
        userId_normalized: {
          userId,
          normalized: normalizeTagKey(tagName)
        }
      },
      update: {
        name: tagName
      },
      create: {
        userId,
        name: tagName,
        normalized: normalizeTagKey(tagName)
      }
    });
    tagIds.push(tag.id);
  }

  return tagIds;
}

async function syncProgressEntryTags(
  tx: Prisma.TransactionClient,
  userId: string,
  progressEntryId: string,
  tagNames: string[]
) {
  const tagIds = await upsertTags(tx, userId, tagNames);

  await tx.progressEntryTag.deleteMany({
    where: {
      userId,
      progressEntryId
    }
  });

  if (!tagIds.length) return;

  await tx.progressEntryTag.createMany({
    data: tagIds.map((tagId) => ({
      userId,
      progressEntryId,
      tagId
    })),
    skipDuplicates: true
  });
}

async function syncManualActualGroupTags(
  tx: Prisma.TransactionClient,
  userId: string,
  manualActualGroupId: string,
  tagNames: string[]
) {
  const tagIds = await upsertTags(tx, userId, tagNames);

  await tx.manualActualGroupTag.deleteMany({
    where: {
      userId,
      manualActualGroupId
    }
  });

  if (!tagIds.length) return;

  await tx.manualActualGroupTag.createMany({
    data: tagIds.map((tagId) => ({
      userId,
      manualActualGroupId,
      tagId
    })),
    skipDuplicates: true
  });
}

async function createTrashEntry(
  tx: Prisma.TransactionClient,
  params: { userId: string; kind: string; title: string; payload: unknown }
) {
  await tx.trashEntry.deleteMany({
    where: {
      userId: params.userId,
      expiresAt: { lt: new Date() }
    }
  });

  await tx.trashEntry.create({
    data: {
      userId: params.userId,
      kind: params.kind,
      title: params.title,
      payload: toTrashPayload(params.payload),
      expiresAt: trashExpiresAt()
    }
  });
}

async function buildProgressEntryTrashPayload(tx: Prisma.TransactionClient, userId: string, progressEntryId: string) {
  const entry = await tx.progressEntry.findFirst({
    where: { id: progressEntryId, userId },
    include: { tags: { include: { tag: true } } }
  });
  if (!entry) throw new Error("Progress entry not found.");

  return {
    entry: {
      id: entry.id,
      dayId: entry.dayId,
      planItemId: entry.planItemId,
      titleSnapshot: entry.titleSnapshot,
      content: entry.content,
      startMinute: entry.startMinute,
      endMinute: entry.endMinute,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    },
    tags: entry.tags.map((tagEntry) => tagEntry.tag.name)
  };
}

async function restoreProgressEntryFromPayload(tx: Prisma.TransactionClient, userId: string, payload: Record<string, any>) {
  const entry = payload.entry;
  if (!entry?.id) throw new Error("回收站进展数据缺失。");

  const [day, planItem, existingEntry] = await Promise.all([
    tx.day.findFirst({ where: { id: entry.dayId, userId } }),
    entry.planItemId ? tx.planItem.findFirst({ where: { id: entry.planItemId, userId } }) : Promise.resolve(null),
    tx.progressEntry.findFirst({ where: { id: entry.id, userId } })
  ]);
  if (!day) throw new Error("原日期不存在，无法恢复。");

  if (!existingEntry) {
    await tx.progressEntry.create({
      data: {
        id: entry.id,
        userId,
        dayId: entry.dayId,
        planItemId: planItem ? entry.planItemId : null,
        titleSnapshot: entry.titleSnapshot,
        content: entry.content,
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        createdAt: fromTrashDate(entry.createdAt),
        updatedAt: fromTrashDate(entry.updatedAt)
      }
    });
  }
  await syncProgressEntryTags(tx, userId, entry.id, payload.tags ?? []);
}

async function buildManualActualItemTrashPayload(tx: Prisma.TransactionClient, userId: string, itemId: string) {
  const item = await tx.manualActualItem.findFirst({
    where: { id: itemId, group: { userId } }
  });
  if (!item) throw new Error("Actual item not found.");

  return {
    item: {
      id: item.id,
      groupId: item.groupId,
      content: item.content,
      displayOrder: item.displayOrder,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }
  };
}

async function restoreManualActualItemFromPayload(tx: Prisma.TransactionClient, userId: string, payload: Record<string, any>) {
  const item = payload.item;
  if (!item?.id) throw new Error("回收站条目数据缺失。");

  const [group, existingItem] = await Promise.all([
    tx.manualActualGroup.findFirst({ where: { id: item.groupId, userId } }),
    tx.manualActualItem.findFirst({ where: { id: item.id, group: { userId } } })
  ]);
  if (!group) throw new Error("原项目不存在，无法恢复这条实际。");
  if (existingItem) return;

  await tx.manualActualItem.create({
    data: {
      id: item.id,
      groupId: item.groupId,
      content: item.content,
      displayOrder: item.displayOrder,
      createdAt: fromTrashDate(item.createdAt),
      updatedAt: fromTrashDate(item.updatedAt)
    }
  });
}

async function buildManualActualGroupTrashPayload(tx: Prisma.TransactionClient, userId: string, groupId: string) {
  const group = await tx.manualActualGroup.findFirst({
    where: { id: groupId, userId },
    include: {
      tags: { include: { tag: true } },
      items: true
    }
  });
  if (!group) throw new Error("Actual group not found.");

  return {
    group: {
      id: group.id,
      dayId: group.dayId,
      title: group.title,
      displayOrder: group.displayOrder,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    },
    tags: group.tags.map((tagEntry) => tagEntry.tag.name),
    items: group.items.map((item) => ({
      id: item.id,
      content: item.content,
      displayOrder: item.displayOrder,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }))
  };
}

async function restoreManualActualGroupFromPayload(tx: Prisma.TransactionClient, userId: string, payload: Record<string, any>) {
  const group = payload.group;
  if (!group?.id) throw new Error("回收站实际数据缺失。");

  const [day, existingGroup] = await Promise.all([
    tx.day.findFirst({ where: { id: group.dayId, userId } }),
    tx.manualActualGroup.findFirst({ where: { id: group.id, userId } })
  ]);
  if (!day) throw new Error("原日期不存在，无法恢复。");

  if (!existingGroup) {
    await tx.manualActualGroup.create({
      data: {
        id: group.id,
        userId,
        dayId: group.dayId,
        title: group.title,
        displayOrder: group.displayOrder,
        createdAt: fromTrashDate(group.createdAt),
        updatedAt: fromTrashDate(group.updatedAt)
      }
    });
  }
  await syncManualActualGroupTags(tx, userId, group.id, payload.tags ?? []);

  for (const item of payload.items ?? []) {
    const existingItem = await tx.manualActualItem.findFirst({ where: { id: item.id, group: { userId } } });
    if (existingItem) continue;
    await tx.manualActualItem.create({
      data: {
        id: item.id,
        groupId: group.id,
        content: item.content,
        displayOrder: item.displayOrder,
        createdAt: fromTrashDate(item.createdAt),
        updatedAt: fromTrashDate(item.updatedAt)
      }
    });
  }
}

async function buildPlanItemTrashPayload(tx: Prisma.TransactionClient, userId: string, planItemId: string) {
  const item = await tx.planItem.findFirst({
    where: { id: planItemId, userId },
    include: {
      tags: { include: { tag: true } },
      dayStates: true,
      progressEntries: { include: { tags: { include: { tag: true } } } },
      noteEntries: { select: { id: true } }
    }
  });
  if (!item) throw new Error("Plan item not found.");

  return {
    item: {
      id: item.id,
      sectionId: item.sectionId,
      weekId: item.weekId,
      scope: item.scope,
      sectionKind: item.sectionKind,
      title: item.title,
      monthStart: item.monthStart,
      sourceItemId: item.sourceItemId,
      displayOrder: item.displayOrder,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    },
    tags: item.tags.map((entry) => entry.tag.name),
    dayStates: item.dayStates.map((state) => ({
      id: state.id,
      dayId: state.dayId,
      completed: state.completed,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt
    })),
    progressEntries: item.progressEntries.map((entry) => ({
      entry: {
        id: entry.id,
        dayId: entry.dayId,
        titleSnapshot: entry.titleSnapshot,
        content: entry.content,
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt
      },
      tags: entry.tags.map((tagEntry) => tagEntry.tag.name)
    })),
    noteEntryIds: item.noteEntries.map((entry) => entry.id)
  };
}

async function restorePlanItemFromPayload(tx: Prisma.TransactionClient, userId: string, payload: Record<string, any>) {
  const item = payload.item;
  if (!item?.id) throw new Error("回收站计划数据缺失。");

  const existingItem = await tx.planItem.findFirst({ where: { id: item.id, userId } });
  if (!existingItem) {
    const [section, week, sourceItem] = await Promise.all([
      item.sectionId ? tx.planSection.findFirst({ where: { id: item.sectionId, userId } }) : Promise.resolve(null),
      item.weekId ? tx.week.findFirst({ where: { id: item.weekId, userId } }) : Promise.resolve(null),
      item.sourceItemId ? tx.planItem.findFirst({ where: { id: item.sourceItemId, userId } }) : Promise.resolve(null)
    ]);

    await tx.planItem.create({
      data: {
        id: item.id,
        userId,
        sectionId: section ? item.sectionId : null,
        weekId: week ? item.weekId : null,
        scope: item.scope,
        sectionKind: item.sectionKind,
        title: item.title,
        monthStart: item.monthStart ? fromTrashDate(item.monthStart) : null,
        sourceItemId: sourceItem ? item.sourceItemId : null,
        displayOrder: item.displayOrder,
        createdAt: fromTrashDate(item.createdAt),
        updatedAt: fromTrashDate(item.updatedAt)
      }
    });
  }

  await syncPlanItemTags(tx, userId, item.id, payload.tags ?? []);

  for (const state of payload.dayStates ?? []) {
    const day = await tx.day.findFirst({ where: { id: state.dayId, userId } });
    if (!day) continue;
    await tx.planItemDayState.upsert({
      where: { planItemId_dayId: { planItemId: item.id, dayId: state.dayId } },
      update: { completed: Boolean(state.completed) },
      create: {
        id: state.id,
        userId,
        planItemId: item.id,
        dayId: state.dayId,
        completed: Boolean(state.completed),
        createdAt: fromTrashDate(state.createdAt),
        updatedAt: fromTrashDate(state.updatedAt)
      }
    });
  }

  for (const progress of payload.progressEntries ?? []) {
    const entry = progress.entry;
    const day = await tx.day.findFirst({ where: { id: entry.dayId, userId } });
    if (!day) continue;
    const existingEntry = await tx.progressEntry.findFirst({ where: { id: entry.id, userId } });
    if (!existingEntry) {
      await tx.progressEntry.create({
        data: {
          id: entry.id,
          userId,
          dayId: entry.dayId,
          planItemId: item.id,
          titleSnapshot: entry.titleSnapshot,
          content: entry.content,
          startMinute: entry.startMinute,
          endMinute: entry.endMinute,
          createdAt: fromTrashDate(entry.createdAt),
          updatedAt: fromTrashDate(entry.updatedAt)
        }
      });
    }
    await syncProgressEntryTags(tx, userId, entry.id, progress.tags ?? []);
  }

  const noteEntryIds = (payload.noteEntryIds ?? []).filter((id: unknown): id is string => typeof id === "string");
  if (noteEntryIds.length) {
    await tx.noteEntry.updateMany({
      where: { userId, id: { in: noteEntryIds } },
      data: { planItemId: item.id }
    });
  }
}

async function buildSectionTrashPayload(tx: Prisma.TransactionClient, userId: string, sectionId: string) {
  const section = await tx.planSection.findFirst({
    where: { id: sectionId, userId, isCustom: true },
    include: { planItems: true }
  });
  if (!section) throw new Error("Section not found.");

  return {
    section: {
      id: section.id,
      dayId: section.dayId,
      kind: section.kind,
      title: section.title,
      placeholder: section.placeholder,
      tone: section.tone,
      isCustom: section.isCustom,
      displayOrder: section.displayOrder,
      createdAt: section.createdAt,
      updatedAt: section.updatedAt
    },
    items: await Promise.all(section.planItems.map((item) => buildPlanItemTrashPayload(tx, userId, item.id)))
  };
}

async function restoreSectionFromPayload(tx: Prisma.TransactionClient, userId: string, payload: Record<string, any>) {
  const section = payload.section;
  if (!section?.id) throw new Error("回收站分组数据缺失。");

  const [day, existingSection] = await Promise.all([
    tx.day.findFirst({ where: { id: section.dayId, userId } }),
    tx.planSection.findFirst({ where: { id: section.id, userId } })
  ]);
  if (!day) throw new Error("原日期不存在，无法恢复。");

  if (!existingSection) {
    await tx.planSection.create({
      data: {
        id: section.id,
        userId,
        dayId: section.dayId,
        kind: section.kind,
        title: section.title,
        placeholder: section.placeholder,
        tone: section.tone,
        isCustom: Boolean(section.isCustom),
        displayOrder: section.displayOrder,
        createdAt: fromTrashDate(section.createdAt),
        updatedAt: fromTrashDate(section.updatedAt)
      }
    });
  }

  for (const itemPayload of payload.items ?? []) {
    await restorePlanItemFromPayload(tx, userId, itemPayload);
  }
}

async function restoreDayNoteEntryFromPayload(tx: Prisma.TransactionClient, userId: string, payload: Record<string, any>) {
  const day = await tx.day.findFirst({ where: { id: payload.dayId, userId } });
  if (!day) throw new Error("原日期不存在，无法恢复。");

  const currentSerialized = await getSerializedDayNoteForTransaction(tx, userId, day.id);
  const currentEntries = parseNoteEntries(currentSerialized);
  const entry = payload.entry as NoteEntryDraft | undefined;
  if (!entry?.content) throw new Error("回收站笔记数据缺失。");

  const serializedEntry = noteEntryKey(entry);
  if (currentEntries.some((currentEntry) => noteEntryKey(currentEntry) === serializedEntry)) {
    return;
  }

  const insertIndex = Math.max(0, Math.min(Number(payload.index ?? currentEntries.length), currentEntries.length));
  const nextEntries = [...currentEntries];
  nextEntries.splice(insertIndex, 0, entry);
  await writeDayNoteEntries(tx, userId, day.id, serializeNoteEntries(nextEntries));
}

export async function createTagMutation(params: { user: User; name: string }) {
  const name = normalizeTagName(params.name);
  if (!name) {
    throw new Error("标签名称不能为空。");
  }

  await db.tag.upsert({
    where: {
      userId_normalized: {
        userId: params.user.id,
        normalized: normalizeTagKey(name)
      }
    },
    update: {
      name
    },
    create: {
      userId: params.user.id,
      name,
      normalized: normalizeTagKey(name)
    }
  });
}

export async function renameTagMutation(params: { user: User; tagId: string; name: string }) {
  const userId = params.user.id;
  const name = normalizeTagName(params.name);
  if (!name) {
    throw new Error("标签名称不能为空。");
  }

  await db.$transaction(async (tx) => {
    const existingTag = await tx.tag.findFirst({
      where: {
        id: params.tagId,
        userId
      }
    });

    if (!existingTag) {
      throw new Error("标签不存在。");
    }

    const normalized = normalizeTagKey(name);
    const targetTag = await tx.tag.findFirst({
      where: {
        userId,
        normalized
      }
    });

    if (!targetTag || targetTag.id === existingTag.id) {
      await tx.tag.update({
        where: {
          id: existingTag.id
        },
        data: {
          name,
          normalized
        }
      });
      return;
    }

    const [planItemTags, progressEntryTags, manualActualGroupTags] = await Promise.all([
      tx.planItemTag.findMany({ where: { userId, tagId: existingTag.id }, select: { planItemId: true } }),
      tx.progressEntryTag.findMany({ where: { userId, tagId: existingTag.id }, select: { progressEntryId: true } }),
      tx.manualActualGroupTag.findMany({ where: { userId, tagId: existingTag.id }, select: { manualActualGroupId: true } })
    ]);

    await tx.planItemTag.createMany({
      data: planItemTags.map((entry) => ({ userId, planItemId: entry.planItemId, tagId: targetTag.id })),
      skipDuplicates: true
    });
    await tx.progressEntryTag.createMany({
      data: progressEntryTags.map((entry) => ({ userId, progressEntryId: entry.progressEntryId, tagId: targetTag.id })),
      skipDuplicates: true
    });
    await tx.manualActualGroupTag.createMany({
      data: manualActualGroupTags.map((entry) => ({ userId, manualActualGroupId: entry.manualActualGroupId, tagId: targetTag.id })),
      skipDuplicates: true
    });

    await tx.tag.delete({
      where: {
        id: existingTag.id
      }
    });
  });
}

export async function deleteTagMutation(params: { user: User; tagId: string }) {
  await db.tag.deleteMany({
    where: {
      id: params.tagId,
      userId: params.user.id
    }
  });
}

export async function getTrashEntries(user: User) {
  await db.trashEntry.deleteMany({
    where: {
      userId: user.id,
      expiresAt: { lt: new Date() }
    }
  });

  return db.trashEntry.findMany({
    where: {
      userId: user.id,
      restoredAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      title: true,
      createdAt: true,
      expiresAt: true
    }
  });
}

export async function restoreTrashEntryMutation(params: { user: User; trashEntryId: string }) {
  await db.$transaction(async (tx) => {
    const trashEntry = await tx.trashEntry.findFirst({
      where: {
        id: params.trashEntryId,
        userId: params.user.id,
        restoredAt: null,
        expiresAt: { gt: new Date() }
      }
    });

    if (!trashEntry) {
      throw new Error("回收站条目不存在或已过期。");
    }

    const payload = getPayloadObject(trashEntry.payload);
    switch (trashEntry.kind) {
      case "section":
        await restoreSectionFromPayload(tx, params.user.id, payload);
        break;
      case "plan-item":
        await restorePlanItemFromPayload(tx, params.user.id, payload);
        break;
      case "progress-entry":
        await restoreProgressEntryFromPayload(tx, params.user.id, payload);
        break;
      case "manual-actual-group":
        await restoreManualActualGroupFromPayload(tx, params.user.id, payload);
        break;
      case "manual-actual-item":
        await restoreManualActualItemFromPayload(tx, params.user.id, payload);
        break;
      case "day-note-entry":
        await restoreDayNoteEntryFromPayload(tx, params.user.id, payload);
        break;
      default:
        throw new Error("暂不支持恢复这个类型。");
    }

    await tx.trashEntry.update({
      where: { id: trashEntry.id },
      data: { restoredAt: new Date() }
    });
  });
}

function mapPersistedNoteEntries(entries: PersistedNoteEntry[]): NoteEntryDraft[] {
  return entries.map((entry) => {
    if (entry.kind === NoteEntryKind.PROJECT) {
      return {
        kind: "project",
        content: entry.content,
        projectTitle: entry.titleSnapshot ?? "项目笔记",
        projectId: entry.planItemId
      };
    }

    return {
      kind: "plain",
      content: entry.content
    };
  });
}

function noteEntryKey(entry: NoteEntryDraft) {
  return serializeNoteEntries([entry]);
}

function findRemovedNoteEntries(previousEntries: NoteEntryDraft[], nextEntries: NoteEntryDraft[]) {
  const nextCounts = new Map<string, number>();
  nextEntries.forEach((entry) => {
    const key = noteEntryKey(entry);
    nextCounts.set(key, (nextCounts.get(key) ?? 0) + 1);
  });

  return previousEntries
    .map((entry, index) => ({ entry, index, key: noteEntryKey(entry) }))
    .filter((candidate) => {
      const remainingCount = nextCounts.get(candidate.key) ?? 0;
      if (remainingCount > 0) {
        nextCounts.set(candidate.key, remainingCount - 1);
        return false;
      }
      return true;
    });
}

async function getSerializedDayNoteForTransaction(tx: Prisma.TransactionClient, userId: string, dayId: string) {
  const noteEntries = await tx.noteEntry.findMany({
    where: { userId, dayId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
  });
  return serializeNoteEntries(mapPersistedNoteEntries(noteEntries));
}

async function writeDayNoteEntries(
  tx: Prisma.TransactionClient,
  userId: string,
  dayId: string,
  serializedContent: string
) {
  const entries = parseNoteEntries(serializedContent);
  const candidatePlanItemIds = Array.from(
    new Set(
      entries
        .filter((entry): entry is Extract<NoteEntryDraft, { kind: "project" }> => entry.kind === "project")
        .map((entry) => entry.projectId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const existingPlanItemIds = candidatePlanItemIds.length
    ? new Set(
        (
          await tx.planItem.findMany({
            where: {
              userId,
              id: {
                in: candidatePlanItemIds
              }
            },
            select: {
              id: true
            }
          })
        ).map((item) => item.id)
      )
    : new Set<string>();

  await tx.noteEntry.deleteMany({
    where: {
      userId,
      dayId
    }
  });

  if (entries.length) {
    await tx.noteEntry.createMany({
      data: entries.map((entry, index) => {
        if (entry.kind === "project") {
          return {
            userId,
            dayId,
            kind: NoteEntryKind.PROJECT,
            planItemId: entry.projectId && existingPlanItemIds.has(entry.projectId) ? entry.projectId : null,
            titleSnapshot: entry.projectTitle,
            content: entry.content,
            displayOrder: index
          };
        }

        return {
          userId,
          dayId,
          kind: NoteEntryKind.PLAIN,
          titleSnapshot: null,
          content: entry.content,
          displayOrder: index
        };
      })
    });
  }

  await tx.day.update({
    where: {
      id: dayId
    },
    data: {
      note: serializedContent
    }
  });
}

async function getSerializedDayNote(userId: string, day: Day) {
  let noteEntries = await db.noteEntry.findMany({
    where: {
      userId,
      dayId: day.id
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
  });

  if (!noteEntries.length && day.note.trim()) {
    await db.$transaction((tx) => writeDayNoteEntries(tx, userId, day.id, day.note));
    noteEntries = await db.noteEntry.findMany({
      where: {
        userId,
        dayId: day.id
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
    });
  }

  return serializeNoteEntries(mapPersistedNoteEntries(noteEntries));
}

async function nextSectionDisplayOrder(dayId: string) {
  const top = await db.planSection.findFirst({
    where: { dayId },
    orderBy: { displayOrder: "desc" }
  });
  return (top?.displayOrder ?? 2) + 1;
}

async function nextPlanItemDisplayOrder(where: Prisma.PlanItemWhereInput) {
  const top = await db.planItem.findFirst({
    where,
    orderBy: { displayOrder: "asc" }
  });
  return (top?.displayOrder ?? 1) - 1;
}

function mapItemsForSection(
  section: PlanSection,
  items: PlanItemWithTags[],
  completionMap: Map<string, { completed: boolean; completedAt: string | null }>
): ClientPlanSection {
  return {
    id: section.id,
    kind: sectionKindToClient(section.kind),
    title: section.title,
    placeholder: section.placeholder,
    tone: sectionToneToClient(section.tone),
    isCustom: section.isCustom,
    items: items
      .map((item) => {
        const derivedTodayPlanSource = getDerivedTodayPlanSource(item);
        const derivedTodayPlan = Boolean(derivedTodayPlanSource);
        return {
          id: item.id,
          title: item.title,
          completed: completionMap.get(item.id)?.completed ?? false,
          completedAt: completionMap.get(item.id)?.completedAt ?? null,
          sourceItemId: derivedTodayPlanSource?.id ?? null,
          sourceTitle: derivedTodayPlanSource?.title ?? null,
          isDerivedTodayPlan: derivedTodayPlan,
          tags: item.tags.map((entry) => ({
            id: entry.tag.id,
            name: entry.tag.name
          })),
          displayOrder: item.displayOrder
        };
      })
      .sort((left, right) => Number(left.completed) - Number(right.completed) || left.displayOrder - right.displayOrder)
      .map(({ displayOrder, ...item }) => item)
  };
}

async function buildDayStateForDate(user: User, date: Date): Promise<{ day: DayState; dayRecord: Day }> {
  const day = await ensureDay(user.id, date);
  const week = await ensureWeek(user.id, getWeekStart(date));
  const monthStart = getMonthStart(date);

  const [sections, dayItems, weekItems, monthItems, dayStates, progressEntries, manualGroups] = await Promise.all([
    db.planSection.findMany({
      where: {
        userId: user.id,
        dayId: day.id
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
    }),
    db.planItem.findMany({
      where: {
        userId: user.id,
        scope: PlanItemScope.DAY,
        section: {
          dayId: day.id
        }
      },
      include: {
        sourceItem: {
          include: {
            sourceItem: true
          }
        },
        tags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
    }),
    db.planItem.findMany({
      where: {
        userId: user.id,
        scope: PlanItemScope.WEEK,
        weekId: week.id
      },
      include: {
        sourceItem: {
          include: {
            sourceItem: true
          }
        },
        tags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
    }),
    db.planItem.findMany({
      where: {
        userId: user.id,
        scope: PlanItemScope.MONTH,
        monthStart
      },
      include: {
        sourceItem: {
          include: {
            sourceItem: true
          }
        },
        tags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
    }),
    db.planItemDayState.findMany({
      where: {
        userId: user.id,
        dayId: day.id
      }
    }),
    db.progressEntry.findMany({
      where: {
        userId: user.id,
        dayId: day.id
      },
      include: {
        planItem: {
          include: {
            sourceItem: {
              include: {
                sourceItem: true
              }
            },
            tags: {
              include: {
                tag: true
              }
            }
          }
        },
        tags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: [{ startMinute: "asc" }, { endMinute: "asc" }, { createdAt: "asc" }]
    }),
    db.manualActualGroup.findMany({
      where: {
        userId: user.id,
        dayId: day.id
      },
      include: {
        items: {
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
        },
        tags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
    })
  ]);

  const completionMap = new Map(
    dayStates.map((entry) => [
      entry.planItemId,
      {
        completed: entry.completed,
        completedAt: entry.completed ? entry.updatedAt.toISOString() : null
      }
    ])
  );
  const todaySection = sections.find((section) => section.kind === SectionKind.TODAY);
  const weekSection = sections.find((section) => section.kind === SectionKind.WEEK);
  const longSection = sections.find((section) => section.kind === SectionKind.LONG);
  const customSections = sections.filter((section) => section.kind === SectionKind.CUSTOM);

  const sectionItems = new Map<string, PlanItemWithTags[]>();
  dayItems.forEach((item) => {
    const key = item.sectionId;
    if (!key) return;
    const current = sectionItems.get(key) ?? [];
    current.push(item);
    sectionItems.set(key, current);
  });

  const mappedSections: ClientPlanSection[] = [];
  if (todaySection) {
    mappedSections.push(mapItemsForSection(todaySection, sectionItems.get(todaySection.id) ?? [], completionMap));
  }
  if (weekSection) {
    mappedSections.push(mapItemsForSection(weekSection, weekItems, completionMap));
  }
  if (longSection) {
    mappedSections.push(mapItemsForSection(longSection, monthItems, completionMap));
  }
  customSections.forEach((section) => {
    mappedSections.push(mapItemsForSection(section, sectionItems.get(section.id) ?? [], completionMap));
  });

  const serializedNote = await getSerializedDayNote(user.id, day);

  const dayState: DayState = {
    planSections: mappedSections,
    progressEntries: progressEntries.map((entry) => {
      const derivedTodayPlanSource = entry.planItem ? getDerivedTodayPlanSource(entry.planItem) : null;
      const derivedTodayPlan = Boolean(derivedTodayPlanSource);
      return {
        id: entry.id,
        planItemId: entry.planItemId,
        sourceItemId: derivedTodayPlanSource?.id ?? null,
        sourceTitle: derivedTodayPlan ? derivedTodayPlanSource?.title ?? null : entry.planItem?.title ?? (entry.planItemId ? entry.titleSnapshot : null),
        planItemTitle: derivedTodayPlan ? entry.planItem?.title ?? null : null,
        isDerivedTodayPlan: derivedTodayPlan,
        tags: entry.planItemId
          ? entry.planItem?.tags.map((tagEntry) => ({
              id: tagEntry.tag.id,
              name: tagEntry.tag.name
            })) ?? []
          : entry.tags.map((tagEntry) => ({
              id: tagEntry.tag.id,
              name: tagEntry.tag.name
            })),
        content: entry.content,
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString()
      };
    }),
    manualActualGroups: manualGroups.map((group) => ({
      id: group.id,
      title: group.title,
      tags: group.tags.map((tagEntry) => ({
        id: tagEntry.tag.id,
        name: tagEntry.tag.name
      })),
      updatedAt: group.updatedAt.toISOString(),
      items: group.items.map((item) => ({
        id: item.id,
        content: item.content
      }))
    })),
    note: serializedNote
  };

  return { day: dayState, dayRecord: day };
}

async function buildWeekDayBundle(user: User, dateKey: string): Promise<{ snapshot: WeekDaySnapshot; day: DayState }> {
  const { day } = await buildDayStateForDate(user, fromDateKey(dateKey));
  return {
    snapshot: {
      dateKey,
      note: day.note,
      actualGroups: buildActualGroups(day)
    },
    day
  };
}

function buildWeekTagSummaries(weekDayBundles: Array<{ snapshot: WeekDaySnapshot; day: DayState }>): WeekTagSummary[] {
  const untaggedSummary = {
    id: "__untagged__",
    name: "无标签"
  };
  const summaryMap = new Map<
    string,
    {
      tagId: string;
      tagName: string;
      actualIds: Set<string>;
      planTitles: Set<string>;
      progressCount: number;
      groups: Map<
        string,
        {
          planItemId: string;
          title: string;
          items: Array<{ id: string; content: string; dateKey: string }>;
          itemKeys: Set<string>;
        }
      >;
    }
  >();

  weekDayBundles.forEach((bundle) => {
    bundle.snapshot.actualGroups.forEach((actualGroup) => {
      const tags = actualGroup.tags.length ? actualGroup.tags : [untaggedSummary];

      tags.forEach((tag) => {
        if (!summaryMap.has(tag.id)) {
          summaryMap.set(tag.id, {
            tagId: tag.id,
            tagName: tag.name,
            actualIds: new Set<string>(),
            planTitles: new Set<string>(),
            progressCount: 0,
            groups: new Map()
          });
        }

        const summary = summaryMap.get(tag.id)!;
        const groupId = `${actualGroup.kind}:${actualGroup.id}`;
        summary.actualIds.add(groupId);
        summary.planTitles.add(actualGroup.title);

        if (!summary.groups.has(groupId)) {
          summary.groups.set(groupId, {
            planItemId: groupId,
            title: actualGroup.title,
            items: [],
            itemKeys: new Set<string>()
          });
        }

        const group = summary.groups.get(groupId)!;
        actualGroup.items.forEach((item) => {
          const content = item.content.trim();
          if (!content) return;

          const itemKey = `${bundle.snapshot.dateKey}:${item.id}:${content}`;
          if (group.itemKeys.has(itemKey)) return;
          group.itemKeys.add(itemKey);

          group.items.push({
            id: item.id,
            content,
            dateKey: bundle.snapshot.dateKey
          });
        });

        summary.progressCount += Math.max(1, actualGroup.items.length);
      });
    });
  });

  return Array.from(summaryMap.values())
    .map((entry) => ({
      tagId: entry.tagId,
      tagName: entry.tagName,
      actualCount: entry.actualIds.size,
      progressCount: entry.progressCount,
      planTitles: Array.from(entry.planTitles),
      groups: Array.from(entry.groups.values())
        .map(({ itemKeys, ...group }) => group)
        .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"))
    }))
    .sort((left, right) => {
      if (left.tagId === untaggedSummary.id) return 1;
      if (right.tagId === untaggedSummary.id) return -1;
      return right.progressCount - left.progressCount || right.actualCount - left.actualCount || left.tagName.localeCompare(right.tagName, "zh-CN");
    });
}

export async function getDayfoldSnapshot(user: User, selectedDateKey: string): Promise<DayfoldSnapshot> {
  const selectedDate = fromDateKey(selectedDateKey);
  const { day } = await buildDayStateForDate(user, selectedDate);
  const week = await ensureWeek(user.id, getWeekStart(selectedDate));
  const weekDayKeys = getWeekDateKeys(selectedDate);
  const [weekDayBundles, availableTags] = await Promise.all([
    Promise.all(weekDayKeys.map((dateKey) => buildWeekDayBundle(user, dateKey))),
    db.tag.findMany({
      where: { userId: user.id },
      orderBy: [{ name: "asc" }]
    })
  ]);

  return {
    selectedDateKey,
    day,
    dayActualGroups: buildActualGroups(day),
    weekReview: week.review,
    weekDays: weekDayBundles.map((bundle) => bundle.snapshot),
    availableTags: availableTags.map((tag) => ({
      id: tag.id,
      name: tag.name
    })),
    weekTagSummaries: buildWeekTagSummaries(weekDayBundles)
  };
}

export async function createCustomSection(user: User, selectedDateKey: string) {
  const date = fromDateKey(selectedDateKey);
  const day = await ensureDay(user.id, date);
  const displayOrder = await nextSectionDisplayOrder(day.id);

  await db.planSection.create({
    data: {
      userId: user.id,
      dayId: day.id,
      kind: SectionKind.CUSTOM,
      title: "新计划",
      placeholder: "添加这一栏里的计划",
      tone: SectionTone.SECONDARY,
      isCustom: true,
      displayOrder
    }
  });
}

export async function renameSection(user: User, sectionId: string, title: string) {
  await db.planSection.updateMany({
    where: {
      id: sectionId,
      userId: user.id,
      isCustom: true
    },
    data: {
      title
    }
  });
}

export async function deleteSection(user: User, sectionId: string) {
  await db.$transaction(async (tx) => {
    const payload = await buildSectionTrashPayload(tx, user.id, sectionId);
    await createTrashEntry(tx, {
      userId: user.id,
      kind: "section",
      title: payload.section.title,
      payload
    });
    await tx.planSection.deleteMany({
      where: {
        id: sectionId,
        userId: user.id,
        isCustom: true
      }
    });
  });
}

export async function createPlanItemMutation(params: {
  user: User;
  selectedDateKey: string;
  sectionId: string;
  title: string;
  tags?: string[];
}) {
  const user = params.user;
  const date = fromDateKey(params.selectedDateKey);
  const section = await getSectionOrThrow(user.id, params.sectionId);
  const tagNames = dedupeTagNames(params.tags ?? []);

  if (section.kind === SectionKind.WEEK) {
    const week = await ensureWeek(user.id, getWeekStart(date));
    const displayOrder = await nextPlanItemDisplayOrder({
      userId: user.id,
      scope: PlanItemScope.WEEK,
      weekId: week.id
    });

    await db.$transaction(async (tx) => {
      const planItem = await tx.planItem.create({
        data: {
          userId: user.id,
          weekId: week.id,
          scope: PlanItemScope.WEEK,
          sectionKind: SectionKind.WEEK,
          title: params.title,
          displayOrder
        }
      });
      await syncPlanItemTags(tx, user.id, planItem.id, tagNames);
    });
    return;
  }

  if (section.kind === SectionKind.LONG) {
    const displayOrder = await nextPlanItemDisplayOrder({
      userId: user.id,
      scope: PlanItemScope.MONTH,
      monthStart: getMonthStart(date)
    });

    await db.$transaction(async (tx) => {
      const planItem = await tx.planItem.create({
        data: {
          userId: user.id,
          scope: PlanItemScope.MONTH,
          sectionKind: SectionKind.LONG,
          title: params.title,
          monthStart: getMonthStart(date),
          displayOrder
        }
      });
      await syncPlanItemTags(tx, user.id, planItem.id, tagNames);
    });
    return;
  }

  const displayOrder = await nextPlanItemDisplayOrder({
    userId: user.id,
    scope: PlanItemScope.DAY,
    sectionId: section.id
  });

  await db.$transaction(async (tx) => {
    const planItem = await tx.planItem.create({
      data: {
        userId: user.id,
        sectionId: section.id,
        scope: PlanItemScope.DAY,
        sectionKind: section.kind,
        title: params.title,
        displayOrder
      }
    });
    await syncPlanItemTags(tx, user.id, planItem.id, tagNames);
  });
}

export async function createTodayPlanFromItemMutation(params: {
  user: User;
  selectedDateKey: string;
  sourceItemId: string;
  title: string;
}) {
  const user = params.user;
  const source = await getPlanItemOrThrow(user.id, params.sourceItemId);
  const day = await ensureDay(user.id, fromDateKey(params.selectedDateKey));
  const todaySection = await db.planSection.findFirstOrThrow({
    where: {
      userId: user.id,
      dayId: day.id,
      kind: SectionKind.TODAY
    }
  });
  const displayOrder = await nextPlanItemDisplayOrder({
    userId: user.id,
    scope: PlanItemScope.DAY,
    sectionId: todaySection.id
  });

  await db.$transaction(async (tx) => {
    const planItem = await tx.planItem.create({
      data: {
        userId: user.id,
        sectionId: todaySection.id,
        scope: PlanItemScope.DAY,
        sectionKind: SectionKind.TODAY,
        title: params.title,
        sourceItemId: source.id,
        displayOrder
      }
    });
    await syncPlanItemTags(
      tx,
      user.id,
      planItem.id,
      source.tags.map((entry) => entry.tag.name)
    );
  });
}

export async function togglePlanItemMutation(params: {
  user: User;
  selectedDateKey: string;
  planItemId: string;
}) {
  const user = params.user;
  const selectedDate = fromDateKey(params.selectedDateKey);
  const day = await ensureDay(user.id, selectedDate);
  const planItem = await getPlanItemOrThrow(user.id, params.planItemId);
  const existing = await db.planItemDayState.findUnique({
    where: {
      planItemId_dayId: {
        planItemId: params.planItemId,
        dayId: day.id
      }
    }
  });

  const nextCompleted = !(existing?.completed ?? false);

  let targetItemIds = [params.planItemId];
  let targetDateKeys = [params.selectedDateKey];

  if (planItem.scope === PlanItemScope.WEEK) {
    targetDateKeys = getWeekDateKeys(selectedDate).filter((dateKey) => dateKey >= params.selectedDateKey);
  } else if (planItem.scope === PlanItemScope.MONTH) {
    targetDateKeys = getMonthDateKeys(selectedDate).filter((dateKey) => dateKey >= params.selectedDateKey);
  } else if (planItem.scope === PlanItemScope.DAY && planItem.sourceItemId) {
    const futureDerivedItems = await db.planItem.findMany({
      where: {
        userId: user.id,
        scope: PlanItemScope.DAY,
        sourceItemId: planItem.sourceItemId,
        section: {
          day: {
            date: {
              gte: selectedDate
            }
          }
        }
      },
      select: {
        id: true,
        section: {
          select: {
            day: {
              select: {
                date: true
              }
            }
          }
        }
      }
    });

    targetItemIds = futureDerivedItems.map((item) => item.id);
    targetDateKeys = futureDerivedItems.map((item) => toDateKey(item.section!.day.date));
  }

  const targetDays = await Promise.all(targetDateKeys.map((dateKey) => ensureDay(user.id, fromDateKey(dateKey))));

  await db.$transaction(
    targetDays.flatMap((targetDay, index) => {
      const targetPlanItemId = planItem.scope === PlanItemScope.DAY && planItem.sourceItemId ? targetItemIds[index] : params.planItemId;
      if (!targetPlanItemId) return [];

      return db.planItemDayState.upsert({
        where: {
          planItemId_dayId: {
            planItemId: targetPlanItemId,
            dayId: targetDay.id
          }
        },
        update: {
          completed: nextCompleted
        },
        create: {
          userId: user.id,
          planItemId: targetPlanItemId,
          dayId: targetDay.id,
          completed: nextCompleted
        }
      });
    })
  );
}

export async function renamePlanItemMutation(params: {
  user: User;
  planItemId: string;
  title: string;
  tags?: string[];
}) {
  const user = params.user;
  await db.$transaction(async (tx) => {
    await tx.planItem.updateMany({
      where: {
        id: params.planItemId,
        userId: user.id
      },
      data: {
        title: params.title
      }
    });

    if (params.tags) {
      await syncPlanItemTags(tx, user.id, params.planItemId, params.tags);
    }
  });
}

export async function deletePlanItemMutation(params: { user: User; planItemId: string }) {
  const user = params.user;
  await db.$transaction(async (tx) => {
    const payload = await buildPlanItemTrashPayload(tx, user.id, params.planItemId);
    await createTrashEntry(tx, {
      userId: user.id,
      kind: "plan-item",
      title: payload.item.title,
      payload
    });
    await tx.planItem.deleteMany({
      where: {
        id: params.planItemId,
        userId: user.id
      }
    });
  });
}

export async function copyPlanItemToTomorrow(params: {
  user: User;
  selectedDateKey: string;
  planItemId: string;
}) {
  const user = params.user;
  const source = await getPlanItemOrThrow(user.id, params.planItemId);
  const derivedTodayPlanSource = getDerivedTodayPlanSource(source);
  const targetSourceItemId = derivedTodayPlanSource?.id ?? source.id;
  const selectedDate = fromDateKey(params.selectedDateKey);
  selectedDate.setDate(selectedDate.getDate() + 1);
  const targetDay = await ensureDay(user.id, selectedDate);
  const todaySection = await db.planSection.findFirstOrThrow({
    where: {
      userId: user.id,
      dayId: targetDay.id,
      kind: SectionKind.TODAY
    }
  });
  const existingCopy = await db.planItem.findFirst({
    where: {
      userId: user.id,
      sectionId: todaySection.id,
      sourceItemId: targetSourceItemId
    }
  });

  if (existingCopy) {
    return;
  }

  const displayOrder = await nextPlanItemDisplayOrder({
    userId: user.id,
    scope: PlanItemScope.DAY,
    sectionId: todaySection.id
  });

  await db.$transaction(async (tx) => {
    const created = await tx.planItem.create({
      data: {
        userId: user.id,
        sectionId: todaySection.id,
        scope: PlanItemScope.DAY,
        sectionKind: SectionKind.TODAY,
        title: source.title,
        sourceItemId: targetSourceItemId,
        displayOrder
      }
    });
    await syncPlanItemTags(
      tx,
      user.id,
      created.id,
      source.tags.map((entry) => entry.tag.name)
    );
  });
}

export async function copyPlanItemToNextWeek(params: {
  user: User;
  selectedDateKey: string;
  planItemId: string;
}) {
  const user = params.user;
  const source = await getPlanItemOrThrow(user.id, params.planItemId);
  const derivedTodayPlanSource = getDerivedTodayPlanSource(source);
  const targetSourceItemId = derivedTodayPlanSource?.id ?? source.id;
  const selectedDate = fromDateKey(params.selectedDateKey);
  const nextWeekStart = getWeekStart(selectedDate);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const week = await ensureWeek(user.id, nextWeekStart);
  const existingCopy = await db.planItem.findFirst({
    where: {
      userId: user.id,
      weekId: week.id,
      sourceItemId: targetSourceItemId
    }
  });

  if (existingCopy) {
    return;
  }

  const displayOrder = await nextPlanItemDisplayOrder({
    userId: user.id,
    scope: PlanItemScope.WEEK,
    weekId: week.id
  });

  await db.$transaction(async (tx) => {
    const planItem = await tx.planItem.create({
      data: {
        userId: user.id,
        weekId: week.id,
        scope: PlanItemScope.WEEK,
        sectionKind: SectionKind.WEEK,
        title: source.title,
        sourceItemId: targetSourceItemId,
        displayOrder
      }
    });
    await syncPlanItemTags(
      tx,
      user.id,
      planItem.id,
      source.tags.map((entry) => entry.tag.name)
    );
  });
}

export async function createProgressEntryMutation(params: {
  user: User;
  selectedDateKey: string;
  planItemId?: string | null;
  content: string;
  startMinute: number;
  endMinute: number;
}) {
  const user = params.user;
  const day = await ensureDay(user.id, fromDateKey(params.selectedDateKey));
  const planItem = params.planItemId ? await getPlanItemOrThrow(user.id, params.planItemId) : null;
  const content = params.content.trim();

  if (!planItem && !content) {
    throw new Error("不关联项目时，需要填写记录内容。");
  }

  await db.progressEntry.create({
    data: {
      userId: user.id,
      dayId: day.id,
      planItemId: planItem?.id ?? null,
      titleSnapshot: planItem?.title ?? content,
      content,
      startMinute: params.startMinute,
      endMinute: params.endMinute
    }
  });
}

export async function updateProgressEntryMutation(params: {
  user: User;
  progressEntryId: string;
  content: string;
  planItemId?: string | null;
  startMinute?: number;
  endMinute?: number;
}) {
  const user = params.user;
  const existing = await getProgressEntryOrThrow(user.id, params.progressEntryId);
  const hasPlanItemField = Object.prototype.hasOwnProperty.call(params, "planItemId");
  const nextPlanItem =
    hasPlanItemField && params.planItemId ? await getPlanItemOrThrow(user.id, params.planItemId) : null;
  const nextPlanItemId = hasPlanItemField ? params.planItemId ?? null : existing.planItemId;
  const content = params.content.trim();
  const nextTitleSnapshot = nextPlanItemId ? nextPlanItem?.title ?? existing.titleSnapshot : content;

  if (!nextPlanItemId && !content) {
    throw new Error("不关联项目时，需要填写记录内容。");
  }

  await db.progressEntry.update({
    where: {
      id: existing.id
    },
    data: {
      content,
      planItemId: nextPlanItemId,
      titleSnapshot: nextTitleSnapshot,
      startMinute: params.startMinute ?? existing.startMinute,
      endMinute: params.endMinute ?? existing.endMinute
    }
  });
}

export async function deleteProgressEntryMutation(params: { user: User; progressEntryId: string }) {
  const user = params.user;
  await db.$transaction(async (tx) => {
    const payload = await buildProgressEntryTrashPayload(tx, user.id, params.progressEntryId);
    await createTrashEntry(tx, {
      userId: user.id,
      kind: "progress-entry",
      title: payload.entry.content || payload.entry.titleSnapshot,
      payload
    });
    await tx.progressEntry.deleteMany({
      where: {
        id: params.progressEntryId,
        userId: user.id
      }
    });
  });
}

export async function createManualActualGroupMutation(params: {
  user: User;
  selectedDateKey: string;
  title: string;
  content?: string;
  tags?: string[];
}) {
  const user = params.user;
  const day = await ensureDay(user.id, fromDateKey(params.selectedDateKey));
  const topGroup = await db.manualActualGroup.findFirst({
    where: {
      userId: user.id,
      dayId: day.id
    },
    orderBy: { displayOrder: "asc" }
  });
  const groupOrder = (topGroup?.displayOrder ?? 1) - 1;

  await db.$transaction(async (tx) => {
    const group = await tx.manualActualGroup.create({
      data: {
        userId: user.id,
        dayId: day.id,
        title: params.title,
        displayOrder: groupOrder,
        items: params.content
          ? {
              create: {
                content: params.content,
                displayOrder: 0
              }
            }
          : undefined
      }
    });

    if (params.tags) {
      await syncManualActualGroupTags(tx, user.id, group.id, params.tags);
    }
  });
}

export async function updateManualActualGroupMutation(params: {
  user: User;
  groupId: string;
  title: string;
  tags?: string[];
}) {
  const user = params.user;
  await db.$transaction(async (tx) => {
    await tx.manualActualGroup.updateMany({
      where: {
        id: params.groupId,
        userId: user.id
      },
      data: {
        title: params.title
      }
    });

    if (params.tags) {
      await syncManualActualGroupTags(tx, user.id, params.groupId, params.tags);
    }
  });
}

export async function updateActualGroupTagsMutation(params: {
  user: User;
  groupKind: TagTargetKind;
  groupId: string;
  tags: string[];
}) {
  const user = params.user;

  await db.$transaction(async (tx) => {
    if (params.groupKind === "linked") {
      const item = await tx.planItem.findFirst({
        where: {
          id: params.groupId,
          userId: user.id
        }
      });
      if (!item) throw new Error("Plan item not found.");
      await syncPlanItemTags(tx, user.id, params.groupId, params.tags);
      return;
    }

    if (params.groupKind === "manual") {
      const group = await tx.manualActualGroup.findFirst({
        where: {
          id: params.groupId,
          userId: user.id
        }
      });
      if (!group) throw new Error("Actual group not found.");
      await syncManualActualGroupTags(tx, user.id, params.groupId, params.tags);
      return;
    }

    const entry = await tx.progressEntry.findFirst({
      where: {
        id: params.groupId,
        userId: user.id
      }
    });
    if (!entry) throw new Error("Progress entry not found.");
    await syncProgressEntryTags(tx, user.id, params.groupId, params.tags);
  });
}

export async function deleteManualActualGroupMutation(params: { user: User; groupId: string }) {
  const user = params.user;
  await db.$transaction(async (tx) => {
    const payload = await buildManualActualGroupTrashPayload(tx, user.id, params.groupId);
    await createTrashEntry(tx, {
      userId: user.id,
      kind: "manual-actual-group",
      title: payload.group.title,
      payload
    });
    await tx.manualActualGroup.deleteMany({
      where: {
        id: params.groupId,
        userId: user.id
      }
    });
  });
}

export async function updateManualActualItemMutation(params: {
  user: User;
  itemId: string;
  content: string;
}) {
  await db.manualActualItem.updateMany({
    where: {
      id: params.itemId,
      group: {
        userId: params.user.id
      }
    },
    data: {
      content: params.content
    }
  });
}

export async function deleteManualActualItemMutation(params: { user: User; itemId: string }) {
  await db.$transaction(async (tx) => {
    const payload = await buildManualActualItemTrashPayload(tx, params.user.id, params.itemId);
    await createTrashEntry(tx, {
      userId: params.user.id,
      kind: "manual-actual-item",
      title: payload.item.content,
      payload
    });
    await tx.manualActualItem.deleteMany({
      where: {
        id: params.itemId,
        group: {
          userId: params.user.id
        }
      }
    });
  });
}

export async function saveDayNoteMutation(params: {
  user: User;
  selectedDateKey: string;
  content: string;
}) {
  const user = params.user;
  const day = await ensureDay(user.id, fromDateKey(params.selectedDateKey));
  await db.$transaction(async (tx) => {
    const currentSerialized = await getSerializedDayNoteForTransaction(tx, user.id, day.id);
    const removedEntries = findRemovedNoteEntries(parseNoteEntries(currentSerialized), parseNoteEntries(params.content));

    for (const removedEntry of removedEntries) {
      await createTrashEntry(tx, {
        userId: user.id,
        kind: "day-note-entry",
        title: removedEntry.entry.kind === "project" ? `${removedEntry.entry.projectTitle}：${removedEntry.entry.content}` : removedEntry.entry.content,
        payload: {
          dayId: day.id,
          dateKey: params.selectedDateKey,
          index: removedEntry.index,
          entry: removedEntry.entry
        }
      });
    }

    await writeDayNoteEntries(tx, user.id, day.id, params.content);
  });
}

export async function saveWeekReviewMutation(params: {
  user: User;
  selectedDateKey: string;
  content: string;
}) {
  const user = params.user;
  const week = await ensureWeek(user.id, getWeekStart(fromDateKey(params.selectedDateKey)));
  await db.week.update({
    where: {
      id: week.id
    },
    data: {
      review: params.content
    }
  });
}
