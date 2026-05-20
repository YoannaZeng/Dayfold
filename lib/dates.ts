export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function fromDateKey(dateKey: string) {
  return startOfDay(new Date(`${dateKey}T12:00:00`));
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekStart(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  return next;
}

export function getWeekDateKeys(date: Date) {
  const start = getWeekStart(date);
  const values: string[] = [];
  const cursor = new Date(start);

  for (let i = 0; i < 7; i += 1) {
    values.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return values;
}

export function getMonthStart(date: Date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function getMonthDateKeys(date: Date) {
  const start = getMonthStart(date);
  const end = startOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  const values: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    values.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return values;
}
