"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction
} from "react";
import { createPortal } from "react-dom";

import type { DayfoldSnapshot } from "@/lib/api-types";
import {
  buildActualGroups,
  dedupeTagNames,
  formatDateKey,
  formatDayLabel,
  formatLongDate,
  formatMinuteRange,
  formatShortDate,
  getWeekRange,
  minuteToTimeString,
  normalize,
  normalizeTagName,
  parsePlanInput,
  parseDateKey,
  serializePlanInput,
  timeStringToMinute,
  type ActualGroup,
  type PlanItem,
  type PlanSection,
  type ProgressEntry,
  type TagChip,
  type ViewMode
} from "@/lib/dayfold";
import { parseNoteEntries, serializeNoteEntries, type NoteEntryDraft as NoteEntry } from "@/lib/note-entries";

type ProgressDraft = {
  mode: "create-linked" | "create-free" | "edit";
  progressEntryId?: string;
  itemId: string | null;
  sourceItemId?: string | null;
  title: string | null;
  planItemTitle?: string | null;
  content: string;
  startTime: string;
  endTime: string;
  relationChanged?: boolean;
};

type ActualDraft = {
  title: string;
  content: string;
  tags: TagChip[];
};

type ProjectNoteDraft = {
  itemId: string | null;
  title: string;
  content: string;
};

type TodayPlanDraft = {
  sourceItemId: string;
  sourceTitle: string;
  title: string;
  tags: TagChip[];
};

type ActualTagDraft = {
  group: ActualGroup;
  value: string;
};

type TagSuggestion = {
  key: string;
  name: string;
  isNew: boolean;
};

type SaveTone = "neutral" | "success" | "error";
type PanelSaveState = "idle" | "saving" | "saved";
type ToastState = {
  type: "success" | "error";
  message: string;
};

type TrashEntry = {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
  expiresAt: string;
};

type UndoSnapshot = unknown;

type SnapshotUpdater = (snapshot: DayfoldSnapshot) => DayfoldSnapshot;
type CalendarWeek = string[];

const ONBOARDING_VERSION = "v3";
const ONBOARDING_STEPS = [
  {
    kicker: "1 / 10",
    view: "day",
    target: "plans",
    title: "它不是另一个待办清单",
    body: "普通 todo 更关心「要做什么」。这里额外关心「实际推进了什么」和「最后沉淀了什么」。左侧写计划，右侧会慢慢长出真实的一天。",
    insight: "核心价值：把计划、实际、思考分开，避免一天结束只剩一堆没勾完的任务。"
  },
  {
    kicker: "2 / 10",
    view: "day",
    target: "plan-today",
    title: "今日计划：写今天的意图",
    body: "这里放今天想推进的事。它不等于成败清单，只是给今天一个方向。可以加标签，例如「工作」「个人成长」，后面周复盘会用到。",
    example: "#工作 准备产品测试反馈"
  },
  {
    kicker: "3 / 10",
    view: "day",
    target: "plan-week",
    title: "本周计划：放这周要持续推进的事",
    body: "如果一个项目不是只属于今天，而是这周都要惦记，就放在本周计划。它会同步到这一周的每天，减少重复录入。",
    example: "#工作 Dayfold 可用性优化"
  },
  {
    kicker: "4 / 10",
    view: "day",
    target: "plan-long",
    title: "长期项目：放不会一天结束的方向",
    body: "长期项目更像一个持续提醒，比如学习、健康、关系、长期作品。它会同步到当月所有日期，帮助你每天都能看见重要但不紧急的事。",
    example: "#个人成长 搭建个人知识系统"
  },
  {
    kicker: "5 / 10",
    view: "day",
    target: "progress",
    title: "今日进展：记录真实发生的时间线",
    body: "这是本产品和待办最大的分界。不是只勾选完成，而是记录 10:00-11:30 到底推进了什么。它可以关联计划，也可以是临时发生的自由记录。",
    example: "10:00-11:30 Dayfold 可用性优化：调整新手引导逻辑"
  },
  {
    kicker: "6 / 10",
    view: "day",
    target: "actual",
    title: "今日实际：系统帮你从时间线聚合",
    body: "你不需要再手动整理一遍。只要前面记录了进展，这里就会按项目汇总，回答一个更真实的问题：今天实际推进了哪些项目、推进到了哪一步。",
    insight: "计划和实际不必完全一致，这正是复盘时最有价值的信息。"
  },
  {
    kicker: "7 / 10",
    view: "day",
    target: "notes",
    title: "今日笔记：放思考，不和进展混在一起",
    body: "进展记录事实，笔记记录判断、发现、结论。点击计划项的「笔记」会生成带项目胶囊的笔记，也可以直接写普通日记式复盘。",
    example: "Dayfold 可用性优化：新用户更需要先理解「计划 ≠ 实际」。"
  },
  {
    kicker: "8 / 10",
    view: "week",
    target: "mode",
    title: "周视图：不是重新填写，而是自动汇总",
    body: "左上角可以切换日/周。周视图会把每天的实际推进和笔记汇总起来，让一周复盘不再从空白开始。"
  },
  {
    kicker: "9 / 10",
    view: "week",
    weekActualView: "date",
    target: "week-actual",
    title: "先按日期看：这一周每天真实推进了什么",
    body: "按日期视图适合回看节奏：哪天推进最多，哪天被临时事项占据，哪些计划一直没有变成实际行动。",
    example: "周一：Dayfold 可用性优化；周二：产品测试反馈"
  },
  {
    kicker: "10 / 10",
    view: "week",
    weekActualView: "tag",
    target: "week-actual",
    title: "再按标签看：工作、生活、个人成长各自发生了什么",
    body: "按标签视图会把同一类项目跨日期聚合起来。这样复盘时看到的不是零散日记，而是每个方向这一周真实投入和产出的证据。",
    insight: "这就是它和日程表的差异：日程表记录安排，这里沉淀实际轨迹。"
  }
] as const;

const TOUR_PLAN_EXAMPLES: Record<"today" | "week" | "long", Array<{ title: string; tags: string[] }>> = {
  today: [
    { title: "准备产品测试反馈", tags: ["工作"] },
    { title: "读一篇 AI 产品文章", tags: ["个人成长"] }
  ],
  week: [
    { title: "Dayfold 可用性优化", tags: ["工作"] },
    { title: "整理这一周的用户反馈", tags: ["工作"] }
  ],
  long: [
    { title: "搭建个人知识系统", tags: ["个人成长"] },
    { title: "稳定运动和睡眠节奏", tags: ["生活"] }
  ]
};

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readState(dateKey: string): Promise<DayfoldSnapshot> {
  const response = await fetch(`/api/state?date=${dateKey}`, { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "读取状态失败。" }));
    throw new ApiError(payload.error ?? "读取状态失败。", response.status);
  }
  return response.json();
}

async function readTrashEntries(): Promise<TrashEntry[]> {
  const response = await fetch("/api/trash", { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "读取回收站失败。" }));
    throw new ApiError(payload.error ?? "读取回收站失败。", response.status);
  }
  const payload = await response.json();
  return payload.entries ?? [];
}

async function mutate(payload: Record<string, unknown>) {
  const response = await fetch("/api/mutate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "保存失败。" }));
    throw new ApiError(body.error ?? "保存失败。", response.status);
  }
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function cloneSnapshot(snapshot: DayfoldSnapshot) {
  return structuredClone(snapshot);
}

function sortItemsForSection(section: PlanSection) {
  section.items = [...section.items].sort(
    (left, right) => Number(left.completed) - Number(right.completed) || left.title.localeCompare(right.title, "zh-CN")
  );
}

function getMonthAnchor(dateKey: string) {
  const date = parseDateKey(dateKey);
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function shiftMonth(dateKey: string, delta: number) {
  const anchor = getMonthAnchor(dateKey);
  anchor.setMonth(anchor.getMonth() + delta);
  return formatDateKey(anchor);
}

function formatMonthLabel(dateKey: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long"
  }).format(getMonthAnchor(dateKey));
}

function getCalendarWeeks(dateKey: string): CalendarWeek[] {
  const monthStart = getMonthAnchor(dateKey);
  const monthStartDay = monthStart.getDay();
  const mondayOffset = monthStartDay === 0 ? -6 : 1 - monthStartDay;
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() + mondayOffset);

  const weeks: CalendarWeek[] = [];
  const cursor = new Date(gridStart);

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week: string[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      week.push(formatDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

function buildDefaultTimeRange() {
  const now = new Date();
  const roundedStart = Math.floor((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
  const startMinute = Math.max(0, Math.min(1410, roundedStart));
  const endMinute = Math.min(1439, startMinute + 60);
  return {
    startTime: minuteToTimeString(startMinute),
    endTime: minuteToTimeString(endMinute)
  };
}

function formatTimeDraftInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function finalizeTimeDraftInput(value: string, fallback: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (!digits) {
    return fallback;
  }

  const hour = Math.min(23, Number(digits.slice(0, 2) || "0"));
  const minute = Math.min(59, Number(digits.slice(2).padEnd(2, "0") || "0"));

  return `${`${hour}`.padStart(2, "0")}:${`${minute}`.padStart(2, "0")}`;
}

function isValidTimeDraftValue(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function createLinkedProgressDraft(item: PlanItem): ProgressDraft {
  return {
    mode: "create-linked",
    itemId: item.id,
    sourceItemId: item.isDerivedTodayPlan ? item.sourceItemId ?? null : null,
    title: item.isDerivedTodayPlan ? item.sourceTitle ?? item.title : item.title,
    planItemTitle: item.isDerivedTodayPlan ? item.title : null,
    content: "",
    relationChanged: true,
    ...buildDefaultTimeRange()
  };
}

function createFreeProgressDraft(): ProgressDraft {
  return {
    mode: "create-free",
    itemId: null,
    title: null,
    content: "",
    relationChanged: true,
    ...buildDefaultTimeRange()
  };
}

function createEditProgressDraft(entry: ProgressEntry): ProgressDraft {
  return {
    mode: "edit",
    progressEntryId: entry.id,
    itemId: entry.planItemId,
    sourceItemId: entry.sourceItemId ?? null,
    title: entry.sourceTitle,
    planItemTitle: entry.planItemTitle ?? null,
    content: entry.content,
    startTime: minuteToTimeString(entry.startMinute),
    endTime: minuteToTimeString(entry.endMinute),
    relationChanged: false
  };
}

function createTagChip(name: string): TagChip {
  return {
    id: `temp-tag-${name}`,
    name
  };
}

function toTagChips(names: string[]) {
  return dedupeTagNames(names).map(createTagChip);
}

function serializeTagsForInput(tags: TagChip[]) {
  return tags.map((tag) => `#${tag.name}`).join(" ");
}

function getActiveTagQuery(rawValue: string, caretIndex = rawValue.length) {
  const prefix = rawValue.slice(0, caretIndex);
  const match = prefix.match(/(?:^|\s)[#＃]([^\s#＃]*)$/);
  if (!match) return null;
  return match[1] ?? "";
}

function replaceActiveTagQuery(rawValue: string, tagName: string, caretIndex = rawValue.length) {
  const prefix = rawValue.slice(0, caretIndex);
  const suffix = rawValue.slice(caretIndex);
  const replacedPrefix = prefix.replace(/(?:^|\s)[#＃]([^\s#＃]*)$/, (match) => {
    const leadingSpace = match.startsWith(" ") ? " " : "";
    return `${leadingSpace}#${tagName} `;
  });
  return `${replacedPrefix}${suffix}`;
}

function getPlanInputSegments(rawValue: string) {
  const segments: Array<{ text: string; isTag: boolean }> = [];
  const tagPattern = /(?:^|\s)([#＃][^\s#＃]+)/g;
  let cursor = 0;

  for (const match of rawValue.matchAll(tagPattern)) {
    const fullMatch = match[0] ?? "";
    const tagText = match[1] ?? "";
    const matchIndex = match.index ?? 0;
    const tagIndex = matchIndex + fullMatch.lastIndexOf(tagText);

    if (tagIndex > cursor) {
      segments.push({
        text: rawValue.slice(cursor, tagIndex),
        isTag: false
      });
    }

    segments.push({
      text: tagText,
      isTag: true
    });

    cursor = tagIndex + tagText.length;
  }

  if (cursor < rawValue.length) {
    segments.push({
      text: rawValue.slice(cursor),
      isTag: false
    });
  }

  if (!segments.length) {
    segments.push({
      text: "",
      isTag: false
    });
  }

  return segments;
}

function TimeDraftField({
  label,
  value,
  onChange,
  onBlur,
  onEnter
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onEnter: () => void;
}) {
  return (
    <label className="time-field">
      <span className="field-label-text">{label}</span>
      <div className="time-input-shell">
        <input
          className="time-input"
          type="text"
          inputMode="numeric"
          placeholder="11:00"
          value={value}
          onChange={(event) => onChange(formatTimeDraftInput(event.target.value))}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onEnter();
            }
          }}
        />
      </div>
    </label>
  );
}

function TagComposerInput({
  value,
  onChange,
  availableTags,
  placeholder,
  disabled = false,
  autoFocus = false,
  className = "tag-composer",
  inputClassName = "tag-composer-input",
  showHashButton = true,
  multiline = false,
  onSubmit,
  onEscape,
  onBlurOutside,
  onManageTags
}: {
  value: string;
  onChange: (value: string) => void;
  availableTags: TagChip[];
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  showHashButton?: boolean;
  multiline?: boolean;
  onSubmit?: () => void;
  onEscape?: () => void;
  onBlurOutside?: () => void;
  onManageTags?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [caretIndex, setCaretIndex] = useState(value.length);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    const end = value.length;
    inputRef.current?.setSelectionRange(end, end);
    setCaretIndex(end);
  }, [autoFocus]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [value, caretIndex]);

  useEffect(() => {
    const input = inputRef.current;
    if (!multiline || !(input instanceof HTMLTextAreaElement)) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [multiline, value]);

  const activeTagQuery = getActiveTagQuery(value, caretIndex);
  const parsedDraft = parsePlanInput(value);
  const draftTagKeys = new Set(parsedDraft.tags.map((tag) => tag.toLocaleLowerCase("zh-CN")));
  const filteredTagSuggestions = availableTags.filter((tag) => {
    if (draftTagKeys.has(tag.name.toLocaleLowerCase("zh-CN"))) {
      return false;
    }
    if (activeTagQuery === null) {
      return false;
    }
    return tag.name.toLocaleLowerCase("zh-CN").includes(activeTagQuery.toLocaleLowerCase("zh-CN"));
  });
  const tagSuggestions: TagSuggestion[] =
    activeTagQuery !== null
      ? [
          ...filteredTagSuggestions.slice(0, 6).map((tag) => ({
            key: tag.id,
            name: tag.name,
            isNew: false
          })),
          ...(!draftTagKeys.has(activeTagQuery.toLocaleLowerCase("zh-CN")) && activeTagQuery
            ? [
                {
                  key: `new-${activeTagQuery}`,
                  name: activeTagQuery,
                  isNew: true
                }
              ]
            : [])
        ]
      : [];

  function syncCaret() {
    const nextCaret = inputRef.current?.selectionStart ?? value.length;
    setCaretIndex(nextCaret);
  }

  function focusInputAt(position: number) {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(position, position);
      setCaretIndex(position);
    });
  }

  function applyTagSuggestion(tagName: string) {
    const nextValue = replaceActiveTagQuery(value, tagName, caretIndex);
    onChange(nextValue);
    focusInputAt(nextValue.length);
  }

  function insertTagTrigger() {
    const selectionStart = inputRef.current?.selectionStart ?? value.length;
    const selectionEnd = inputRef.current?.selectionEnd ?? value.length;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const nextValue = `${before}${needsSpace ? " " : ""}#${after}`;
    const nextCursor = before.length + (needsSpace ? 2 : 1);
    onChange(nextValue);
    focusInputAt(nextCursor);
  }

  const segments = getPlanInputSegments(value);
  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(event.target.value);
    setCaretIndex(event.target.selectionStart ?? event.target.value.length);
  };
  const handleBlur = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (containerRef.current?.contains(event.relatedTarget as Node | null)) {
      return;
    }
    onBlurOutside?.();
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (tagSuggestions.length && event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current + 1) % tagSuggestions.length);
      return;
    }

    if (tagSuggestions.length && event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current - 1 + tagSuggestions.length) % tagSuggestions.length);
      return;
    }

    if (tagSuggestions.length && event.key === "Enter") {
      event.preventDefault();
      applyTagSuggestion(tagSuggestions[activeSuggestionIndex]?.name ?? tagSuggestions[0].name);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSubmit?.();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onEscape?.();
    }
  };

  return (
    <div className={`${className}${multiline ? " is-multiline" : ""}`} ref={containerRef}>
      <div className="tag-composer-overlay" aria-hidden="true">
        {value ? (
          segments.map((segment, index) => (
            <span
              key={`${segment.isTag ? "tag" : "text"}-${index}-${segment.text}`}
              className={segment.isTag ? "tag-composer-token is-tag" : "tag-composer-token"}
            >
              {segment.text}
            </span>
          ))
        ) : (
          <span className="tag-composer-placeholder">{placeholder ?? ""}</span>
        )}
      </div>
      {multiline ? (
        <textarea
          ref={(node) => {
            inputRef.current = node;
          }}
          className={inputClassName}
          value={value}
          disabled={disabled}
          rows={1}
          onChange={handleChange}
          onClick={syncCaret}
          onKeyUp={syncCaret}
          onSelect={syncCaret}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <input
          ref={(node) => {
            inputRef.current = node;
          }}
          type="text"
          className={inputClassName}
          value={value}
          disabled={disabled}
          onChange={handleChange}
          onClick={syncCaret}
          onKeyUp={syncCaret}
          onSelect={syncCaret}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      )}
      {showHashButton ? (
        <button
          className="tag-trigger-button"
          type="button"
          aria-label="添加标签"
          onMouseDown={(event) => event.preventDefault()}
          onClick={insertTagTrigger}
        >
          #
        </button>
      ) : null}
      {tagSuggestions.length || (activeTagQuery !== null && onManageTags) ? (
        <div className="tag-suggestion-popover">
          {tagSuggestions.map((suggestion, index) => (
            <button
              key={suggestion.key}
              className={`tag-suggestion-item${index === activeSuggestionIndex ? " is-active" : ""}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyTagSuggestion(suggestion.name)}
            >
              <span className="tag-suggestion-hash">#</span>
              <span>{suggestion.name}</span>
              {suggestion.isNew ? <span className="tag-suggestion-meta">新建</span> : null}
            </button>
          ))}
          {onManageTags ? (
            <button
              className="tag-suggestion-manage"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onManageTags}
            >
              管理标签
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function InlineEditableText({
  value,
  editValue,
  onSave,
  as = "p",
  className = "editable-text",
  editable = true
}: {
  value: string;
  editValue?: string;
  onSave?: (nextValue: string) => void | Promise<void>;
  as?: "p" | "span";
  className?: string;
  editable?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(editValue ?? value);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(editValue ?? value);
  }, [editValue, value]);

  useEffect(() => {
    if (!isEditing || !editorRef.current) return;
    const editor = editorRef.current;
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
    editor.style.height = "auto";
    editor.style.height = `${editor.scrollHeight}px`;
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing || !editorRef.current) return;
    const editor = editorRef.current;
    editor.style.height = "auto";
    editor.style.height = `${editor.scrollHeight}px`;
  }, [draft, isEditing]);

  async function commitDraft() {
    const nextValue = normalize(draft);
    setIsEditing(false);
    if (nextValue && nextValue !== value) {
      await onSave?.(nextValue);
    }
  }

  const Tag = as;

  if (!editable || !onSave) {
    return <Tag className={className}>{value}</Tag>;
  }

  if (isEditing) {
    return (
      <textarea
        ref={editorRef}
        className="inline-editor"
        rows={1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commitDraft()}
        onKeyDown={async (event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            await commitDraft();
          }
          if (event.key === "Escape") {
            setDraft(value);
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <Tag
      className={className}
      onDoubleClick={() => {
        setDraft(editValue ?? value);
        setIsEditing(true);
      }}
    >
      {value}
    </Tag>
  );
}

function PlanInlineEditableText({
  value,
  editValue,
  availableTags,
  onSave,
  onEditingChange,
  onManageTags,
  className = "editable-text"
}: {
  value: string;
  editValue: string;
  availableTags: TagChip[];
  onSave: (nextValue: string) => void | Promise<void>;
  onEditingChange?: (isEditing: boolean) => void;
  onManageTags?: () => void;
  className?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(editValue);
  const previousEditingRef = useRef(isEditing);

  useEffect(() => {
    setDraft(editValue);
  }, [editValue]);

  useEffect(() => {
    if (previousEditingRef.current === isEditing) {
      return;
    }
    previousEditingRef.current = isEditing;
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  async function commitDraft() {
    const nextValue = normalize(draft);
    setIsEditing(false);
    if (nextValue && nextValue !== editValue) {
      await onSave(nextValue);
    }
  }

  if (isEditing) {
    return (
      <TagComposerInput
        value={draft}
        onChange={setDraft}
        availableTags={availableTags}
        autoFocus
        showHashButton={false}
        multiline
        className="inline-plan-editor"
        inputClassName="inline-plan-editor-input"
        onSubmit={() => void commitDraft()}
        onEscape={() => {
          setDraft(editValue);
          setIsEditing(false);
        }}
        onBlurOutside={() => void commitDraft()}
        onManageTags={onManageTags}
      />
    );
  }

  return (
    <p
      className={className}
      onDoubleClick={() => {
        setDraft(editValue);
        setIsEditing(true);
      }}
    >
      {value}
    </p>
  );
}

function MultilineNoteEditor({
  value,
  placeholder,
  className = "note-display",
  editingClassName = "note-editor",
  emptyClassName = "muted-copy",
  bulletMode = false,
  rows = 6,
  onSave,
  onEditingChange
}: {
  value: string;
  placeholder: string;
  className?: string;
  editingClassName?: string;
  emptyClassName?: string;
  bulletMode?: boolean;
  rows?: number;
  onSave: (nextValue: string) => void | Promise<void>;
  onEditingChange?: (isEditing: boolean) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previousEditingRef = useRef(isEditing);

  useEffect(() => {
    if (!isEditing) {
      setDraft(value);
    }
  }, [isEditing, value]);

  useEffect(() => {
    if (!isEditing) return;
    textareaRef.current?.focus();
    const end = draft.length;
    textareaRef.current?.setSelectionRange(end, end);
  }, [isEditing]);

  useEffect(() => {
    if (previousEditingRef.current === isEditing) {
      return;
    }
    previousEditingRef.current = isEditing;
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  function createInitialDraft(nextValue: string) {
    if (!bulletMode) {
      return nextValue;
    }

    return nextValue ? nextValue : "\u2022 ";
  }

  function sanitizeDraft(nextValue: string) {
    const cleaned = nextValue
      .split("\n")
      .map((line) => line.replace(/\s+$/g, ""))
      .join("\n")
      .replace(/\n+$/g, "");

    if (!bulletMode) {
      return cleaned.trim();
    }

    return cleaned.replace(/[•\s\n]/g, "") ? cleaned : "";
  }

  async function commitDraft() {
    const nextValue = sanitizeDraft(draft);
    setIsEditing(false);
    if (nextValue !== value) {
      await onSave(nextValue);
    }
  }

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        className={editingClassName}
        rows={rows}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          void commitDraft();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.shiftKey && !event.nativeEvent.isComposing) {
            if (bulletMode) {
              event.preventDefault();
              const textarea = textareaRef.current;
              const selectionStart = textarea?.selectionStart ?? draft.length;
              const selectionEnd = textarea?.selectionEnd ?? draft.length;
              const before = draft.slice(0, selectionStart);
              const after = draft.slice(selectionEnd);
              const nextValue = `${before}\n• ${after}`;
              const nextCursor = selectionStart + 3;
              setDraft(nextValue);
              requestAnimationFrame(() => {
                textareaRef.current?.focus();
                textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
              });
            }
            return;
          }

          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void commitDraft();
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(value);
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className={`${className}${value ? "" : ` ${emptyClassName}`}`}
      onDoubleClick={() => {
        setDraft(createInitialDraft(value));
        setIsEditing(true);
      }}
    >
      {value || placeholder}
    </div>
  );
}

function NoteListEditor({
  value,
  placeholder,
  addPlaceholder,
  onSave,
  onEditingChange,
  allowCreate = true,
  compact = false,
  hideEmptyState = false
}: {
  value: string;
  placeholder: string;
  addPlaceholder: string;
  onSave: (nextValue: string) => void | Promise<void>;
  onEditingChange?: (isEditing: boolean) => void;
  allowCreate?: boolean;
  compact?: boolean;
  hideEmptyState?: boolean;
}) {
  const items = useMemo(() => parseNoteEntries(value), [value]);
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousEditingRef = useRef(false);
  const isEditing = editingIndex !== null || draft.length > 0;

  useEffect(() => {
    if (editingIndex === null) {
      return;
    }
    inputRef.current?.focus();
    const end = editingValue.length;
    inputRef.current?.setSelectionRange(end, end);
  }, [editingIndex]);

  useEffect(() => {
    if (previousEditingRef.current === isEditing) {
      return;
    }
    previousEditingRef.current = isEditing;
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  async function saveItems(nextItems: NoteEntry[]) {
    const serialized = serializeNoteEntries(nextItems);
    if (serialized !== value) {
      await onSave(serialized);
    }
  }

  async function handleAddItem() {
    const nextItem = draft.trim();
    if (!nextItem) return;
    const nextItems: NoteEntry[] = [...items, { kind: "plain", content: nextItem }];
    setDraft("");
    await saveItems(nextItems);
  }

  async function handleSaveEdit() {
    if (editingIndex === null) return;
    const nextValue = editingValue.trim();
    const nextItems = [...items];

    if (!nextValue) {
      nextItems.splice(editingIndex, 1);
    } else {
      const currentItem = nextItems[editingIndex];
      nextItems[editingIndex] =
        currentItem.kind === "project"
          ? { ...currentItem, content: nextValue }
          : { kind: "plain", content: nextValue };
    }

    setEditingIndex(null);
    setEditingValue("");
    await saveItems(nextItems);
  }

  return (
    <div className={`note-list${compact ? " is-compact" : ""}`}>
      {allowCreate ? (
        <div className="note-add-row">
          <span className="note-bullet" aria-hidden="true">
            •
          </span>
          <input
            className="note-item-input"
            value={draft}
            placeholder={addPlaceholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void handleAddItem();
              }
            }}
          />
          <button className="button button-secondary button-small" type="button" onClick={() => void handleAddItem()}>
            Add
          </button>
        </div>
      ) : null}

      {items.length ? (
        <div className="note-list-items">
          {items.map((item, index) => (
            <div className={`note-row${item.kind === "project" ? " is-project" : ""}`} key={`${index}-${item.kind}-${item.content}`}>
              <span className="note-bullet" aria-hidden="true">
                •
              </span>
              <div className={`note-content${item.kind === "project" ? " is-project" : ""}`}>
                {item.kind === "project" ? <span className="note-project-chip">{item.projectTitle}</span> : null}
                {editingIndex === index ? (
                  <input
                    ref={inputRef}
                    className="note-item-input"
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                    onBlur={() => {
                      void handleSaveEdit();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        void handleSaveEdit();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingIndex(null);
                        setEditingValue("");
                      }
                    }}
                  />
                ) : (
                  <button
                    className="note-item-button"
                    type="button"
                    onDoubleClick={() => {
                      setEditingIndex(index);
                      setEditingValue(item.content);
                    }}
                  >
                    {item.content}
                  </button>
                )}
              </div>
              <button
                className="note-delete"
                type="button"
                aria-label="删除这一条笔记"
                onClick={() => {
                  const nextItems = items.filter((_, itemIndex) => itemIndex !== index);
                  void saveItems(nextItems);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : hideEmptyState ? null : (
        <div className="note-list-empty muted-copy">{placeholder}</div>
      )}
    </div>
  );
}

function MoreMenu({
  items,
  trigger,
  triggerClassName = "more-trigger",
  menuClassName = "menu-popover"
}: {
  items: Array<{ label: string; onClick: () => void | Promise<void>; tone?: "default" | "danger" }>;
  trigger?: ReactNode;
  triggerClassName?: string;
  menuClassName?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  function updateMenuPosition() {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) return;

    const gap = 8;
    const viewportPadding = 8;
    const menuWidth = menuRef.current?.offsetWidth ?? (menuClassName.includes("settings-popover") ? 150 : 150);
    const menuHeight = menuRef.current?.offsetHeight ?? items.length * 38 + 12;
    const shouldOpenUp =
      window.innerHeight - triggerRect.bottom < menuHeight + gap + viewportPadding &&
      triggerRect.top > window.innerHeight - triggerRect.bottom;
    const rawTop = shouldOpenUp ? triggerRect.top - menuHeight - gap : triggerRect.bottom + gap;
    const rawLeft = triggerRect.right - menuWidth;

    setMenuPosition({
      top: Math.min(Math.max(viewportPadding, rawTop), window.innerHeight - menuHeight - viewportPadding),
      left: Math.min(Math.max(viewportPadding, rawLeft), window.innerWidth - menuWidth - viewportPadding)
    });
  }

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!ref.current || !menuRef.current) return;
      if (!ref.current.contains(target) && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    }

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();

    function handleViewportChange() {
      updateMenuPosition();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, items.length, menuClassName]);

  return (
    <div className={`more-menu${open ? " is-open" : ""}`} ref={ref}>
      <button
        className={triggerClassName}
        type="button"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (!open) {
            updateMenuPosition();
          }
          setOpen((current) => !current);
        }}
      >
        {trigger ?? (
          <>
            <span className="more-dot" />
            <span className="more-dot" />
            <span className="more-dot" />
          </>
        )}
      </button>
      {open
        ? createPortal(
            <div
              className={`${menuClassName} menu-popover-floating`}
              ref={menuRef}
              role="menu"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  className={`menu-item${item.tone === "danger" ? " is-danger" : ""}`}
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setOpen(false);
                    await item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function isNewUserSnapshot(snapshot: DayfoldSnapshot) {
  const hasPlanItems = snapshot.day.planSections.some((section) => section.items.length > 0);
  const hasProgress = snapshot.day.progressEntries.length > 0;
  const hasManualActual = snapshot.day.manualActualGroups.length > 0;
  const hasDayNote = snapshot.day.note.trim().length > 0;
  const hasWeekReview = snapshot.weekReview.trim().length > 0;
  const hasWeekActivity = snapshot.weekDays.some((day) => day.actualGroups.length > 0 || day.note.trim().length > 0);

  return !hasPlanItems && !hasProgress && !hasManualActual && !hasDayNote && !hasWeekReview && !hasWeekActivity;
}

function trashKindLabel(kind: string) {
  switch (kind) {
    case "section":
      return "计划分组";
    case "plan-item":
      return "计划";
    case "progress-entry":
      return "进展";
    case "manual-actual-group":
      return "实际项目";
    case "manual-actual-item":
      return "实际条目";
    case "day-note-entry":
      return "笔记";
    default:
      return "内容";
  }
}

function formatTrashDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function OnboardingTour({
  stepIndex,
  targetRect,
  onNext,
  onBack,
  onClose
}: {
  stepIndex: number;
  targetRect: { top: number; left: number; width: number; height: number } | null;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const step = ONBOARDING_STEPS[stepIndex];
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
  const cardWidth = Math.min(440, viewportWidth - 32);
  const estimatedCardHeight = 460;
  const preferredLeft = targetRect ? targetRect.left + targetRect.width + 18 : (viewportWidth - cardWidth) / 2;
  const fallbackLeft = targetRect ? targetRect.left - cardWidth - 18 : preferredLeft;
  const left =
    !targetRect || preferredLeft + cardWidth < viewportWidth - 16
      ? preferredLeft
      : Math.max(16, Math.min(fallbackLeft, viewportWidth - cardWidth - 16));
  const top = targetRect
    ? Math.max(16, Math.min(targetRect.top + targetRect.height / 2 - 190, viewportHeight - estimatedCardHeight))
    : Math.max(24, viewportHeight / 2 - 180);
  const spotlight = targetRect
    ? {
        top: Math.max(0, targetRect.top - 8),
        left: Math.max(0, targetRect.left - 8),
        width: Math.min(viewportWidth, targetRect.width + 16),
        height: Math.min(viewportHeight, targetRect.height + 16)
      }
    : null;

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {spotlight ? (
        <>
          <button
            className="tour-mask tour-mask-top"
            type="button"
            aria-label="关闭功能说明"
            style={{ height: spotlight.top }}
            onClick={onClose}
          />
          <button
            className="tour-mask tour-mask-left"
            type="button"
            aria-label="关闭功能说明"
            style={{ top: spotlight.top, width: spotlight.left, height: spotlight.height }}
            onClick={onClose}
          />
          <button
            className="tour-mask tour-mask-right"
            type="button"
            aria-label="关闭功能说明"
            style={{
              top: spotlight.top,
              left: spotlight.left + spotlight.width,
              width: Math.max(0, viewportWidth - spotlight.left - spotlight.width),
              height: spotlight.height
            }}
            onClick={onClose}
          />
          <button
            className="tour-mask tour-mask-bottom"
            type="button"
            aria-label="关闭功能说明"
            style={{ top: spotlight.top + spotlight.height, height: Math.max(0, viewportHeight - spotlight.top - spotlight.height) }}
            onClick={onClose}
          />
        </>
      ) : (
        <button className="tour-mask tour-mask-full" type="button" aria-label="关闭功能说明" onClick={onClose} />
      )}
      {spotlight ? (
        <div
          className="tour-spotlight"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height
          }}
        />
      ) : null}
      <section className="tour-card" style={{ top, left, width: cardWidth }} onClick={(event) => event.stopPropagation()}>
        <div className="tour-progress">
          {ONBOARDING_STEPS.map((item, index) => (
            <span className={`tour-dot${index === stepIndex ? " active" : ""}`} key={item.kicker} />
          ))}
        </div>
        <p className="section-kicker">{step.kicker}</p>
        <h2 id="tour-title" className="tour-title">
          {step.title}
        </h2>
        <p className="tour-copy">{step.body}</p>
        {"insight" in step ? <p className="tour-insight">{step.insight}</p> : null}
        {"example" in step ? (
          <div className="tour-example-note">
            <span>示例</span>
            <p>{step.example}</p>
          </div>
        ) : null}
        <div className="tour-actions">
          <button className="button button-ghost" type="button" onClick={onClose}>
            跳过
          </button>
          <div className="tour-nav-actions">
            <button className="button button-secondary" type="button" disabled={stepIndex === 0} onClick={onBack}>
              上一步
            </button>
            <button className="button button-primary" type="button" onClick={onNext}>
              {isLastStep ? "开始使用" : "下一步"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function DayfoldApp({
  currentUser
}: {
  currentUser: {
    email: string;
    name: string;
  };
}) {
  const initialDateKey = useMemo(() => formatDateKey(new Date()), []);
  const todayDateKey = useMemo(() => formatDateKey(new Date()), []);
  const [mode, setMode] = useState<ViewMode>("day");
  const [selectedDateKey, setSelectedDateKey] = useState(initialDateKey);
  const [snapshot, setSnapshot] = useState<DayfoldSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressDraft, setProgressDraft] = useState<ProgressDraft | null>(null);
  const [projectNoteDraft, setProjectNoteDraft] = useState<ProjectNoteDraft | null>(null);
  const [todayPlanDraft, setTodayPlanDraft] = useState<TodayPlanDraft | null>(null);
  const [actualTagDraft, setActualTagDraft] = useState<ActualTagDraft | null>(null);
  const [progressPlanPickerOpen, setProgressPlanPickerOpen] = useState(false);
  const [actualDraft, setActualDraft] = useState<ActualDraft>({ title: "", content: "", tags: [] });
  const [actualModalOpen, setActualModalOpen] = useState(false);
  const [quickActualTitle, setQuickActualTitle] = useState("");
  const [dayNoteDraft, setDayNoteDraft] = useState("");
  const [weekReviewDraft, setWeekReviewDraft] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [savingCount, setSavingCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("已连接");
  const [statusTone, setStatusTone] = useState<SaveTone>("neutral");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [quickActualSubmitting, setQuickActualSubmitting] = useState(false);
  const [progressSubmitting, setProgressSubmitting] = useState(false);
  const [todayPlanSubmitting, setTodayPlanSubmitting] = useState(false);
  const [actualSubmitting, setActualSubmitting] = useState(false);
  const [dayNoteState, setDayNoteState] = useState<PanelSaveState>("idle");
  const [weekReviewState, setWeekReviewState] = useState<PanelSaveState>("idle");
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [calendarMonthKey, setCalendarMonthKey] = useState(() => formatDateKey(getMonthAnchor(initialDateKey)));
  const [weekActualView, setWeekActualView] = useState<"date" | "tag">("date");
  const [dayNoteEditing, setDayNoteEditing] = useState(false);
  const [weekReviewEditing, setWeekReviewEditing] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [undoing, setUndoing] = useState(false);
  const [betaSafetyOpen, setBetaSafetyOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [restoringTrashId, setRestoringTrashId] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingTargetRect, setOnboardingTargetRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);
  const dayNoteTimeoutRef = useRef<number | null>(null);
  const weekReviewTimeoutRef = useRef<number | null>(null);
  const datePopoverRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const authRedirectingRef = useRef(false);
  const onboardingStorageKey = `dayfold-onboarding-${ONBOARDING_VERSION}-${currentUser.email}`;
  const showOnboardingExamples = Boolean(onboardingOpen && snapshot && isNewUserSnapshot(snapshot));

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
      }
      if (dayNoteTimeoutRef.current) {
        window.clearTimeout(dayNoteTimeoutRef.current);
      }
      if (weekReviewTimeoutRef.current) {
        window.clearTimeout(weekReviewTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    setCalendarMonthKey(formatDateKey(getMonthAnchor(selectedDateKey)));
  }, [selectedDateKey]);

  useEffect(() => {
    if (!datePopoverOpen) return;

    function handleClick(event: MouseEvent) {
      if (!datePopoverRef.current) return;
      if (!datePopoverRef.current.contains(event.target as Node)) {
        setDatePopoverOpen(false);
      }
    }

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [datePopoverOpen]);

  useEffect(() => {
    if (!snapshot || loading) return;
    if (!isNewUserSnapshot(snapshot)) return;
    if (window.localStorage.getItem(onboardingStorageKey) === "done") return;
    setOnboardingStep(0);
    setOnboardingOpen(true);
  }, [loading, onboardingStorageKey, snapshot]);

  function closeOnboarding() {
    window.localStorage.setItem(onboardingStorageKey, "done");
    setOnboardingOpen(false);
  }

  function openOnboarding() {
    setMode("day");
    setOnboardingStep(0);
    setOnboardingOpen(true);
  }

  function advanceOnboarding() {
    if (onboardingStep >= ONBOARDING_STEPS.length - 1) {
      closeOnboarding();
      return;
    }
    setOnboardingStep((current) => Math.min(ONBOARDING_STEPS.length - 1, current + 1));
  }

  useEffect(() => {
    if (!onboardingOpen) return;

    const step = ONBOARDING_STEPS[onboardingStep];
    setMode(step.view);
    if ("weekActualView" in step) {
      setWeekActualView(step.weekActualView);
    }
  }, [onboardingOpen, onboardingStep]);

  useEffect(() => {
    if (!onboardingOpen) {
      setOnboardingTargetRect(null);
      return;
    }

    const step = ONBOARDING_STEPS[onboardingStep];

    function updateTargetRect() {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!target) {
        setOnboardingTargetRect(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      setOnboardingTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    }

    const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    target?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    const timeoutId = window.setTimeout(updateTargetRect, 220);

    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [mode, onboardingOpen, onboardingStep, weekActualView]);

  function showToast(nextToast: ToastState) {
    setToast(nextToast);
  }

  async function captureUndoSnapshot() {
    const response = await fetch("/api/export", { method: "GET" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "无法创建撤回快照。" }));
      throw new ApiError(payload.error ?? "无法创建撤回快照。", response.status);
    }
    return response.json();
  }

  function handleAuthExpired(message = "登录已失效，正在返回登录页...") {
    if (authRedirectingRef.current) {
      return;
    }

    authRedirectingRef.current = true;
    setError(message);
    setStatusTone("error");
    setStatusMessage("登录已失效");
    setToast(null);
    window.setTimeout(() => {
      window.location.reload();
    }, 180);
  }

  function markSaved(message = "已保存") {
    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
    }
    setStatusTone("success");
    setStatusMessage(message);
    statusTimeoutRef.current = window.setTimeout(() => {
      setStatusTone("neutral");
      setStatusMessage("已连接");
    }, 1800);
  }

  function flashPanelState(
    setter: Dispatch<SetStateAction<PanelSaveState>>,
    timeoutRef: MutableRefObject<number | null>
  ) {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    setter("saved");
    timeoutRef.current = window.setTimeout(() => {
      setter("idle");
    }, 1800);
  }

  async function refresh(dateKey = selectedDateKey) {
    setLoading(true);
    setError(null);
    try {
      const next = await readState(dateKey);
      setSnapshot(next);
      setDayNoteDraft(next.day.note);
      setWeekReviewDraft(next.weekReview);
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 401) {
        handleAuthExpired();
        return;
      }
      setError(nextError instanceof Error ? nextError.message : "读取失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(selectedDateKey);
  }, [selectedDateKey]);

  useEffect(() => {
    function handleUndoShortcut(event: KeyboardEvent) {
      const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
      if (!isUndo) return;

      const activeElement = document.activeElement;
      const isEditingField =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        Boolean(activeElement?.getAttribute("contenteditable"));

      if (isEditingField || !undoStack.length || undoing) {
        return;
      }

      event.preventDefault();

      const snapshotToRestore = undoStack[undoStack.length - 1];
      setUndoing(true);
      setStatusTone("neutral");
      setStatusMessage("撤回中...");

      void fetch("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(snapshotToRestore)
      })
        .then(async (response) => {
          if (!response.ok) {
            const body = await response.json().catch(() => ({ error: "撤回失败。" }));
            throw new ApiError(body.error ?? "撤回失败。", response.status);
          }

          setUndoStack((current) => current.slice(0, -1));
          await refresh(selectedDateKey);
          markSaved("已撤回上一步");
          showToast({
            type: "success",
            message: "已撤回上一步"
          });
        })
        .catch((nextError) => {
          const message = nextError instanceof Error ? nextError.message : "撤回失败。";
          setError(message);
          setStatusTone("error");
          setStatusMessage("撤回失败");
          showToast({
            type: "error",
            message
          });
        })
        .finally(() => {
          setUndoing(false);
        });
    }

    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, [selectedDateKey, undoStack, undoing]);

  async function commit(
    payload: Record<string, unknown>,
    options?: {
      successMessage?: string;
      errorMessage?: string;
      successToast?: boolean;
      optimisticUpdate?: SnapshotUpdater;
      undoable?: boolean;
    }
  ) {
    let previousSnapshot: DayfoldSnapshot | null = null;
    let undoSnapshot: UndoSnapshot | null = null;

    setError(null);
    setSavingCount((count) => count + 1);
    setStatusTone("neutral");
    setStatusMessage("保存中...");

    if (options?.optimisticUpdate && snapshot) {
      previousSnapshot = cloneSnapshot(snapshot);
      setSnapshot(options.optimisticUpdate(previousSnapshot));
    }

    try {
      if (options?.undoable !== false) {
        try {
          undoSnapshot = await captureUndoSnapshot();
        } catch {
          undoSnapshot = null;
        }
      }

      await mutate(payload);
      await refresh(selectedDateKey);
      if (undoSnapshot) {
        setUndoStack((current) => [...current.slice(-19), undoSnapshot]);
      }
      markSaved(options?.successMessage ?? "已保存");
      if (options?.successToast) {
        showToast({
          type: "success",
          message: options.successMessage ?? "已保存"
        });
      }
    } catch (nextError) {
      if (previousSnapshot) {
        setSnapshot(previousSnapshot);
      }
      if (nextError instanceof ApiError && nextError.status === 401) {
        handleAuthExpired();
        throw nextError;
      }
      const message = nextError instanceof Error ? nextError.message : options?.errorMessage ?? "保存失败。";
      setError(message);
      setStatusTone("error");
      setStatusMessage(options?.errorMessage ?? "保存失败");
      showToast({
        type: "error",
        message
      });
      throw nextError;
    } finally {
      setSavingCount((count) => Math.max(0, count - 1));
    }
  }

  function shiftDate(deltaDays: number) {
    const nextDate = parseDateKey(selectedDateKey);
    nextDate.setDate(nextDate.getDate() + deltaDays);
    setSelectedDateKey(formatDateKey(nextDate));
  }

  function openDatePicker() {
    setCalendarMonthKey(formatDateKey(getMonthAnchor(selectedDateKey)));
    setDatePopoverOpen((open) => !open);
  }

  async function exportBackup() {
    const confirmed = window.confirm("导出会下载当前账号的计划、进展、实际、笔记、复盘和标签备份。确认导出吗？");
    if (!confirmed) {
      return;
    }

    setExporting(true);

    try {
      const response = await fetch("/api/export", {
        method: "GET"
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "导出失败。" }));
        throw new ApiError(payload.error ?? "导出失败。", response.status);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `dayfold-backup-${selectedDateKey}.json`;
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
      markSaved("备份已下载");
      showToast({
        type: "success",
        message: "数据备份已下载"
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAuthExpired();
        return;
      }

      const message = error instanceof Error ? error.message : "导出失败。";
      setError(message);
      setStatusTone("error");
      setStatusMessage("导出失败");
      showToast({
        type: "error",
        message
      });
    } finally {
      setExporting(false);
    }
  }

  async function importBackupFile(file: File) {
    setImporting(true);

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const response = await fetch("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "导入失败。" }));
        throw new ApiError(body.error ?? "导入失败。", response.status);
      }

      await refresh(selectedDateKey);
      markSaved("备份已恢复");
      showToast({
        type: "success",
        message: "备份已恢复到当前账号"
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAuthExpired();
        return;
      }

      const message =
        error instanceof SyntaxError ? "备份文件不是有效的 JSON。" : error instanceof Error ? error.message : "导入失败。";
      setError(message);
      setStatusTone("error");
      setStatusMessage("导入失败");
      showToast({
        type: "error",
        message
      });
    } finally {
      setImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  async function clearCurrentAccountData() {
    const confirmed = window.confirm("清空会删除当前账号里的计划、进展、实际、笔记、复盘和标签。建议先导出备份。确认继续吗？");
    if (!confirmed) return;

    const typed = window.prompt("这是不可撤销操作。请输入「清空」两个字确认。");
    if (typed !== "清空") {
      showToast({
        type: "error",
        message: "已取消清空"
      });
      return;
    }

    setClearingData(true);

    try {
      const response = await fetch("/api/account-data", {
        method: "DELETE"
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "清空数据失败。" }));
        throw new ApiError(payload.error ?? "清空数据失败。", response.status);
      }

      setUndoStack([]);
      await refresh(selectedDateKey);
      setBetaSafetyOpen(false);
      markSaved("数据已清空");
      showToast({
        type: "success",
        message: "当前账号数据已清空"
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAuthExpired();
        return;
      }

      const message = error instanceof Error ? error.message : "清空数据失败。";
      setError(message);
      setStatusTone("error");
      setStatusMessage("清空失败");
      showToast({
        type: "error",
        message
      });
    } finally {
      setClearingData(false);
    }
  }

  async function createManagedTag() {
    const name = normalizeTagName(tagDraft);
    if (!name) return;

    await commit(
      {
        action: "create-tag",
        selectedDateKey,
        name
      },
      {
        successMessage: "标签已添加",
        successToast: true,
        undoable: false
      }
    );
    setTagDraft("");
  }

  async function renameManagedTag(tag: TagChip) {
    const name = normalizeTagName(editingTagName);
    if (!name || name === tag.name) {
      setEditingTagId(null);
      setEditingTagName("");
      return;
    }

    await commit(
      {
        action: "rename-tag",
        selectedDateKey,
        tagId: tag.id,
        name
      },
      {
        successMessage: "标签已更新",
        successToast: true,
        undoable: false
      }
    );
    setEditingTagId(null);
    setEditingTagName("");
  }

  async function deleteManagedTag(tag: TagChip) {
    const confirmed = window.confirm(`删除「${tag.name}」不会删除任何内容，只会从已标记的项目和记录中移除这个标签。确认删除吗？`);
    if (!confirmed) return;

    await commit(
      {
        action: "delete-tag",
        selectedDateKey,
        tagId: tag.id
      },
      {
        successMessage: "标签已删除",
        successToast: true,
        undoable: false
      }
    );
  }

  async function openTrash() {
    setTrashOpen(true);
    setTrashLoading(true);
    try {
      setTrashEntries(await readTrashEntries());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAuthExpired();
        return;
      }
      const message = error instanceof Error ? error.message : "读取回收站失败。";
      showToast({ type: "error", message });
    } finally {
      setTrashLoading(false);
    }
  }

  async function restoreTrashEntry(entry: TrashEntry) {
    setRestoringTrashId(entry.id);
    try {
      await commit(
        {
          action: "restore-trash-entry",
          selectedDateKey,
          trashEntryId: entry.id
        },
        {
          successMessage: "已从回收站恢复",
          successToast: true,
          undoable: false
        }
      );
      setTrashEntries(await readTrashEntries());
    } finally {
      setRestoringTrashId(null);
    }
  }

  const weekRange = getWeekRange(selectedDateKey);
  const calendarWeeks = getCalendarWeeks(calendarMonthKey);
  const selectedWeekKeys = new Set(calendarWeeks.find((week) => week.includes(selectedDateKey)) ?? []);
  const progressPlanSections =
    snapshot?.day.planSections
      .map((section) => ({
        id: section.id,
        title: section.title,
        items: section.items
      }))
      .filter((section) => section.items.length) ?? [];
  const isTodayPage = mode === "day" && selectedDateKey === todayDateKey;
  const statusClassName = `status-badge status-${savingCount > 0 ? "saving" : statusTone}`;
  const dayNoteStatusText =
    dayNoteState === "saving"
      ? "保存中..."
      : dayNoteState === "saved"
        ? "已保存"
        : dayNoteEditing
          ? "逐条编辑中"
          : "逐条记录，双击可编辑";
  const weekReviewStatusText =
    weekReviewState === "saving"
      ? "保存中..."
      : weekReviewState === "saved"
        ? "已保存"
        : weekReviewEditing
          ? "Enter 保存，Shift+Enter 换行"
          : "双击编辑本周复盘";

  function renameSectionOptimistically(sectionId: string, title: string): SnapshotUpdater {
    return (current) => ({
      ...cloneSnapshot(current),
      day: {
        ...current.day,
        planSections: current.day.planSections.map((section) => (section.id === sectionId ? { ...section, title } : section))
      }
    });
  }

  function createPlanItemOptimistically(sectionId: string, title: string, tags: TagChip[]): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      next.day.planSections = next.day.planSections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: [
                ...section.items,
                {
                  id: `temp-plan-${crypto.randomUUID()}`,
                  title,
                  completed: false,
                  tags
                }
              ]
            }
          : section
      );
      return next;
    };
  }

  function createTodayPlanFromItemOptimistically(source: PlanItem, title: string): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      next.day.planSections = next.day.planSections.map((section) =>
        section.kind === "today"
          ? {
              ...section,
              items: [
                {
                  id: `temp-plan-${crypto.randomUUID()}`,
                  title,
                  completed: false,
                  completedAt: null,
                  sourceItemId: source.id,
                  sourceTitle: source.title,
                  isDerivedTodayPlan: true,
                  tags: source.tags
                },
                ...section.items
              ]
            }
          : section
      );
      return next;
    };
  }

  function renamePlanItemOptimistically(planItemId: string, title: string, tags?: TagChip[]): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      let tagTargetId: string | null = null;

      if (tags) {
        next.day.planSections.forEach((section) => {
          section.items.forEach((item) => {
            if (item.id === planItemId) {
              tagTargetId = item.sourceItemId ?? item.id;
            }
          });
        });
      }

      next.day.planSections = next.day.planSections.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          if (item.id === planItemId) {
            return { ...item, title, tags: tags ?? item.tags };
          }
          if (tags && tagTargetId && (item.id === tagTargetId || item.sourceItemId === tagTargetId)) {
            return { ...item, tags };
          }
          if (item.isDerivedTodayPlan && item.sourceItemId === planItemId) {
            return { ...item, sourceTitle: title, tags: tags ?? item.tags };
          }
          return item;
        })
      }));
      next.day.progressEntries = next.day.progressEntries.map((entry) =>
        entry.planItemId === planItemId
          ? entry.isDerivedTodayPlan
            ? { ...entry, planItemTitle: title, tags: tags ?? entry.tags }
            : { ...entry, sourceTitle: title, tags: tags ?? entry.tags }
          : entry.isDerivedTodayPlan && entry.sourceItemId === planItemId
            ? { ...entry, sourceTitle: title, tags: tags ?? entry.tags }
            : tags && tagTargetId && (entry.planItemId === tagTargetId || entry.sourceItemId === tagTargetId)
            ? { ...entry, tags }
            : entry
      );
      next.dayActualGroups = buildActualGroups(next.day);
      next.weekDays = next.weekDays.map((entry) => ({
        ...entry,
        actualGroups: entry.actualGroups.map((group) =>
          group.kind === "linked" && (group.id === planItemId || (tagTargetId && group.id === tagTargetId))
            ? { ...group, title: group.id === planItemId ? title : group.title, tags: tags ?? group.tags }
            : group
        )
      }));
      return next;
    };
  }

  function deletePlanItemOptimistically(planItemId: string): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      next.day.planSections = next.day.planSections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.id !== planItemId)
      }));
      next.day.progressEntries = next.day.progressEntries.filter((entry) => entry.planItemId !== planItemId);
      next.dayActualGroups = buildActualGroups(next.day);
      next.weekDays = next.weekDays.map((entry) => ({
        ...entry,
        actualGroups: entry.actualGroups.filter((group) => !(group.kind === "linked" && group.id === planItemId))
      }));
      return next;
    };
  }

  function togglePlanItemOptimistically(planItemId: string): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      let nextCompleted = false;
      const now = new Date().toISOString();

      next.day.planSections = next.day.planSections.map((section) => {
        const mapped = {
          ...section,
          items: section.items.map((item) => {
            if (item.id !== planItemId) return item;
            nextCompleted = !item.completed;
            return { ...item, completed: nextCompleted, completedAt: nextCompleted ? now : null };
          })
        };
        sortItemsForSection(mapped);
        return mapped;
      });

      next.dayActualGroups = buildActualGroups(next.day);
      next.weekDays = next.weekDays.map((entry) =>
        entry.dateKey === selectedDateKey
          ? {
              ...entry,
              actualGroups: buildActualGroups(next.day)
            }
          : entry
      );
      return next;
    };
  }

  function createProgressOptimistically(
    entry: Pick<
      ProgressEntry,
      | "planItemId"
      | "sourceItemId"
      | "sourceTitle"
      | "planItemTitle"
      | "isDerivedTodayPlan"
      | "content"
      | "startMinute"
      | "endMinute"
    >
  ): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      next.day.progressEntries = [...next.day.progressEntries, {
        id: `temp-progress-${crypto.randomUUID()}`,
        planItemId: entry.planItemId,
        sourceItemId: entry.sourceItemId ?? null,
        sourceTitle: entry.sourceTitle,
        planItemTitle: entry.planItemTitle ?? null,
        isDerivedTodayPlan: Boolean(entry.isDerivedTodayPlan),
        tags: [],
        content: entry.content,
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }].sort(
        (left, right) =>
          left.startMinute - right.startMinute ||
          left.endMinute - right.endMinute ||
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
      next.dayActualGroups = buildActualGroups(next.day);
      next.weekDays = next.weekDays.map((entry) =>
        entry.dateKey === selectedDateKey
          ? {
            ...entry,
              actualGroups: buildActualGroups(next.day)
            }
          : entry
      );
      return next;
    };
  }

  function updateProgressOptimistically(
    progressEntryId: string,
    patch: Partial<
      Pick<
        ProgressEntry,
        "content" | "startMinute" | "endMinute" | "planItemId" | "sourceItemId" | "sourceTitle" | "planItemTitle" | "isDerivedTodayPlan"
      >
    >,
    dateKey = selectedDateKey
  ): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      const nextUpdatedAt = new Date().toISOString();
      next.day.progressEntries = next.day.progressEntries
        .map((entry) => (entry.id === progressEntryId ? { ...entry, ...patch, updatedAt: nextUpdatedAt } : entry))
        .sort(
          (left, right) =>
            left.startMinute - right.startMinute ||
            left.endMinute - right.endMinute ||
            new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        );
      next.dayActualGroups = buildActualGroups(next.day);
      next.weekDays = next.weekDays.map((entry) => ({
        ...entry,
        actualGroups:
          entry.dateKey === dateKey && dateKey === selectedDateKey
            ? buildActualGroups(next.day)
            : entry.dateKey === dateKey
            ? entry.actualGroups.map((group) => {
                if (group.kind === "free" && group.id === progressEntryId) {
                  if (patch.planItemId) {
                    return group;
                  }

                  return {
                    ...group,
                    title: patch.content ?? group.title,
                    updatedAt: nextUpdatedAt
                  };
                }

                return {
                  ...group,
                  updatedAt:
                    group.items.some((item) => item.id === progressEntryId) || (group.kind === "linked" && group.id === progressEntryId)
                      ? nextUpdatedAt
                      : group.updatedAt,
                  items: group.items.map((item) => (item.id === progressEntryId ? { ...item, content: patch.content ?? item.content } : item))
                };
              }).filter((group) => !(group.kind === "linked" && patch.planItemId === null && group.items.length === 0))
            : entry.actualGroups
      }));
      return next;
    };
  }

  function deleteProgressOptimistically(progressEntryId: string, dateKey = selectedDateKey): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      next.day.progressEntries = next.day.progressEntries.filter((entry) => entry.id !== progressEntryId);
      next.dayActualGroups = buildActualGroups(next.day);
      next.weekDays = next.weekDays.map((entry) => ({
        ...entry,
        actualGroups:
          entry.dateKey === dateKey
            ? entry.actualGroups
                .map((group) => {
                  if (group.kind === "free" && group.id === progressEntryId) {
                    return null;
                  }

                  return {
                    ...group,
                    items: group.items.filter((item) => item.id !== progressEntryId)
                  };
                })
                .filter((group): group is ActualGroup => Boolean(group))
                .filter((group) => group.items.length || group.kind === "manual" || group.kind === "free")
            : entry.actualGroups
      }));
      return next;
    };
  }

  function dismissActualEntryOptimistically(
    targetType: "group" | "item",
    groupKind: ActualGroup["kind"],
    targetId: string,
    dateKey = selectedDateKey
  ): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      const filterGroups = (groups: ActualGroup[]) =>
        groups
          .filter((group) => !(targetType === "group" && group.kind === groupKind && group.id === targetId))
          .map((group) => {
            const hadItems = group.items.length > 0;
            const items =
              targetType === "item" && group.kind === groupKind
                ? group.items.filter((item) => item.id !== targetId)
                : group.items;
            return { ...group, items, hadItems };
          })
          .filter((group) => group.kind === "manual" || group.kind === "free" || group.items.length > 0 || !group.hadItems)
          .map(({ hadItems, ...group }) => group);

      if (dateKey === selectedDateKey) {
        next.dayActualGroups = filterGroups(next.dayActualGroups);
      }

      next.weekDays = next.weekDays.map((entry) =>
        entry.dateKey === dateKey
          ? {
              ...entry,
              actualGroups: filterGroups(entry.actualGroups)
            }
          : entry
      );
      return next;
    };
  }

  function createManualActualGroupOptimistically(title: string, content?: string, tags: TagChip[] = []): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      const tempId = `temp-manual-${crypto.randomUUID()}`;
      next.day.manualActualGroups.unshift({
        id: tempId,
        title,
        tags,
        updatedAt: new Date().toISOString(),
        items: content
          ? [
              {
                id: `temp-manual-item-${crypto.randomUUID()}`,
                content
              }
            ]
          : []
      });
      next.dayActualGroups = buildActualGroups(next.day);
      next.weekDays = next.weekDays.map((entry) =>
        entry.dateKey === selectedDateKey
          ? {
              ...entry,
              actualGroups: buildActualGroups(next.day)
            }
          : entry
      );
      return next;
    };
  }

  function updateManualGroupOptimistically(groupId: string, title: string, tags?: TagChip[]): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      next.day.manualActualGroups = next.day.manualActualGroups.map((group) =>
        group.id === groupId ? { ...group, title, tags: tags ?? group.tags } : group
      );
      next.dayActualGroups = buildActualGroups(next.day);
      next.weekDays = next.weekDays.map((entry) => ({
        ...entry,
        actualGroups: entry.actualGroups.map((group) =>
          group.id === groupId ? { ...group, title, tags: tags ?? group.tags } : group
        )
      }));
      return next;
    };
  }

  function updateActualGroupTagsOptimistically(group: ActualGroup, tags: TagChip[]): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);

      if (group.kind === "linked") {
        next.day.planSections = next.day.planSections.map((section) => ({
          ...section,
          items: section.items.map((item) => (item.id === group.id ? { ...item, tags } : item))
        }));
        next.day.progressEntries = next.day.progressEntries.map((entry) =>
          entry.planItemId === group.id ? { ...entry, tags } : entry
        );
      }

      if (group.kind === "manual") {
        next.day.manualActualGroups = next.day.manualActualGroups.map((entry) =>
          entry.id === group.id ? { ...entry, tags } : entry
        );
      }

      if (group.kind === "free") {
        next.day.progressEntries = next.day.progressEntries.map((entry) =>
          entry.id === group.id ? { ...entry, tags } : entry
        );
      }

      next.dayActualGroups = buildActualGroups(next.day);
      next.weekDays = next.weekDays.map((entry) =>
        entry.dateKey === selectedDateKey
          ? {
              ...entry,
              actualGroups: buildActualGroups(next.day)
            }
          : {
              ...entry,
              actualGroups: entry.actualGroups.map((actualGroup) =>
                actualGroup.kind === group.kind && actualGroup.id === group.id ? { ...actualGroup, tags } : actualGroup
              )
            }
      );
      return next;
    };
  }

  function updateManualItemOptimistically(itemId: string, content: string): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      next.day.manualActualGroups = next.day.manualActualGroups.map((group) => ({
        ...group,
        items: group.items.map((item) => (item.id === itemId ? { ...item, content } : item))
      }));
      next.dayActualGroups = buildActualGroups(next.day);
      next.weekDays = next.weekDays.map((entry) => ({
        ...entry,
        actualGroups: entry.actualGroups.map((group) => ({
          ...group,
          items: group.items.map((item) => (item.id === itemId ? { ...item, content } : item))
        }))
      }));
      return next;
    };
  }

  function deleteManualGroupOptimistically(groupId: string, dateKey: string): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      if (dateKey === selectedDateKey) {
        next.day.manualActualGroups = next.day.manualActualGroups.filter((group) => group.id !== groupId);
        next.dayActualGroups = buildActualGroups(next.day);
      }
      next.weekDays = next.weekDays.map((entry) =>
        entry.dateKey === dateKey
          ? {
              ...entry,
              actualGroups: entry.actualGroups.filter((group) => group.id !== groupId)
            }
          : entry
      );
      return next;
    };
  }

  function deleteManualItemOptimistically(itemId: string, dateKey: string): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      if (dateKey === selectedDateKey) {
        next.day.manualActualGroups = next.day.manualActualGroups
          .map((group) => ({
            ...group,
            items: group.items.filter((item) => item.id !== itemId)
          }))
          .filter((group) => group.items.length);
        next.dayActualGroups = buildActualGroups(next.day);
      }
      next.weekDays = next.weekDays.map((entry) =>
        entry.dateKey === dateKey
          ? {
              ...entry,
              actualGroups: entry.actualGroups
                .map((group) => ({
                  ...group,
                  items: group.items.filter((item) => item.id !== itemId)
                }))
                .filter((group) => group.items.length)
            }
          : entry
      );
      return next;
    };
  }

  function saveDayNoteOptimistically(dateKey: string, content: string): SnapshotUpdater {
    return (current) => {
      const next = cloneSnapshot(current);
      if (dateKey === selectedDateKey) {
        next.day.note = content;
      }
      next.weekDays = next.weekDays.map((entry) => (entry.dateKey === dateKey ? { ...entry, note: content } : entry));
      return next;
    };
  }

  function saveWeekReviewOptimistically(content: string): SnapshotUpdater {
    return (current) => ({
      ...cloneSnapshot(current),
      weekReview: content
    });
  }

  function updateProgressDraftField(field: keyof ProgressDraft, value: string) {
    setProgressDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function selectProgressPlanItem(item: PlanItem) {
    setProgressDraft((current) =>
      current
        ? {
            ...current,
            itemId: item.id,
            sourceItemId: item.isDerivedTodayPlan ? item.sourceItemId ?? null : null,
            title: item.isDerivedTodayPlan ? item.sourceTitle ?? item.title : item.title,
            planItemTitle: item.isDerivedTodayPlan ? item.title : null,
            relationChanged: true
          }
        : current
    );
    setProgressPlanPickerOpen(false);
  }

  function clearProgressPlanItem() {
    setProgressDraft((current) =>
      current
        ? { ...current, itemId: null, sourceItemId: null, title: null, planItemTitle: null, relationChanged: true }
        : current
    );
    setProgressPlanPickerOpen(false);
  }

  async function submitProgressDraft() {
    if (!progressDraft) return;

    const content = normalize(progressDraft.content);
    const startMinute = timeStringToMinute(progressDraft.startTime);
    const endMinute = timeStringToMinute(progressDraft.endTime);

    if (!content && !progressDraft.itemId) {
      setError("不关联项目时，需要填写记录内容。");
      showToast({
        type: "error",
        message: "不关联项目时，需要填写记录内容。"
      });
      return;
    }

    if (!isValidTimeDraftValue(progressDraft.startTime) || !isValidTimeDraftValue(progressDraft.endTime)) {
      setError("请输入正确的时间格式，例如 10:00。");
      showToast({
        type: "error",
        message: "请输入正确的时间格式，例如 10:00。"
      });
      return;
    }

    if (endMinute <= startMinute) {
      setError("结束时间需要晚于开始时间。");
      showToast({
        type: "error",
        message: "结束时间需要晚于开始时间。"
      });
      return;
    }

    setProgressSubmitting(true);

    const isEdit = progressDraft.mode === "edit" && progressDraft.progressEntryId;
    const shouldUpdateRelation = !isEdit || Boolean(progressDraft.relationChanged);

    try {
      await commit(
        isEdit
          ? {
              action: "update-progress-entry",
              selectedDateKey,
              progressEntryId: progressDraft.progressEntryId,
              content,
              ...(shouldUpdateRelation ? { planItemId: progressDraft.itemId } : {}),
              startMinute,
              endMinute
            }
          : {
              action: "create-progress-entry",
              selectedDateKey,
              planItemId: progressDraft.itemId,
              content,
              startMinute,
              endMinute
            },
        {
          successMessage: isEdit ? "今日进展已更新" : "今日进展已记录",
          successToast: true,
          optimisticUpdate: isEdit
            ? updateProgressOptimistically(progressDraft.progressEntryId!, {
                content,
                ...(shouldUpdateRelation
                  ? {
                      planItemId: progressDraft.itemId,
                      sourceItemId: progressDraft.sourceItemId ?? null,
                      sourceTitle: progressDraft.title,
                      planItemTitle: progressDraft.planItemTitle ?? null,
                      isDerivedTodayPlan: Boolean(progressDraft.planItemTitle)
                    }
                  : {}),
                startMinute,
                endMinute
              })
            : createProgressOptimistically({
                planItemId: progressDraft.itemId,
                sourceItemId: progressDraft.sourceItemId ?? null,
                sourceTitle: progressDraft.title,
                planItemTitle: progressDraft.planItemTitle ?? null,
                isDerivedTodayPlan: Boolean(progressDraft.planItemTitle),
                content,
                startMinute,
                endMinute
              })
        }
      );
      setProgressDraft(null);
      setProgressPlanPickerOpen(false);
    } finally {
      setProgressSubmitting(false);
    }
  }

  async function submitProjectNoteDraft() {
    if (!projectNoteDraft) return;

    const content = normalize(projectNoteDraft.content);
    if (!content) {
      setError("请先写下这条项目笔记。");
      showToast({
        type: "error",
        message: "请先写下这条项目笔记。"
      });
      return;
    }

    const currentDayNote = snapshot?.day.note ?? dayNoteDraft;
    const nextEntries = [
      ...parseNoteEntries(currentDayNote),
      {
        kind: "project" as const,
        projectTitle: projectNoteDraft.title,
        projectId: projectNoteDraft.itemId,
        content
      }
    ];

    const nextContent = serializeNoteEntries(nextEntries);
    setDayNoteDraft(nextContent);

    await commit(
      {
        action: "save-day-note",
        selectedDateKey,
        content: nextContent
      },
      {
        successMessage: "项目笔记已记录",
        successToast: true,
        optimisticUpdate: saveDayNoteOptimistically(selectedDateKey, nextContent)
      }
    );

    setProjectNoteDraft(null);
  }

  async function submitTodayPlanDraft() {
    if (!todayPlanDraft) return;
    const title = normalize(todayPlanDraft.title);
    if (!title) {
      setError("请填写今日计划内容。");
      showToast({
        type: "error",
        message: "请填写今日计划内容。"
      });
      return;
    }

    setTodayPlanSubmitting(true);
    try {
      await commit(
        {
          action: "create-today-plan-from-item",
          selectedDateKey,
          sourceItemId: todayPlanDraft.sourceItemId,
          title
        },
        {
          successMessage: "今日计划已添加",
          successToast: true,
          optimisticUpdate: createTodayPlanFromItemOptimistically(
            {
              id: todayPlanDraft.sourceItemId,
              title: todayPlanDraft.sourceTitle,
              completed: false,
              completedAt: null,
              tags: todayPlanDraft.tags
            },
            title
          )
        }
      );
      setTodayPlanDraft(null);
    } finally {
      setTodayPlanSubmitting(false);
    }
  }

  async function submitActualTagDraft() {
    if (!actualTagDraft) return;
    const parsed = parsePlanInput(actualTagDraft.value);
    const tags = toTagChips(parsed.tags);

    await commit(
      {
        action: "update-actual-group-tags",
        selectedDateKey,
        groupKind: actualTagDraft.group.kind,
        groupId: actualTagDraft.group.id,
        tags: parsed.tags
      },
      {
        successMessage: "标签已更新",
        successToast: true,
        optimisticUpdate: updateActualGroupTagsOptimistically(actualTagDraft.group, tags)
      }
    );
    setActualTagDraft(null);
  }

  if (!snapshot && loading) {
    return <main className="boot-screen">正在载入 Dayfold v2...</main>;
  }

  if (!snapshot) {
    return (
      <main className="boot-screen">
        <div>
          <p>{error ?? "读取失败。"}</p>
          <button className="button button-primary" type="button" onClick={() => void refresh(selectedDateKey)}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  const renderPlanSection = (section: PlanSection) => (
    <PlanSectionCard
      key={section.id}
      section={section}
      onRenameSection={(title) =>
        commit({
          action: "rename-section",
          selectedDateKey,
          sectionId: section.id,
          title
        }, { successMessage: "分组名称已更新", optimisticUpdate: renameSectionOptimistically(section.id, title) })
      }
      onDeleteSection={() =>
        commit({
          action: "delete-section",
          selectedDateKey,
          sectionId: section.id
        }, {
          successMessage: "分组已删除",
          successToast: true,
          optimisticUpdate: (current) => ({
            ...cloneSnapshot(current),
            day: {
              ...current.day,
              planSections: current.day.planSections.filter((entry) => entry.id !== section.id)
            }
          })
        })
      }
      onAddItem={(value) => {
        const parsed = parsePlanInput(value);
        return commit({
          action: "create-plan-item",
          selectedDateKey,
          sectionId: section.id,
          title: parsed.title,
          tags: parsed.tags
        }, {
          successMessage: "计划已添加",
          optimisticUpdate: createPlanItemOptimistically(section.id, parsed.title, toTagChips(parsed.tags))
        });
      }}
      onToggleItem={(itemId) =>
        commit({
          action: "toggle-plan-item",
          selectedDateKey,
          planItemId: itemId
        }, { successMessage: "状态已更新", optimisticUpdate: togglePlanItemOptimistically(itemId) })
      }
      onRenameItem={(itemId, title, options) => {
        if (options?.preserveTags) {
          const parsed = parsePlanInput(title);
          const nextTitle = parsed.title || normalize(title);
          const nextTags = parsed.tags.length ? toTagChips(parsed.tags) : undefined;
          return commit({
            action: "rename-plan-item",
            selectedDateKey,
            planItemId: itemId,
            title: nextTitle,
            ...(parsed.tags.length ? { tags: parsed.tags } : {})
          }, {
            successMessage: "计划名称已更新",
            optimisticUpdate: renamePlanItemOptimistically(itemId, nextTitle, nextTags)
          });
        }
        const parsed = parsePlanInput(title);
        return commit({
          action: "rename-plan-item",
          selectedDateKey,
          planItemId: itemId,
          title: parsed.title,
          tags: parsed.tags
        }, {
          successMessage: "计划名称已更新",
          optimisticUpdate: renamePlanItemOptimistically(itemId, parsed.title, toTagChips(parsed.tags))
        });
      }}
      onDeleteItem={(itemId) =>
        commit({
          action: "delete-plan-item",
          selectedDateKey,
          planItemId: itemId
        }, { successMessage: "计划已删除", successToast: true, optimisticUpdate: deletePlanItemOptimistically(itemId) })
      }
      onLogProgress={(item) => {
        setProgressPlanPickerOpen(false);
        setProgressDraft(createLinkedProgressDraft(item));
      }}
      onAddProjectNote={(item) => {
        setProjectNoteDraft({
          itemId: item.id,
          title: item.title,
          content: ""
        });
      }}
      onAddTodayPlan={(item) =>
        setTodayPlanDraft({
          sourceItemId: item.id,
          sourceTitle: item.title,
          title: "",
          tags: item.tags
        })
      }
      onTomorrow={(item) =>
        commit({
          action: "copy-plan-item-tomorrow",
          selectedDateKey,
          planItemId: item.id
        }, { successMessage: "已复制到明日", successToast: true })
      }
      onNextWeek={(item) =>
        commit({
          action: "copy-plan-item-next-week",
          selectedDateKey,
          planItemId: item.id
        }, { successMessage: "已复制到下周", successToast: true })
      }
      availableTags={snapshot.availableTags}
      onManageTags={() => setTagManagerOpen(true)}
      showTourExamples={showOnboardingExamples}
    />
  );

  const primaryPlanSections = snapshot.day.planSections.filter((section) => section.kind === "today" || section.kind === "week");
  const lowerPlanSections = snapshot.day.planSections.filter((section) => section.kind === "long" || section.kind === "custom");

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="hero">
        <div className="hero-left">
          <div className="mode-toggle" data-tour="mode">
            <button className={`mode-pill${mode === "day" ? " active" : ""}`} type="button" onClick={() => setMode("day")}>
              日
            </button>
            <button className={`mode-pill${mode === "week" ? " active" : ""}`} type="button" onClick={() => setMode("week")}>
              周
            </button>
          </div>
          <p className="eyebrow">Dayfold / App v2</p>
          <div className={statusClassName}>{savingCount > 0 ? "保存中..." : statusMessage}</div>
        </div>

        <div className="hero-right">
          <div className="account-inline">
            <button className="beta-badge" type="button" onClick={() => setBetaSafetyOpen(true)}>
              Beta 测试版
            </button>
            <input
              ref={importInputRef}
              hidden
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const confirmed = window.confirm("恢复会覆盖当前账号现有数据。确认继续吗？");
                if (!confirmed) {
                  event.target.value = "";
                  return;
                }
                void importBackupFile(file);
              }}
            />
            <MoreMenu
              triggerClassName="settings-trigger"
              menuClassName="menu-popover settings-popover"
              trigger={
                <>
                  <span className="settings-gear" aria-hidden="true">
                    ⚙
                  </span>
                  <span>设置</span>
                </>
              }
              items={[
                {
                  label: "Beta / 数据安全",
                  onClick: () => {
                    setBetaSafetyOpen(true);
                  }
                },
                {
                  label: "功能说明",
                  onClick: () => {
                    openOnboarding();
                  }
                },
                {
                  label: "标签管理",
                  onClick: () => {
                    setTagManagerOpen(true);
                  }
                },
                {
                  label: "回收站",
                  onClick: () => {
                    void openTrash();
                  }
                },
                {
                  label: exporting ? "导出中..." : "导出数据",
                  onClick: async () => {
                    if (exporting) return;
                    await exportBackup();
                  }
                },
                {
                  label: importing ? "恢复中..." : "恢复备份",
                  onClick: async () => {
                    if (importing) return;
                    importInputRef.current?.click();
                  }
                },
                {
                  label: loggingOut ? "退出中..." : "退出",
                  tone: "danger",
                  onClick: async () => {
                    if (loggingOut) return;
                    setLoggingOut(true);
                    try {
                      await fetch("/api/auth/session", { method: "DELETE" });
                      window.location.reload();
                    } finally {
                      setLoggingOut(false);
                    }
                  }
                }
              ]}
            />
          </div>

          <div className="date-switcher">
            <button
              className="date-arrow"
              type="button"
              aria-label={mode === "day" ? "前一天" : "前一周"}
              onClick={() => shiftDate(mode === "day" ? -1 : -7)}
            >
              &#8249;
            </button>
            <div className="date-popover-wrap" ref={datePopoverRef}>
              <button
                className={`date-card date-trigger${isTodayPage ? " is-today-card" : ""}`}
                type="button"
                onClick={openDatePicker}
              >
                <span className="date-label-row">
                  <span className="date-label">{mode === "day" ? "当前日期" : "当前周"}</span>
                  {isTodayPage ? <span className="date-state-badge is-today">今天</span> : null}
                </span>
                <strong>
                  {mode === "day"
                    ? formatLongDate(selectedDateKey)
                    : `${formatShortDate(weekRange.start)} - ${formatShortDate(weekRange.end)}`}
                </strong>
              </button>
              {datePopoverOpen ? (
                <div className="calendar-popover">
                  <div className="calendar-head">
                    <button
                      className="calendar-arrow"
                      type="button"
                      aria-label="上个月"
                      onClick={() => setCalendarMonthKey((current) => shiftMonth(current, -1))}
                    >
                      &#8249;
                    </button>
                    <strong className="calendar-title">{formatMonthLabel(calendarMonthKey)}</strong>
                    <button
                      className="calendar-arrow"
                      type="button"
                      aria-label="下个月"
                      onClick={() => setCalendarMonthKey((current) => shiftMonth(current, 1))}
                    >
                      &#8250;
                    </button>
                  </div>
                  <div className="calendar-weekdays">
                    {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                  <div className="calendar-grid">
                    {mode === "day"
                      ? calendarWeeks.flat().map((dateKey) => {
                          const currentMonth = parseDateKey(calendarMonthKey).getMonth();
                          const date = parseDateKey(dateKey);
                          const isCurrentMonth = date.getMonth() === currentMonth;
                          const isSelected = dateKey === selectedDateKey;

                          return (
                            <button
                              key={dateKey}
                              className={`calendar-day${isCurrentMonth ? "" : " is-muted"}${isSelected ? " is-selected" : ""}`}
                              type="button"
                              onClick={() => {
                                setSelectedDateKey(dateKey);
                                setDatePopoverOpen(false);
                              }}
                            >
                              {date.getDate()}
                            </button>
                          );
                        })
                      : calendarWeeks.map((week) => {
                          const isSelectedWeek = week.some((dateKey) => selectedWeekKeys.has(dateKey));

                          return (
                            <button
                              key={week[0]}
                              className={`calendar-week-row${isSelectedWeek ? " is-selected" : ""}`}
                              type="button"
                              onClick={() => {
                                setSelectedDateKey(week[0]);
                                setDatePopoverOpen(false);
                              }}
                            >
                              {week.map((dateKey) => {
                                const currentMonth = parseDateKey(calendarMonthKey).getMonth();
                                const date = parseDateKey(dateKey);
                                const isCurrentMonth = date.getMonth() === currentMonth;

                                return (
                                  <span key={dateKey} className={`calendar-week-day${isCurrentMonth ? "" : " is-muted"}`}>
                                    {date.getDate()}
                                  </span>
                                );
                              })}
                            </button>
                          );
                        })}
                  </div>
                  <p className="calendar-hint">{mode === "day" ? "选择某一天" : "选择某一整周"}</p>
                </div>
              ) : null}
            </div>
            <button
              className="date-arrow"
              type="button"
              aria-label={mode === "day" ? "后一天" : "后一周"}
              onClick={() => shiftDate(mode === "day" ? 1 : 7)}
            >
              &#8250;
            </button>
          </div>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}
      {toast ? <div className={`toast ${toast.type === "error" ? "toast-error" : "toast-success"}`}>{toast.message}</div> : null}

      {mode === "day" ? (
        <main className="workspace day-workspace">
          <section className="plans-column plans-column-primary" data-tour="plans">
            {primaryPlanSections.map(renderPlanSection)}
          </section>

          <section className="panel progress-panel" data-tour="progress">
            <div className="panel-head">
              <p className="section-kicker">今日进展</p>
              <div className="panel-head-actions">
                <span className="section-note">按时间线记录</span>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  data-tour="progress-add"
                  onClick={() => {
                    setProgressPlanPickerOpen(false);
                    setProgressDraft(createFreeProgressDraft());
                  }}
                >
                  Add
                </button>
              </div>
            </div>
            <div className="timeline">
              {snapshot.day.progressEntries.length ? (
                snapshot.day.progressEntries.map((entry) => (
                  <article className="progress-row" key={entry.id}>
                    <div className="progress-time">{formatMinuteRange(entry.startMinute, entry.endMinute)}</div>
                    <div className="progress-body">
                      <div className="progress-topline">
                        {entry.planItemId && entry.sourceTitle ? (
                          <InlineEditableText
                            as="span"
                            className="progress-project"
                            value={entry.sourceTitle}
                            onSave={(title) =>
                              commit({
                                action: "rename-plan-item",
                                selectedDateKey,
                                planItemId: entry.isDerivedTodayPlan && entry.sourceItemId ? entry.sourceItemId : entry.planItemId!,
                                title
                              }, {
                                optimisticUpdate: renamePlanItemOptimistically(
                                  entry.isDerivedTodayPlan && entry.sourceItemId ? entry.sourceItemId : entry.planItemId!,
                                  title
                                )
                              })
                            }
                          />
                        ) : (
                          <InlineEditableText
                            as="span"
                            className="progress-free-title"
                            value={entry.content}
                            onSave={(content) =>
                              commit({
                                action: "update-progress-entry",
                                selectedDateKey,
                                progressEntryId: entry.id,
                                content
                              }, {
                                successMessage: "进展已更新",
                                optimisticUpdate: updateProgressOptimistically(entry.id, { content })
                              })
                            }
                          />
                        )}
                        <div className="row-actions">
                          <MoreMenu
                            items={[
                              {
                                label: "编辑",
                                onClick: () => setProgressDraft(createEditProgressDraft(entry))
                              },
                              {
                                label: "删除",
                                tone: "danger",
                                onClick: () =>
                                  commit({
                                    action: "delete-progress-entry",
                                    selectedDateKey,
                                    progressEntryId: entry.id
                                  }, {
                                    successMessage: "进展已删除",
                                    successToast: true,
                                    optimisticUpdate: deleteProgressOptimistically(entry.id)
                                  })
                              }
                            ]}
                          />
                        </div>
                      </div>
                      {entry.planItemId && entry.isDerivedTodayPlan && entry.planItemTitle ? (
                        <div className="progress-derived-stack">
                          <InlineEditableText
                            as="p"
                            className="progress-plan-title"
                            value={entry.planItemTitle}
                            onSave={(title) =>
                              commit({
                                action: "rename-plan-item",
                                selectedDateKey,
                                planItemId: entry.planItemId!,
                                title
                              }, { optimisticUpdate: renamePlanItemOptimistically(entry.planItemId!, title) })
                            }
                          />
                          {entry.content ? (
                            <InlineEditableText
                              className="editable-text progress-text progress-nested-text"
                              value={entry.content}
                              onSave={(content) =>
                                commit({
                                  action: "update-progress-entry",
                                  selectedDateKey,
                                  progressEntryId: entry.id,
                                  content
                                }, {
                                  successMessage: "进展已更新",
                                  optimisticUpdate: updateProgressOptimistically(entry.id, { content })
                                })
                              }
                            />
                          ) : null}
                        </div>
                      ) : entry.planItemId && entry.content ? (
                        <InlineEditableText
                          className="editable-text progress-text"
                          value={entry.content}
                          onSave={(content) =>
                            commit({
                              action: "update-progress-entry",
                              selectedDateKey,
                              progressEntryId: entry.id,
                              content
                            }, {
                              successMessage: "进展已更新",
                              optimisticUpdate: updateProgressOptimistically(entry.id, { content })
                            })
                          }
                        />
                      ) : null}
                    </div>
                  </article>
                ))
              ) : showOnboardingExamples ? (
                <TourProgressExamples />
              ) : (
                <EmptyState text="今天的项目推进会按时间出现在这里。" />
              )}
            </div>
          </section>

          <section className="panel actual-panel" data-tour="actual">
            <div className="panel-head">
              <p className="section-kicker">今日实际</p>
            </div>
            <div className="inline-row">
              <TagComposerInput
                className="tag-composer actual-tag-composer"
                placeholder="直接添加一个项目，例如：临时沟通"
                value={quickActualTitle}
                onChange={setQuickActualTitle}
                availableTags={snapshot.availableTags}
                onManageTags={() => setTagManagerOpen(true)}
                onSubmit={() => {
                    const parsed = parsePlanInput(quickActualTitle);
                    if (!parsed.title) return;
                    setQuickActualSubmitting(true);
                    void commit(
                      {
                        action: "create-manual-actual-group",
                        selectedDateKey,
                        title: parsed.title,
                        tags: parsed.tags
                      },
                      {
                        successMessage: "今日实际已添加",
                        successToast: true,
                        optimisticUpdate: createManualActualGroupOptimistically(parsed.title, undefined, toTagChips(parsed.tags))
                      }
                    )
                      .then(() => setQuickActualTitle(""))
                      .finally(() => setQuickActualSubmitting(false));
                }}
              />
              <button
                className="button button-accent"
                type="button"
                disabled={quickActualSubmitting}
                onClick={() => {
                  const parsed = parsePlanInput(quickActualTitle);
                  setActualDraft({ title: parsed.title, content: "", tags: toTagChips(parsed.tags) });
                  setActualModalOpen(true);
                }}
              >
                {quickActualSubmitting ? "保存中..." : "Add"}
              </button>
            </div>
            <div className="actual-stack">
              {snapshot.dayActualGroups.length ? (
                snapshot.dayActualGroups.map((group) => (
                  <ActualGroupCard
                    key={`${group.kind}-${group.id}`}
                    group={group}
                    onEditTags={() => setActualTagDraft({ group, value: serializeTagsForInput(group.tags) })}
                    onAddProjectNote={() =>
                      setProjectNoteDraft({
                        itemId: group.kind === "linked" ? group.id : null,
                        title: group.title,
                        content: ""
                      })
                    }
                    onRenameGroup={(title) => {
                      if (group.kind === "linked") {
                        return commit({
                          action: "rename-plan-item",
                          selectedDateKey,
                          planItemId: group.id,
                          title
                        }, { successMessage: "项目名称已更新", optimisticUpdate: renamePlanItemOptimistically(group.id, title) });
                      }
                      if (group.kind === "free") {
                        return commit({
                          action: "update-progress-entry",
                          selectedDateKey,
                          progressEntryId: group.id,
                          content: title
                        }, {
                          successMessage: "项目名称已更新",
                          optimisticUpdate: updateProgressOptimistically(group.id, { content: title })
                        });
                      }
                      return commit({
                        action: "update-manual-actual-group",
                        selectedDateKey,
                        groupId: group.id,
                        title
                      }, { successMessage: "项目名称已更新", optimisticUpdate: updateManualGroupOptimistically(group.id, title) });
                    }}
                    onRenameItem={(itemId, content) => {
                      if (group.kind === "linked") {
                        return commit({
                          action: "update-progress-entry",
                          selectedDateKey,
                          progressEntryId: itemId,
                          content
                        }, { successMessage: "内容已更新", optimisticUpdate: updateProgressOptimistically(itemId, { content }) });
                      }
                      return commit({
                        action: "update-manual-actual-item",
                        selectedDateKey,
                        itemId,
                        content
                      }, { successMessage: "内容已更新", optimisticUpdate: updateManualItemOptimistically(itemId, content) });
                    }}
                    onDeleteGroup={() => {
                      return commit({
                        action: "dismiss-actual-entry",
                        selectedDateKey,
                        targetType: "group",
                        groupKind: group.kind,
                        targetId: group.id
                      }, {
                        successMessage: "项目已删除",
                        successToast: true,
                        optimisticUpdate:
                          group.kind === "manual"
                            ? deleteManualGroupOptimistically(group.id, selectedDateKey)
                            : dismissActualEntryOptimistically("group", group.kind, group.id)
                      });
                    }}
                    onDeleteItem={(itemId) => {
                      return commit({
                        action: "dismiss-actual-entry",
                        selectedDateKey,
                        targetType: "item",
                        groupKind: group.kind,
                        targetId: itemId
                      }, {
                        successMessage: "条目已删除",
                        successToast: true,
                        optimisticUpdate:
                          group.kind === "manual"
                            ? deleteManualItemOptimistically(itemId, selectedDateKey)
                            : dismissActualEntryOptimistically("item", group.kind, itemId)
                      });
                    }}
                  />
                ))
              ) : showOnboardingExamples ? (
                <TourActualExamples />
              ) : (
                <EmptyState text="这里会展示按项目聚合后的今日实际。" />
              )}
            </div>
          </section>

          <section className="plans-column plans-column-lower">
            {lowerPlanSections.map(renderPlanSection)}
          </section>

          <section className="panel notes-panel" data-tour="notes">
            <div className="panel-head">
              <p className="section-kicker">今日笔记</p>
              <span className="section-note">{dayNoteStatusText}</span>
            </div>
            {showOnboardingExamples && !snapshot.day.note.trim() ? <TourNoteExamples /> : null}
            <NoteListEditor
              value={dayNoteDraft}
              placeholder="今天还没有笔记。"
              addPlaceholder="添加一条今日笔记"
              onEditingChange={setDayNoteEditing}
              hideEmptyState={showOnboardingExamples && !snapshot.day.note.trim()}
              onSave={(content) => {
                setDayNoteDraft(content);
                if (content === snapshot.day.note) {
                  return Promise.resolve();
                }

                setDayNoteState("saving");
                return commit(
                  {
                    action: "save-day-note",
                    selectedDateKey,
                    content
                  },
                  { successMessage: "今日笔记已保存", optimisticUpdate: saveDayNoteOptimistically(selectedDateKey, content) }
                )
                  .then(() => flashPanelState(setDayNoteState, dayNoteTimeoutRef))
                  .catch((error) => {
                    setDayNoteState("idle");
                    throw error;
                  });
              }}
            />
          </section>
        </main>
      ) : (
        <main className="workspace week-workspace">
          <section className="panel week-actual-panel">
            <div className="panel-head" data-tour="week-actual">
              <p className="section-kicker">本周实际</p>
              <div className="panel-head-actions">
                <span className="section-note">{weekActualView === "date" ? "按日聚合本周的实际推进" : "按标签查看本周推进"}</span>
                <div className="subview-toggle">
                  <button
                    className={`subview-pill${weekActualView === "date" ? " active" : ""}`}
                    type="button"
                    onClick={() => setWeekActualView("date")}
                  >
                    按日期
                  </button>
                  <button
                    className={`subview-pill${weekActualView === "tag" ? " active" : ""}`}
                    type="button"
                    onClick={() => setWeekActualView("tag")}
                  >
                    按标签
                  </button>
                </div>
              </div>
            </div>
            <div className="week-stack">
              {weekActualView === "date" ? (
                snapshot.weekDays.some((entry) => entry.actualGroups.length) ? (
                snapshot.weekDays
                  .filter((entry) => entry.actualGroups.length)
                  .map((entry) => (
                    <article className="week-day-card" key={entry.dateKey}>
                      <div className="week-day-head">
                        <span className="week-day-title">{formatDayLabel(entry.dateKey)}</span>
                        <span className="actual-meta">{entry.actualGroups.length} 个项目</span>
                      </div>
                      <div className="week-day-groups">
                        {entry.actualGroups.map((group) => (
                          <ActualGroupCard
                            key={`${entry.dateKey}-${group.kind}-${group.id}`}
                            group={group}
                            onEditTags={() => setActualTagDraft({ group, value: serializeTagsForInput(group.tags) })}
                            onRenameGroup={(title) => {
                              if (group.kind === "linked") {
                                return commit(
                                  {
                                    action: "rename-plan-item",
                                    selectedDateKey: entry.dateKey,
                                    planItemId: group.id,
                                    title
                                  },
                                  { successMessage: "项目名称已更新", optimisticUpdate: renamePlanItemOptimistically(group.id, title) }
                                );
                              }
                              if (group.kind === "free") {
                                return commit(
                                  {
                                    action: "update-progress-entry",
                                    selectedDateKey: entry.dateKey,
                                    progressEntryId: group.id,
                                    content: title
                                  },
                                  {
                                    successMessage: "项目名称已更新",
                                    optimisticUpdate: updateProgressOptimistically(group.id, { content: title }, entry.dateKey)
                                  }
                                );
                              }
                              return commit(
                                {
                                  action: "update-manual-actual-group",
                                  selectedDateKey: entry.dateKey,
                                  groupId: group.id,
                                  title
                                },
                                { successMessage: "项目名称已更新", optimisticUpdate: updateManualGroupOptimistically(group.id, title) }
                              );
                            }}
                            onRenameItem={(itemId, content) => {
                              if (group.kind === "linked") {
                                return commit(
                                  {
                                    action: "update-progress-entry",
                                    selectedDateKey: entry.dateKey,
                                    progressEntryId: itemId,
                                    content
                                  },
                                  {
                                    successMessage: "内容已更新",
                                    optimisticUpdate: updateProgressOptimistically(itemId, { content }, entry.dateKey)
                                  }
                                );
                              }
                              return commit(
                                {
                                  action: "update-manual-actual-item",
                                  selectedDateKey: entry.dateKey,
                                  itemId,
                                  content
                                },
                                { successMessage: "内容已更新", optimisticUpdate: updateManualItemOptimistically(itemId, content) }
                              );
                            }}
                            onDeleteGroup={() => {
                              return commit(
                                {
                                  action: "dismiss-actual-entry",
                                  selectedDateKey: entry.dateKey,
                                  targetType: "group",
                                  groupKind: group.kind,
                                  targetId: group.id
                                },
                                {
                                  successMessage: "项目已删除",
                                  successToast: true,
                                  optimisticUpdate:
                                    group.kind === "manual"
                                      ? deleteManualGroupOptimistically(group.id, entry.dateKey)
                                      : dismissActualEntryOptimistically("group", group.kind, group.id, entry.dateKey)
                                }
                              );
                            }}
                            onDeleteItem={(itemId) => {
                              return commit(
                                {
                                  action: "dismiss-actual-entry",
                                  selectedDateKey: entry.dateKey,
                                  targetType: "item",
                                  groupKind: group.kind,
                                  targetId: itemId
                                },
                                {
                                  successMessage: "条目已删除",
                                  successToast: true,
                                  optimisticUpdate:
                                    group.kind === "manual"
                                      ? deleteManualItemOptimistically(itemId, entry.dateKey)
                                      : dismissActualEntryOptimistically("item", group.kind, itemId, entry.dateKey)
                                }
                              );
                            }}
                          />
                        ))}
                      </div>
                    </article>
                  ))
                ) : showOnboardingExamples ? (
                  <TourWeekDateExamples />
                ) : (
                  <EmptyState text="这一周的实际推进会按天聚合在这里。" />
                )
              ) : snapshot.weekTagSummaries.length ? (
                snapshot.weekTagSummaries.map((summary) => (
                  <article className="week-tag-summary-card" key={summary.tagId}>
                    <div className="week-tag-summary-head">
                      <span className="plan-tag-chip">{summary.tagName}</span>
                      <span className="week-tag-summary-meta">
                        {summary.actualCount} 项 / {summary.progressCount} 条进展
                      </span>
                    </div>
                    <div className="week-tag-projects">
                      {summary.groups.map((group) => (
                        <div className="week-tag-project" key={`${summary.tagId}-${group.planItemId}`}>
                          <div className="week-tag-project-head">
                            <p className="week-tag-project-title">{group.title}</p>
                          </div>
                          {group.items.length ? (
                            <div className="week-tag-items">
                              {group.items.map((item) => (
                                <div className="week-tag-item" key={`${item.dateKey}-${item.id}`}>
                                  {item.content.split("\n").filter(Boolean).map((line, index) => (
                                    <span className={index === 0 ? "week-tag-item-line" : "week-tag-item-line is-nested"} key={`${line}-${index}`}>
                                      {line}
                                    </span>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </article>
                ))
              ) : showOnboardingExamples ? (
                <TourWeekTagExamples />
              ) : (
                <EmptyState text="这一周里带标签的推进会聚合在这里。" />
              )}
            </div>
          </section>

          <section className="panel week-notes-panel">
            <div className="panel-head">
              <p className="section-kicker">每日笔记汇总</p>
              <span className="section-note">双击编辑单条笔记</span>
            </div>
            <div className="week-stack">
              {snapshot.weekDays.map((entry) => (
                <article className="week-note-card" key={entry.dateKey}>
                  <div className="week-note-head">
                    <span className="week-note-title">{formatDayLabel(entry.dateKey)}</span>
                    <MoreMenu
                      items={[
                        {
                          label: "删除",
                          tone: "danger",
                          onClick: () =>
                            commit({
                              action: "save-day-note",
                              selectedDateKey: entry.dateKey,
                              content: ""
                            }, {
                              successMessage: "笔记已清空",
                              successToast: true,
                              optimisticUpdate: saveDayNoteOptimistically(entry.dateKey, "")
                            })
                        }
                      ]}
                    />
                  </div>
                  <NoteListEditor
                    value={entry.note}
                    placeholder="当天没有笔记"
                    addPlaceholder=""
                    allowCreate={false}
                    compact
                    onSave={(content) =>
                      commit({
                        action: "save-day-note",
                        selectedDateKey: entry.dateKey,
                        content
                      }, { successMessage: "笔记已保存", optimisticUpdate: saveDayNoteOptimistically(entry.dateKey, content) })
                    }
                  />
                </article>
              ))}
            </div>
          </section>

          <section className="panel week-review-panel">
            <div className="panel-head">
              <p className="section-kicker">本周复盘</p>
              <span className="section-note">{weekReviewStatusText}</span>
            </div>
            <MultilineNoteEditor
              value={weekReviewDraft}
              placeholder="写下本周最重要的推进、问题、判断和下一步..."
              className="note-display"
              editingClassName="note-editor"
              rows={10}
              onEditingChange={setWeekReviewEditing}
              onSave={(content) => {
                setWeekReviewDraft(content);
                if (content === snapshot.weekReview) {
                  return Promise.resolve();
                }

                setWeekReviewState("saving");
                return commit(
                  {
                    action: "save-week-review",
                    selectedDateKey,
                    content
                  },
                  { successMessage: "本周复盘已保存", optimisticUpdate: saveWeekReviewOptimistically(content) }
                )
                  .then(() => flashPanelState(setWeekReviewState, weekReviewTimeoutRef))
                  .catch((error) => {
                    setWeekReviewState("idle");
                    throw error;
                  });
              }}
            />
          </section>
        </main>
      )}

      {onboardingOpen ? (
        <OnboardingTour
          stepIndex={onboardingStep}
          targetRect={onboardingTargetRect}
          onBack={() => setOnboardingStep((current) => Math.max(0, current - 1))}
          onNext={advanceOnboarding}
          onClose={closeOnboarding}
        />
      ) : null}

      {betaSafetyOpen ? (
        <div className="modal-backdrop" onClick={() => setBetaSafetyOpen(false)}>
          <div className="modal-panel beta-safety-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <div>
                <p className="section-kicker">Beta / 数据安全</p>
                <h2 className="beta-safety-title">这是测试版，请先知道数据怎么保护</h2>
              </div>
              <button className="button button-ghost" type="button" onClick={() => setBetaSafetyOpen(false)}>
                关闭
              </button>
            </div>

            <div className="beta-safety-copy">
              <p>
                Dayfold 目前处于 beta 测试阶段。你的内容会保存到当前登录账号，但功能和数据结构仍可能继续调整。
              </p>
              <p>建议在重要测试前后导出一次备份；如果只是想重新体验新用户流程，可以清空当前账号的数据。</p>
            </div>

            <div className="beta-safety-grid">
              <article className="beta-safety-card">
                <span className="beta-safety-card-kicker">备份</span>
                <h3>导出我的数据</h3>
                <p>下载当前账号的计划、进展、实际、笔记、复盘和标签，保存为 JSON 文件。</p>
                <button className="button button-primary" type="button" disabled={exporting} onClick={() => void exportBackup()}>
                  {exporting ? "导出中..." : "导出数据"}
                </button>
              </article>

              <article className="beta-safety-card">
                <span className="beta-safety-card-kicker">恢复</span>
                <h3>从备份恢复</h3>
                <p>选择之前导出的备份文件，覆盖恢复到当前账号。恢复前会再次确认。</p>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={importing}
                  onClick={() => importInputRef.current?.click()}
                >
                  {importing ? "恢复中..." : "恢复备份"}
                </button>
              </article>

              <article className="beta-safety-card beta-safety-danger">
                <span className="beta-safety-card-kicker">重置</span>
                <h3>清空当前账号数据</h3>
                <p>只清空当前账号内容，保留账号和登录状态。执行前需要输入“清空”确认。</p>
                <button
                  className="button button-danger"
                  type="button"
                  disabled={clearingData}
                  onClick={() => void clearCurrentAccountData()}
                >
                  {clearingData ? "清空中..." : "清空数据"}
                </button>
              </article>
            </div>
          </div>
        </div>
      ) : null}

      {tagManagerOpen && snapshot ? (
        <div className="modal-backdrop tag-manager-backdrop" onClick={() => setTagManagerOpen(false)}>
          <div className="modal-panel tag-manager-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <div>
                <p className="section-kicker">标签管理</p>
                <h2 className="tag-manager-title">整理你的分类标签</h2>
              </div>
              <button
                className="button button-ghost"
                type="button"
                onClick={() => {
                  setTagManagerOpen(false);
                  setEditingTagId(null);
                  setEditingTagName("");
                }}
              >
                关闭
              </button>
            </div>

            <p className="tag-manager-help">删除标签不会删除计划、进展或实际内容，只会移除这些内容上的标签标记。</p>

            <form
              className="tag-manager-create"
              onSubmit={(event) => {
                event.preventDefault();
                void createManagedTag();
              }}
            >
              <input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                placeholder="新建标签，例如：健康"
              />
              <button className="button button-primary" type="submit" disabled={!normalizeTagName(tagDraft)}>
                添加
              </button>
            </form>

            <div className="tag-manager-list">
              {snapshot.availableTags.length ? (
                snapshot.availableTags.map((tag) => (
                  <article className="tag-manager-row" key={tag.id}>
                    {editingTagId === tag.id ? (
                      <form
                        className="tag-manager-edit"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void renameManagedTag(tag);
                        }}
                      >
                        <input
                          autoFocus
                          value={editingTagName}
                          onChange={(event) => setEditingTagName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setEditingTagId(null);
                              setEditingTagName("");
                            }
                          }}
                        />
                        <button className="button button-primary" type="submit" disabled={!normalizeTagName(editingTagName)}>
                          保存
                        </button>
                        <button
                          className="button button-ghost"
                          type="button"
                          onClick={() => {
                            setEditingTagId(null);
                            setEditingTagName("");
                          }}
                        >
                          取消
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="plan-tag-chip tag-manager-chip">{tag.name}</span>
                        <div className="tag-manager-actions">
                          <button
                            className="account-action"
                            type="button"
                            onClick={() => {
                              setEditingTagId(tag.id);
                              setEditingTagName(tag.name);
                            }}
                          >
                            重命名
                          </button>
                          <button className="account-action tag-manager-delete" type="button" onClick={() => void deleteManagedTag(tag)}>
                            删除
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))
              ) : (
                <div className="empty-state">还没有标签。你可以在计划输入里用 # 创建，也可以在这里直接添加。</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {trashOpen ? (
        <div className="modal-backdrop trash-backdrop" onClick={() => setTrashOpen(false)}>
          <div className="modal-panel trash-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <div>
                <p className="section-kicker">回收站</p>
                <h2 className="trash-title">最近 5 天删除的内容</h2>
              </div>
              <button className="button button-ghost" type="button" onClick={() => setTrashOpen(false)}>
                关闭
              </button>
            </div>
            <p className="trash-help">恢复后会尽量放回删除前的位置，并保留原来的标签、进展、实际条目等关联。</p>

            <div className="trash-list">
              {trashLoading ? (
                <div className="empty-state">正在读取回收站...</div>
              ) : trashEntries.length ? (
                trashEntries.map((entry) => (
                  <article className="trash-row" key={entry.id}>
                    <div className="trash-row-main">
                      <span className="trash-kind">{trashKindLabel(entry.kind)}</span>
                      <strong>{entry.title}</strong>
                      <span className="trash-meta">
                        删除于 {formatTrashDate(entry.createdAt)}，保留至 {formatTrashDate(entry.expiresAt)}
                      </span>
                    </div>
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={restoringTrashId === entry.id}
                      onClick={() => void restoreTrashEntry(entry)}
                    >
                      {restoringTrashId === entry.id ? "恢复中..." : "恢复"}
                    </button>
                  </article>
                ))
              ) : (
                <div className="empty-state">回收站是空的。之后删除的计划、进展和实际会在这里保留 5 天。</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {todayPlanDraft ? (
        <div className="modal-backdrop" onClick={() => setTodayPlanDraft(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <p className="section-kicker">添加今日计划</p>
              <button className="button button-ghost" type="button" onClick={() => setTodayPlanDraft(null)}>
                关闭
              </button>
            </div>
            <div className="progress-link-card">
              <div className="progress-link-topline">
                <span className="field-label-text">来自项目</span>
              </div>
              <div className="context-line progress-context-line">
                <span className="plan-source-chip today-plan-source-chip">{todayPlanDraft.sourceTitle}</span>
              </div>
            </div>
            <input
              autoFocus
              className="note-item-input"
              type="text"
              placeholder="写今天围绕这个项目要推进的具体事项"
              value={todayPlanDraft.title}
              onChange={(event) =>
                setTodayPlanDraft((current) => (current ? { ...current, title: event.target.value } : current))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submitTodayPlanDraft();
                }
              }}
            />
            <div className="modal-actions">
              <button
                className="button button-primary"
                type="button"
                disabled={todayPlanSubmitting}
                onClick={() => void submitTodayPlanDraft()}
              >
                {todayPlanSubmitting ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {actualTagDraft ? (
        <div className="modal-backdrop" onClick={() => setActualTagDraft(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <p className="section-kicker">编辑实际标签</p>
              <button className="button button-ghost" type="button" onClick={() => setActualTagDraft(null)}>
                关闭
              </button>
            </div>
            <div className="progress-link-card">
              <div className="progress-link-topline">
                <span className="field-label-text">记录</span>
              </div>
              <p className="context-line">{actualTagDraft.group.title}</p>
            </div>
            <TagComposerInput
              className="tag-composer actual-tag-composer"
              inputClassName="tag-composer-input"
              value={actualTagDraft.value}
              onChange={(value) => setActualTagDraft((current) => (current ? { ...current, value } : current))}
              availableTags={snapshot.availableTags}
              placeholder="输入 # 添加标签，例如：#工作 #生活"
              onManageTags={() => setTagManagerOpen(true)}
              onSubmit={() => void submitActualTagDraft()}
            />
            <div className="modal-actions">
              <button className="button button-primary" type="button" onClick={() => void submitActualTagDraft()}>
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {progressDraft ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setProgressDraft(null);
            setProgressPlanPickerOpen(false);
          }}
        >
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <p className="section-kicker">{progressDraft.mode === "edit" ? "编辑进展" : "进展"}</p>
              <button
                className="button button-ghost"
                type="button"
                onClick={() => {
                  setProgressDraft(null);
                  setProgressPlanPickerOpen(false);
                }}
              >
                关闭
              </button>
            </div>
            <div className="progress-link-card">
              <div className="progress-link-topline">
                <span className="field-label-text">关联项目</span>
                <button
                  className="link-toggle-button"
                  type="button"
                  onClick={() => setProgressPlanPickerOpen((current) => !current)}
                >
                  {progressDraft.itemId ? "更换关联" : "选择项目"}
                </button>
              </div>
              {progressDraft.title ? (
                <div className="context-line progress-context-line">
                  <span>{progressDraft.title}</span>
                  {progressDraft.planItemTitle ? <span className="progress-context-detail">{progressDraft.planItemTitle}</span> : null}
                  <button className="link-clear-button" type="button" onClick={clearProgressPlanItem}>
                    取消关联
                  </button>
                </div>
              ) : (
                <p className="progress-link-hint">不选择项目时，这条记录会作为自由记录进入今日进展和今日实际。</p>
              )}
              {progressPlanPickerOpen ? (
                <div className="plan-link-picker">
                  {progressPlanSections.map((section) => (
                    <div className="plan-link-section" key={section.id}>
                      <p className="plan-link-section-title">{section.title}</p>
                      <div className="plan-link-chip-row">
                        {section.items.map((item) => (
                          <button
                            key={item.id}
                            className={`plan-link-chip${progressDraft.itemId === item.id ? " is-active" : ""}`}
                            type="button"
                            onClick={() => selectProgressPlanItem(item)}
                          >
                            {item.sourceTitle ? `${item.sourceTitle} / ${item.title}` : item.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="field-row field-row-compact">
              <TimeDraftField
                label="开始"
                value={progressDraft.startTime}
                onChange={(value) => updateProgressDraftField("startTime", value)}
                onBlur={() =>
                  updateProgressDraftField("startTime", finalizeTimeDraftInput(progressDraft.startTime, buildDefaultTimeRange().startTime))
                }
                onEnter={() => void submitProgressDraft()}
              />
              <TimeDraftField
                label="结束"
                value={progressDraft.endTime}
                onChange={(value) => updateProgressDraftField("endTime", value)}
                onBlur={() =>
                  updateProgressDraftField("endTime", finalizeTimeDraftInput(progressDraft.endTime, buildDefaultTimeRange().endTime))
                }
                onEnter={() => void submitProgressDraft()}
              />
            </div>
            <textarea
              rows={5}
              placeholder={
                progressDraft.itemId
                  ? "可选：写一句今天围绕这个项目推进了什么、停在哪里、下次怎么接..."
                  : "直接写下这段时间你实际推进的项目或事项"
              }
              value={progressDraft.content}
              onChange={(event) => updateProgressDraftField("content", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submitProgressDraft();
                }
              }}
            />
            <div className="modal-actions">
              <button
                className="button button-primary"
                type="button"
                disabled={progressSubmitting}
                onClick={() => void submitProgressDraft()}
              >
                {progressSubmitting ? "保存中..." : progressDraft.mode === "edit" ? "更新" : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {projectNoteDraft ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setProjectNoteDraft(null);
          }}
        >
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <p className="section-kicker">项目笔记</p>
              <button className="button button-ghost" type="button" onClick={() => setProjectNoteDraft(null)}>
                关闭
              </button>
            </div>
            <div className="progress-link-card">
              <div className="progress-link-topline">
                <span className="field-label-text">关联项目</span>
              </div>
              <div className="context-line progress-context-line">
                <span className="plan-source-chip project-note-source-chip">{projectNoteDraft.title}</span>
              </div>
            </div>
            <input
              autoFocus
              className="note-item-input"
              type="text"
              placeholder="记录这次关于该项目的思考、结论或发现"
              value={projectNoteDraft.content}
              onChange={(event) =>
                setProjectNoteDraft((current) => (current ? { ...current, content: event.target.value } : current))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submitProjectNoteDraft();
                }
              }}
            />
            <div className="modal-actions">
              <button className="button button-primary" type="button" onClick={() => void submitProjectNoteDraft()}>
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {actualModalOpen ? (
        <div className="modal-backdrop" onClick={() => setActualModalOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <p className="section-kicker">手动补记今日实际</p>
              <button className="button button-ghost" type="button" onClick={() => setActualModalOpen(false)}>
                关闭
              </button>
            </div>
            <div className="field-stack">
              <input
                type="text"
                placeholder="项目名，例如：临时沟通"
                value={actualDraft.title}
                onChange={(event) => setActualDraft((current) => ({ ...current, title: event.target.value }))}
              />
              <TagComposerInput
                className="tag-composer actual-tag-composer"
                inputClassName="tag-composer-input"
                value={serializeTagsForInput(actualDraft.tags)}
                onChange={(value) => {
                  const parsed = parsePlanInput(value);
                  setActualDraft((current) => ({ ...current, tags: toTagChips(parsed.tags) }));
                }}
                availableTags={snapshot.availableTags}
                placeholder="添加标签，例如：#工作"
                onManageTags={() => setTagManagerOpen(true)}
              />
              <textarea
                rows={4}
                placeholder="写下今天实际做了什么"
                value={actualDraft.content}
                onChange={(event) => setActualDraft((current) => ({ ...current, content: event.target.value }))}
              />
            </div>
            <div className="modal-actions">
              <button
                className="button button-primary"
                type="button"
                disabled={actualSubmitting}
                onClick={() =>
                  {
                    setActualSubmitting(true);
                    void commit(
                      {
                        action: "create-manual-actual-group",
                          selectedDateKey,
                          title: actualDraft.title,
                          content: actualDraft.content,
                          tags: actualDraft.tags.map((tag) => tag.name)
                      },
                      {
                        successMessage: "今日实际已补记",
                        successToast: true,
                        optimisticUpdate: createManualActualGroupOptimistically(actualDraft.title, actualDraft.content, actualDraft.tags)
                      }
                    )
                      .then(() => {
                        setQuickActualTitle("");
                        setActualDraft({ title: "", content: "", tags: [] });
                        setActualModalOpen(false);
                      })
                      .finally(() => setActualSubmitting(false));
                  }
                }
              >
                {actualSubmitting ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlanSectionCard({
  section,
  onRenameSection,
  onDeleteSection,
  onAddItem,
  onToggleItem,
  onRenameItem,
  onDeleteItem,
  onLogProgress,
  onAddProjectNote,
  onAddTodayPlan,
  onTomorrow,
  onNextWeek,
  availableTags,
  onManageTags,
  showTourExamples
}: {
  section: PlanSection;
  onRenameSection: (title: string) => Promise<void>;
  onDeleteSection: () => Promise<void>;
  onAddItem: (value: string) => Promise<void>;
  onToggleItem: (itemId: string) => Promise<void>;
  onRenameItem: (itemId: string, title: string, options?: { preserveTags?: boolean }) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onLogProgress: (item: PlanItem) => void;
  onAddProjectNote: (item: PlanItem) => void;
  onAddTodayPlan: (item: PlanItem) => void;
  onTomorrow: (item: PlanItem) => Promise<void>;
  onNextWeek: (item: PlanItem) => Promise<void>;
  availableTags: TagChip[];
  onManageTags: () => void;
  showTourExamples: boolean;
}) {
  const [inputValue, setInputValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  async function handleAddItem() {
    const nextValue = normalize(inputValue);
    const parsed = parsePlanInput(nextValue);
    if (!parsed.title) return;

    setAdding(true);
    try {
      await onAddItem(nextValue);
      setInputValue("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <article className="panel section-panel" data-tour={`plan-${section.kind}`}>
      <div className="section-head">
        <InlineEditableText
          as="p"
          className="section-kicker"
          value={section.title}
          editable={section.isCustom}
          onSave={onRenameSection}
        />
        {section.isCustom ? <MoreMenu items={[{ label: "删除", tone: "danger", onClick: onDeleteSection }]} /> : null}
      </div>

      <div className="inline-row plan-input-row">
        <TagComposerInput
          value={inputValue}
          onChange={setInputValue}
          availableTags={availableTags}
          placeholder={section.placeholder}
          disabled={adding}
          onSubmit={() => void handleAddItem()}
          onManageTags={onManageTags}
        />
        <button
          className={`button ${section.tone === "primary" ? "button-primary" : "button-secondary"}`}
          type="button"
          disabled={adding}
          onClick={() => void handleAddItem()}
        >
          {adding ? "保存中..." : "Add"}
        </button>
      </div>

      <div className="list-stack">
        {section.items.length ? (
          section.items.map((item) => {
            const menuItems = [];
            if (section.kind === "today") {
              menuItems.push({ label: "移到明日", onClick: () => onTomorrow(item) });
            }
            if (section.kind === "week") {
              menuItems.push({ label: "添加今日计划", onClick: () => onAddTodayPlan(item) });
              menuItems.push({ label: "移到下周", onClick: () => onNextWeek(item) });
            }
            if (section.kind === "long") {
              menuItems.push({ label: "添加今日计划", onClick: () => onAddTodayPlan(item) });
            }
            menuItems.push({ label: "笔记", onClick: () => onAddProjectNote(item) });
            menuItems.push({ label: "删除", tone: "danger" as const, onClick: () => onDeleteItem(item.id) });

            return (
              <article className={`plan-row${item.completed ? " is-completed" : ""}`} key={item.id}>
                <div className="plan-main">
                  <button
                    className="plan-tick"
                    type="button"
                    aria-label={item.completed ? "标记为未完成" : "标记为完成"}
                    onClick={() => void onToggleItem(item.id)}
                  />
                  {(!item.isDerivedTodayPlan || !item.sourceTitle) && item.tags.length && editingItemId !== item.id ? (
                    <div className="plan-tag-group">
                      <span className="plan-tag-chip">{item.tags[0].name}</span>
                      {item.tags.length > 1 ? <span className="plan-tag-more">+{item.tags.length - 1}</span> : null}
                    </div>
                  ) : null}
                  <div className={`plan-copy${item.isDerivedTodayPlan && item.sourceTitle && editingItemId !== item.id ? " is-derived" : ""}`}>
                    {item.isDerivedTodayPlan && item.sourceTitle && editingItemId !== item.id ? (
                      <span className="plan-source-chip">{item.sourceTitle}</span>
                    ) : null}
                    <PlanInlineEditableText
                      value={item.title}
                      editValue={item.isDerivedTodayPlan ? item.title : serializePlanInput(item.title, item.tags)}
                      availableTags={availableTags}
                      onManageTags={onManageTags}
                      onEditingChange={(isEditing) => {
                        setEditingItemId((current) => {
                          if (isEditing) {
                            return item.id;
                          }
                          return current === item.id ? null : current;
                        });
                      }}
                      onSave={(title) => onRenameItem(item.id, title, { preserveTags: Boolean(item.isDerivedTodayPlan) })}
                    />
                  </div>
                </div>
                <div className="plan-actions">
                  <button className="text-action" type="button" onClick={() => onLogProgress(item)}>
                    进展
                  </button>
                  <MoreMenu items={menuItems} />
                </div>
              </article>
            );
          })
        ) : showTourExamples && (section.kind === "today" || section.kind === "week" || section.kind === "long") ? (
          <TourPlanExamples kind={section.kind} />
        ) : (
          <EmptyState text="还没有内容。" />
        )}
      </div>
    </article>
  );
}

function TourPlanExamples({ kind }: { kind: "today" | "week" | "long" }) {
  return (
    <div className="tour-example-stack" aria-label="新手引导示例">
      <span className="tour-example-label">演示示例，不会保存</span>
      {TOUR_PLAN_EXAMPLES[kind].map((item) => (
        <article className="plan-row tour-sample-row" key={`${kind}-${item.title}`}>
          <div className="plan-main">
            <span className="plan-tick is-sample" aria-hidden="true" />
            <div className="plan-tag-group">
              {item.tags.slice(0, 2).map((tag) => (
                <span className="plan-tag-chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <div className="plan-copy">
              <span className="tour-sample-title">{item.title}</span>
            </div>
          </div>
          <div className="plan-actions">
            <span className="text-action is-sample">进展</span>
            <span className="text-action is-sample">•••</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function TourProgressExamples() {
  return (
    <div className="tour-example-stack" aria-label="今日进展示例">
      <span className="tour-example-label">演示示例，不会保存</span>
      <article className="progress-row tour-sample-row">
        <div className="progress-time">10:00-11:30</div>
        <div className="progress-body">
          <div className="progress-topline">
            <span className="progress-project">Dayfold 可用性优化</span>
          </div>
          <p className="editable-text progress-text">调整新手引导逻辑，补充新用户的示例工作流。</p>
        </div>
      </article>
      <article className="progress-row tour-sample-row">
        <div className="progress-time">15:00-15:40</div>
        <div className="progress-body">
          <div className="progress-topline">
            <span className="progress-free-label">自由记录</span>
          </div>
          <p className="editable-text progress-text">临时沟通测试反馈，确认下一轮体验问题。</p>
        </div>
      </article>
    </div>
  );
}

function TourActualExamples() {
  return (
    <div className="tour-example-stack" aria-label="今日实际示例">
      <span className="tour-example-label">演示示例，不会保存</span>
      <article className="actual-group tour-sample-row">
        <div className="actual-topline">
          <span className="actual-title">Dayfold 可用性优化</span>
        </div>
        <div className="actual-items">
          <div className="actual-bullet">
            <p className="actual-bullet-text">调整新手引导逻辑，补充新用户的示例工作流。</p>
          </div>
          <div className="actual-bullet">
            <p className="actual-bullet-text">把「计划」和「实际」的差异讲清楚。</p>
          </div>
        </div>
      </article>
      <article className="actual-group tour-sample-row">
        <div className="actual-topline">
          <span className="actual-title">临时沟通测试反馈</span>
        </div>
      </article>
    </div>
  );
}

function TourNoteExamples() {
  return (
    <div className="note-list tour-note-example" aria-label="今日笔记示例">
      <span className="tour-example-label">演示示例，不会保存</span>
      <div className="note-list-items">
        <div className="note-row is-project">
          <span className="note-bullet" aria-hidden="true">
            •
          </span>
          <div className="note-content is-project">
            <span className="note-project-chip">Dayfold 可用性优化</span>
            <span className="note-item-button">新用户更需要先理解「计划 ≠ 实际」。</span>
          </div>
        </div>
        <div className="note-row">
          <span className="note-bullet" aria-hidden="true">
            •
          </span>
          <div className="note-content">
            <span className="note-item-button">今天被临时沟通打断，但也暴露了真实测试场景。</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TourWeekDateExamples() {
  return (
    <div className="tour-example-stack" aria-label="本周实际按日期示例">
      <span className="tour-example-label">演示示例，不会保存</span>
      {[
        {
          label: "周一",
          groups: [
            { title: "Dayfold 可用性优化", items: ["调整新手引导逻辑", "梳理新用户工作流"] },
            { title: "临时沟通测试反馈", items: ["确认下一轮体验问题"] }
          ]
        },
        {
          label: "周二",
          groups: [{ title: "Dayfold 可用性优化", items: ["根据反馈压缩模块行距", "修复弹窗层级"] }]
        }
      ].map((day) => (
        <article className="week-day-card tour-sample-row" key={day.label}>
          <div className="week-day-head">
            <span className="week-day-title">{day.label}</span>
            <span className="actual-meta">{day.groups.length} 个项目</span>
          </div>
          <div className="week-day-groups">
            {day.groups.map((group) => (
              <article className="actual-group" key={`${day.label}-${group.title}`}>
                <div className="actual-topline">
                  <span className="actual-title">{group.title}</span>
                </div>
                <div className="actual-items">
                  {group.items.map((item) => (
                    <div className="actual-bullet" key={item}>
                      <p className="actual-bullet-text">{item}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function TourWeekTagExamples() {
  return (
    <div className="tour-example-stack" aria-label="本周实际按标签示例">
      <span className="tour-example-label">演示示例，不会保存</span>
      <article className="week-tag-summary-card tour-sample-row">
        <div className="week-tag-summary-head">
          <span className="plan-tag-chip">工作</span>
          <span className="week-tag-summary-meta">2 项 / 5 条进展</span>
        </div>
        <div className="week-tag-projects">
          <div className="week-tag-project">
            <p className="week-tag-project-title">Dayfold 可用性优化</p>
            <div className="week-tag-items">
              <p className="week-tag-item">周一：调整新手引导逻辑</p>
              <p className="week-tag-item">周一：梳理新用户工作流</p>
              <p className="week-tag-item">周二：修复弹窗层级</p>
              <p className="week-tag-item">周二：压缩今日实际行距</p>
            </div>
          </div>
          <div className="week-tag-project">
            <p className="week-tag-project-title">产品测试反馈</p>
            <div className="week-tag-items">
              <p className="week-tag-item">周三：整理第一批测试问题</p>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

function StructuredActualItemText({
  content,
  structured,
  onSave
}: {
  content: string;
  structured: boolean;
  onSave: (content: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const lines = content.split("\n").filter((line) => line.trim());
  const title = lines[0] ?? content;
  const details = lines.slice(1);
  const editableContent = structured ? details.join("\n") : content;
  const [draft, setDraft] = useState(editableContent);

  useEffect(() => {
    setDraft(editableContent);
  }, [editableContent]);

  async function commitDraft() {
    const nextValue = draft
      .split("\n")
      .map((line) => normalize(line))
      .filter(Boolean)
      .join("\n");
    setIsEditing(false);
    if (nextValue !== editableContent) {
      await onSave(nextValue);
    }
  }

  if (isEditing) {
    return (
      <textarea
        autoFocus
        className="inline-editor actual-inline-editor"
        rows={Math.max(2, structured ? details.length : lines.length)}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commitDraft()}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void commitDraft();
          }
          if (event.key === "Escape") {
            setDraft(content);
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button className="actual-structured-text" type="button" onDoubleClick={() => setIsEditing(true)}>
      <span className="actual-bullet-text">{title}</span>
      {details.map((detail, index) => (
        <span className="actual-nested-bullet" key={`${detail}-${index}`}>
          {detail}
        </span>
      ))}
    </button>
  );
}

function ActualGroupCard({
  group,
  onEditTags,
  onAddProjectNote,
  onRenameGroup,
  onRenameItem,
  onDeleteGroup,
  onDeleteItem
}: {
  group: ActualGroup;
  onEditTags: () => void;
  onAddProjectNote?: () => void;
  onRenameGroup: (title: string) => Promise<void>;
  onRenameItem: (itemId: string, content: string) => Promise<void>;
  onDeleteGroup: () => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
}) {
  return (
    <article className="actual-group">
      <div className="actual-topline">
        <div className="actual-title-wrap">
          {group.tags.length ? (
            <div className="actual-tag-row">
              {group.tags.slice(0, 3).map((tag) => (
                <span className="plan-tag-chip actual-tag-chip" key={tag.id}>
                  {tag.name}
                </span>
              ))}
              {group.tags.length > 3 ? <span className="plan-tag-more">+{group.tags.length - 3}</span> : null}
            </div>
          ) : null}
          <InlineEditableText as="span" className="actual-title" value={group.title} onSave={onRenameGroup} />
        </div>
        <div className="row-actions">
          <MoreMenu
            items={[
              ...(onAddProjectNote ? [{ label: "笔记", onClick: onAddProjectNote }] : []),
              { label: "编辑标签", onClick: onEditTags },
              { label: "删除", tone: "danger", onClick: onDeleteGroup }
            ]}
          />
        </div>
      </div>

      {group.items.length ? (
        <div className="actual-items">
          {group.items.map((item) => (
            <div className="actual-bullet" key={item.id}>
              <StructuredActualItemText
                content={item.content}
                structured={Boolean(item.structured)}
                onSave={(content) => onRenameItem(item.id, content)}
              />
              <MoreMenu items={[{ label: "删除", tone: "danger", onClick: () => onDeleteItem(item.id) }]} />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
