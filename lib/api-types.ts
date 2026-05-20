import type { ActualGroup, DayState, TagChip, WeekTagSummary } from "@/lib/dayfold";

export type WeekDaySnapshot = {
  dateKey: string;
  note: string;
  actualGroups: ActualGroup[];
};

export type DayfoldSnapshot = {
  selectedDateKey: string;
  day: DayState;
  dayActualGroups: ActualGroup[];
  weekReview: string;
  weekDays: WeekDaySnapshot[];
  availableTags: TagChip[];
  weekTagSummaries: WeekTagSummary[];
};
