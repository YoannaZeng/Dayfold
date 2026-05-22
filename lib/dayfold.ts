export type ViewMode = "day" | "week";
export type SectionKind = "today" | "week" | "long" | "custom";

export type TagChip = {
  id: string;
  name: string;
};

export type PlanItem = {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string | null;
  sourceItemId?: string | null;
  sourceTitle?: string | null;
  isDerivedTodayPlan?: boolean;
  tags: TagChip[];
};

export type PlanSection = {
  id: string;
  kind: SectionKind;
  title: string;
  placeholder: string;
  tone: "primary" | "secondary";
  isCustom: boolean;
  items: PlanItem[];
};

export type ProgressEntry = {
  id: string;
  planItemId: string | null;
  sourceItemId?: string | null;
  sourceTitle: string | null;
  planItemTitle?: string | null;
  isDerivedTodayPlan?: boolean;
  tags: TagChip[];
  content: string;
  startMinute: number;
  endMinute: number;
  createdAt: string;
  updatedAt: string;
};

export type ActualItem = {
  id: string;
  content: string;
  structured?: boolean;
};

export type ManualActualGroup = {
  id: string;
  title: string;
  tags: TagChip[];
  items: ActualItem[];
  updatedAt: string;
};

export type DayState = {
  planSections: PlanSection[];
  progressEntries: ProgressEntry[];
  manualActualGroups: ManualActualGroup[];
  note: string;
};

export type WeekState = {
  review: string;
};

export type PersistedState = {
  mode: ViewMode;
  selectedDateKey: string;
  days: Record<string, DayState>;
  weeks: Record<string, WeekState>;
};

export type ActualGroup = {
  id: string;
  kind: "linked" | "manual" | "free";
  title: string;
  tags: TagChip[];
  updatedAt: string;
  items: ActualItem[];
};

export type WeekTagSummary = {
  tagId: string;
  tagName: string;
  actualCount: number;
  progressCount: number;
  planTitles: string[];
  groups: Array<{
    planItemId: string;
    title: string;
    items: Array<ActualItem & { dateKey: string }>;
  }>;
};

export const STORAGE_KEY = "dayfold-app-v2";

const defaultSections: Omit<PlanSection, "id" | "items">[] = [
  {
    kind: "today",
    title: "今日计划",
    placeholder: "添加今天要做的事",
    tone: "primary",
    isCustom: false
  },
  {
    kind: "week",
    title: "本周计划",
    placeholder: "添加本周要推进的事",
    tone: "secondary",
    isCustom: false
  },
  {
    kind: "long",
    title: "长期项目",
    placeholder: "添加长期项目",
    tone: "secondary",
    isCustom: false
  }
];

export function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeTagName(value: string) {
  return normalize(value.replace(/^[#＃]+/, ""));
}

export function dedupeTagNames(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  values.forEach((value) => {
    const normalized = normalizeTagName(value);
    if (!normalized) return;
    const key = normalized.toLocaleLowerCase("zh-CN");
    if (seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });

  return output;
}

export function parsePlanInput(rawValue: string) {
  const matches = Array.from(rawValue.matchAll(/(?:^|\s)[#＃]([^\s#＃]+)/g));
  const tags = dedupeTagNames(matches.map((match) => match[1] ?? ""));
  const title = normalize(rawValue.replace(/(?:^|\s)[#＃][^\s#＃]+/g, " "));

  return {
    title,
    tags
  };
}

export function serializePlanInput(title: string, tags: TagChip[]) {
  const normalizedTitle = normalize(title);
  const serializedTags = tags.map((tag) => `#${tag.name}`).join(" ");
  return normalize([serializedTags, normalizedTitle].filter(Boolean).join(" "));
}

export function createPlanItem(title: string): PlanItem {
  return {
    id: crypto.randomUUID(),
    title,
    completed: false,
    completedAt: null,
    tags: []
  };
}

export function createPlanItemWithId(id: string, title: string): PlanItem {
  return {
    id,
    title,
    completed: false,
    completedAt: null,
    tags: []
  };
}

export function createPlanSection(section: Omit<PlanSection, "id" | "items">): PlanSection {
  return {
    ...section,
    id: crypto.randomUUID(),
    items: []
  };
}

export function createEmptyDayState(): DayState {
  return {
    planSections: defaultSections.map(createPlanSection),
    progressEntries: [],
    manualActualGroups: [],
    note: ""
  };
}

export function createInitialState(todayKey: string): PersistedState {
  return {
    mode: "day",
    selectedDateKey: todayKey,
    days: {
      [todayKey]: createEmptyDayState()
    },
    weeks: {}
  };
}

export function ensureDay(state: PersistedState, dateKey: string) {
  if (!state.days[dateKey]) {
    state.days[dateKey] = createEmptyDayState();
  }

  state.days[dateKey].planSections = state.days[dateKey].planSections.map((section, index) => ({
    ...section,
    kind: section.kind ?? inferSectionKind(section.title, index),
    items: (section.items ?? []).map((item) => ({
      ...item,
      completed: Boolean(item.completed),
      completedAt: item.completedAt ?? null,
      tags: (item.tags ?? []).map((tag) => ({
        id: tag.id,
        name: tag.name
      }))
    }))
  }));

  state.days[dateKey].progressEntries = (state.days[dateKey].progressEntries ?? []).map((entry) => ({
    ...entry,
    tags: (entry.tags ?? []).map((tag) => ({
      id: tag.id,
      name: tag.name
    }))
  }));

  state.days[dateKey].manualActualGroups = (state.days[dateKey].manualActualGroups ?? []).map((group) => ({
    ...group,
    tags: (group.tags ?? []).map((tag) => ({
      id: tag.id,
      name: tag.name
    }))
  }));

  return state.days[dateKey];
}

export function ensureWeek(state: PersistedState, dateKey: string) {
  const weekKey = getWeekKey(dateKey);
  if (!state.weeks[weekKey]) {
    state.weeks[weekKey] = { review: "" };
  }
  return state.weeks[weekKey];
}

export function getSectionByKind(state: PersistedState, dateKey: string, kind: SectionKind) {
  return ensureDay(state, dateKey).planSections.find((section) => section.kind === kind);
}

export function findPlanOccurrences(state: PersistedState, itemId: string) {
  const matches: Array<{
    dateKey: string;
    sectionId: string;
    sectionKind: SectionKind;
    item: PlanItem;
  }> = [];

  Object.keys(state.days).forEach((dateKey) => {
    const day = ensureDay(state, dateKey);
    day.planSections.forEach((section) => {
      const item = section.items.find((entry) => entry.id === itemId);
      if (item) {
        matches.push({
          dateKey,
          sectionId: section.id,
          sectionKind: section.kind,
          item
        });
      }
    });
  });

  return matches;
}

export function sortPlanItems(section: PlanSection) {
  section.items.sort((left, right) => Number(left.completed) - Number(right.completed));
}

export function buildActualGroups(day: DayState): ActualGroup[] {
  const linked = new Map<string, ActualGroup>();
  const free = new Map<string, ActualGroup>();

  day.progressEntries.forEach((entry) => {
    if (!entry.planItemId) {
      free.set(entry.id, {
        id: entry.id,
        kind: "free",
        title: entry.content,
        tags: entry.tags ?? [],
        updatedAt: entry.updatedAt,
        items: []
      });
      return;
    }

    const groupId = entry.isDerivedTodayPlan && entry.sourceItemId ? entry.sourceItemId : entry.planItemId;
    const itemContent = entry.isDerivedTodayPlan && entry.planItemTitle
      ? [entry.planItemTitle, entry.content.trim()].filter(Boolean).join("\n")
      : entry.content.trim();

    if (!linked.has(groupId)) {
      linked.set(groupId, {
        id: groupId,
        kind: "linked",
        title: entry.sourceTitle ?? entry.content,
        tags: entry.tags ?? [],
        updatedAt: entry.updatedAt,
        items: []
      });
    }

    const group = linked.get(groupId)!;
    if (itemContent) {
      group.items.push({
        id: entry.id,
        content: itemContent,
        structured: Boolean(entry.isDerivedTodayPlan && entry.planItemTitle)
      });
    }
    if (new Date(entry.updatedAt) > new Date(group.updatedAt)) {
      group.updatedAt = entry.updatedAt;
    }
  });

  day.planSections.forEach((section) => {
    section.items.forEach((item) => {
      const groupId = item.isDerivedTodayPlan && item.sourceItemId ? item.sourceItemId : item.id;
      if (!item.completed || !item.completedAt || linked.has(groupId)) {
        return;
      }

      linked.set(groupId, {
        id: groupId,
        kind: "linked",
        title: item.isDerivedTodayPlan ? item.sourceTitle ?? item.title : item.title,
        tags: item.tags ?? [],
        updatedAt: item.completedAt ?? new Date(0).toISOString(),
        items: item.isDerivedTodayPlan ? [{ id: item.id, content: item.title, structured: true }] : []
      });
    });
  });

  return [
    ...Array.from(linked.values()),
    ...Array.from(free.values()),
    ...day.manualActualGroups.map((group) => ({
      id: group.id,
      kind: "manual" as const,
      title: group.title,
      tags: group.tags ?? [],
      updatedAt: group.updatedAt,
      items: [...group.items]
    }))
  ].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export function inferSectionKind(title: string, index: number): SectionKind {
  if (title === "今日计划" || index === 0) return "today";
  if (title === "本周计划" || index === 1) return "week";
  if (title === "长期项目" || index === 2) return "long";
  return "custom";
}

export function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLongDate(dateKey: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(parseDateKey(dateKey));
}

export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).format(date);
}

export function formatDayLabel(dateKey: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(parseDateKey(dateKey));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function minuteToTimeString(value: number) {
  const normalized = Math.max(0, Math.min(1439, value));
  const hour = `${Math.floor(normalized / 60)}`.padStart(2, "0");
  const minute = `${normalized % 60}`.padStart(2, "0");
  return `${hour}:${minute}`;
}

export function timeStringToMinute(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return 0;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return Math.max(0, Math.min(1439, hour * 60 + minute));
}

export function formatMinuteRange(startMinute: number, endMinute: number) {
  return `${minuteToTimeString(startMinute)}-${minuteToTimeString(endMinute)}`;
}

export function getWeekRange(dateKey: string) {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(start.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function getWeekKey(dateKey: string) {
  return formatDateKey(getWeekRange(dateKey).start);
}

export function getWeekDateKeys(dateKey: string) {
  const { start, end } = getWeekRange(dateKey);
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function getMonthDateKeys(dateKey: string) {
  const date = parseDateKey(dateKey);
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}
