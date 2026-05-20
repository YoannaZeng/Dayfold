import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthError, requireCurrentUser } from "@/lib/server/auth";
import { assertSameOrigin, RequestGuardError } from "@/lib/server/request-guard";
import {
  copyPlanItemToNextWeek,
  copyPlanItemToTomorrow,
  createCustomSection,
  createTagMutation,
  createTodayPlanFromItemMutation,
  createManualActualGroupMutation,
  createPlanItemMutation,
  createProgressEntryMutation,
  deleteTagMutation,
  deleteManualActualGroupMutation,
  deleteManualActualItemMutation,
  deletePlanItemMutation,
  deleteProgressEntryMutation,
  deleteSection,
  renamePlanItemMutation,
  renameSection,
  renameTagMutation,
  restoreTrashEntryMutation,
  saveDayNoteMutation,
  saveWeekReviewMutation,
  togglePlanItemMutation,
  updateActualGroupTagsMutation,
  updateManualActualGroupMutation,
  updateManualActualItemMutation,
  updateProgressEntryMutation
} from "@/lib/server/dayfold";

const baseSchema = z.object({
  action: z.string(),
  selectedDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const createSectionSchema = baseSchema.extend({
  action: z.literal("create-section")
});

const renameSectionSchema = baseSchema.extend({
  action: z.literal("rename-section"),
  sectionId: z.string(),
  title: z.string().min(1)
});

const deleteSectionSchema = baseSchema.extend({
  action: z.literal("delete-section"),
  sectionId: z.string()
});

const createPlanItemSchema = baseSchema.extend({
  action: z.literal("create-plan-item"),
  sectionId: z.string(),
  title: z.string().min(1),
  tags: z.array(z.string().min(1)).optional()
});

const createTodayPlanFromItemSchema = baseSchema.extend({
  action: z.literal("create-today-plan-from-item"),
  sourceItemId: z.string(),
  title: z.string().min(1)
});

const togglePlanItemSchema = baseSchema.extend({
  action: z.literal("toggle-plan-item"),
  planItemId: z.string()
});

const renamePlanItemSchema = baseSchema.extend({
  action: z.literal("rename-plan-item"),
  planItemId: z.string(),
  title: z.string().min(1),
  tags: z.array(z.string().min(1)).optional()
});

const deletePlanItemSchema = baseSchema.extend({
  action: z.literal("delete-plan-item"),
  planItemId: z.string()
});

const createTagSchema = baseSchema.extend({
  action: z.literal("create-tag"),
  name: z.string().min(1)
});

const renameTagSchema = baseSchema.extend({
  action: z.literal("rename-tag"),
  tagId: z.string(),
  name: z.string().min(1)
});

const deleteTagSchema = baseSchema.extend({
  action: z.literal("delete-tag"),
  tagId: z.string()
});

const copyTomorrowSchema = baseSchema.extend({
  action: z.literal("copy-plan-item-tomorrow"),
  planItemId: z.string()
});

const copyNextWeekSchema = baseSchema.extend({
  action: z.literal("copy-plan-item-next-week"),
  planItemId: z.string()
});

const minuteSchema = z.number().int().min(0).max(1439);

const createProgressSchema = baseSchema
  .extend({
    action: z.literal("create-progress-entry"),
    planItemId: z.string().nullable().optional(),
    content: z.string(),
    startMinute: minuteSchema,
    endMinute: minuteSchema
  })
  .superRefine((value, ctx) => {
    if (!value.planItemId && !clean(value.content)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "不关联项目时，需要填写记录内容。",
        path: ["content"]
      });
    }

    if (value.endMinute <= value.startMinute) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "结束时间必须晚于开始时间。",
        path: ["endMinute"]
      });
    }
  });

const updateProgressSchema = baseSchema
  .extend({
    action: z.literal("update-progress-entry"),
    progressEntryId: z.string(),
    content: z.string(),
    planItemId: z.string().nullable().optional(),
    startMinute: minuteSchema.optional(),
    endMinute: minuteSchema.optional()
  })
  .superRefine((value, ctx) => {
    if (Object.prototype.hasOwnProperty.call(value, "planItemId") && !value.planItemId && !clean(value.content)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "不关联项目时，需要填写记录内容。",
        path: ["content"]
      });
    }

    if (value.startMinute !== undefined && value.endMinute !== undefined && value.endMinute <= value.startMinute) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "结束时间必须晚于开始时间。",
        path: ["endMinute"]
      });
    }
  });

const deleteProgressSchema = baseSchema.extend({
  action: z.literal("delete-progress-entry"),
  progressEntryId: z.string()
});

const createManualGroupSchema = baseSchema.extend({
  action: z.literal("create-manual-actual-group"),
  title: z.string().min(1),
  content: z.string().optional(),
  tags: z.array(z.string().min(1)).optional()
});

const updateManualGroupSchema = baseSchema.extend({
  action: z.literal("update-manual-actual-group"),
  groupId: z.string(),
  title: z.string().min(1),
  tags: z.array(z.string().min(1)).optional()
});

const updateActualGroupTagsSchema = baseSchema.extend({
  action: z.literal("update-actual-group-tags"),
  groupKind: z.enum(["linked", "manual", "free"]),
  groupId: z.string(),
  tags: z.array(z.string().min(1))
});

const deleteManualGroupSchema = baseSchema.extend({
  action: z.literal("delete-manual-actual-group"),
  groupId: z.string()
});

const updateManualItemSchema = baseSchema.extend({
  action: z.literal("update-manual-actual-item"),
  itemId: z.string(),
  content: z.string().min(1)
});

const deleteManualItemSchema = baseSchema.extend({
  action: z.literal("delete-manual-actual-item"),
  itemId: z.string()
});

const restoreTrashEntrySchema = baseSchema.extend({
  action: z.literal("restore-trash-entry"),
  trashEntryId: z.string()
});

const saveDayNoteSchema = baseSchema.extend({
  action: z.literal("save-day-note"),
  content: z.string()
});

const saveWeekReviewSchema = baseSchema.extend({
  action: z.literal("save-week-review"),
  content: z.string()
});

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const base = baseSchema.safeParse(body);

    if (!base.success) {
      return NextResponse.json({ error: "Invalid mutation payload." }, { status: 400 });
    }

    const user = await requireCurrentUser();

    switch (base.data.action) {
      case "create-section": {
        const parsed = createSectionSchema.parse(body);
        await createCustomSection(user, parsed.selectedDateKey);
        break;
      }
      case "rename-section": {
        const parsed = renameSectionSchema.parse(body);
        await renameSection(user, parsed.sectionId, clean(parsed.title));
        break;
      }
      case "delete-section": {
        const parsed = deleteSectionSchema.parse(body);
        await deleteSection(user, parsed.sectionId);
        break;
      }
      case "create-plan-item": {
        const parsed = createPlanItemSchema.parse(body);
        await createPlanItemMutation({
          user,
          selectedDateKey: parsed.selectedDateKey,
          sectionId: parsed.sectionId,
          title: clean(parsed.title),
          tags: parsed.tags?.map(clean)
        });
        break;
      }
      case "create-today-plan-from-item": {
        const parsed = createTodayPlanFromItemSchema.parse(body);
        await createTodayPlanFromItemMutation({
          user,
          selectedDateKey: parsed.selectedDateKey,
          sourceItemId: parsed.sourceItemId,
          title: clean(parsed.title)
        });
        break;
      }
      case "toggle-plan-item": {
        const parsed = togglePlanItemSchema.parse(body);
        await togglePlanItemMutation({ user, ...parsed });
        break;
      }
      case "rename-plan-item": {
        const parsed = renamePlanItemSchema.parse(body);
        await renamePlanItemMutation({
          user,
          planItemId: parsed.planItemId,
          title: clean(parsed.title),
          tags: parsed.tags?.map(clean)
        });
        break;
      }
      case "delete-plan-item": {
        const parsed = deletePlanItemSchema.parse(body);
        await deletePlanItemMutation({ user, ...parsed });
        break;
      }
      case "create-tag": {
        const parsed = createTagSchema.parse(body);
        await createTagMutation({ user, name: clean(parsed.name) });
        break;
      }
      case "rename-tag": {
        const parsed = renameTagSchema.parse(body);
        await renameTagMutation({ user, tagId: parsed.tagId, name: clean(parsed.name) });
        break;
      }
      case "delete-tag": {
        const parsed = deleteTagSchema.parse(body);
        await deleteTagMutation({ user, tagId: parsed.tagId });
        break;
      }
      case "copy-plan-item-tomorrow": {
        const parsed = copyTomorrowSchema.parse(body);
        await copyPlanItemToTomorrow({ user, ...parsed });
        break;
      }
      case "copy-plan-item-next-week": {
        const parsed = copyNextWeekSchema.parse(body);
        await copyPlanItemToNextWeek({ user, ...parsed });
        break;
      }
      case "create-progress-entry": {
        const parsed = createProgressSchema.parse(body);
        await createProgressEntryMutation({
          user,
          selectedDateKey: parsed.selectedDateKey,
          planItemId: parsed.planItemId ?? null,
          content: clean(parsed.content),
          startMinute: parsed.startMinute,
          endMinute: parsed.endMinute
        });
        break;
      }
      case "update-progress-entry": {
        const parsed = updateProgressSchema.parse(body);
        await updateProgressEntryMutation({
          user,
          progressEntryId: parsed.progressEntryId,
          content: clean(parsed.content),
          ...(Object.prototype.hasOwnProperty.call(parsed, "planItemId") ? { planItemId: parsed.planItemId } : {}),
          startMinute: parsed.startMinute,
          endMinute: parsed.endMinute
        });
        break;
      }
      case "delete-progress-entry": {
        const parsed = deleteProgressSchema.parse(body);
        await deleteProgressEntryMutation({ user, ...parsed });
        break;
      }
      case "create-manual-actual-group": {
        const parsed = createManualGroupSchema.parse(body);
        await createManualActualGroupMutation({
          user,
          selectedDateKey: parsed.selectedDateKey,
          title: clean(parsed.title),
          content: parsed.content ? clean(parsed.content) : undefined,
          tags: parsed.tags?.map(clean)
        });
        break;
      }
      case "update-manual-actual-group": {
        const parsed = updateManualGroupSchema.parse(body);
        await updateManualActualGroupMutation({
          user,
          groupId: parsed.groupId,
          title: clean(parsed.title),
          tags: parsed.tags?.map(clean)
        });
        break;
      }
      case "update-actual-group-tags": {
        const parsed = updateActualGroupTagsSchema.parse(body);
        await updateActualGroupTagsMutation({
          user,
          groupKind: parsed.groupKind,
          groupId: parsed.groupId,
          tags: parsed.tags.map(clean)
        });
        break;
      }
      case "delete-manual-actual-group": {
        const parsed = deleteManualGroupSchema.parse(body);
        await deleteManualActualGroupMutation({ user, ...parsed });
        break;
      }
      case "update-manual-actual-item": {
        const parsed = updateManualItemSchema.parse(body);
        await updateManualActualItemMutation({
          user,
          itemId: parsed.itemId,
          content: clean(parsed.content)
        });
        break;
      }
      case "delete-manual-actual-item": {
        const parsed = deleteManualItemSchema.parse(body);
        await deleteManualActualItemMutation({ user, ...parsed });
        break;
      }
      case "restore-trash-entry": {
        const parsed = restoreTrashEntrySchema.parse(body);
        await restoreTrashEntryMutation({ user, trashEntryId: parsed.trashEntryId });
        break;
      }
      case "save-day-note": {
        const parsed = saveDayNoteSchema.parse(body);
        await saveDayNoteMutation({ user, ...parsed });
        break;
      }
      case "save-week-review": {
        const parsed = saveWeekReviewSchema.parse(body);
        await saveWeekReviewMutation({ user, ...parsed });
        break;
      }
      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof RequestGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Mutation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
