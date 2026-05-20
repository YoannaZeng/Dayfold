const baseUrl = process.env.DAYFOLD_BASE_URL ?? "http://127.0.0.1:3001";
const selectedDateKey = process.env.DAYFOLD_SMOKE_DATE ?? "2099-01-05";
const randomSuffix = Math.random().toString(36).slice(2, 8);
const planTitle = `Smoke计划-${randomSuffix}`;
const progressContent = `推进记录-${randomSuffix}`;
const freeProgressTitle = `自由进展项目-${randomSuffix}`;
const progressStartMinute = 600;
const progressEndMinute = 720;
const manualTitle = `Smoke手动项目-${randomSuffix}`;
const manualContent = `手动补记-${randomSuffix}`;
const dayNote = `Smoke日笔记-${randomSuffix}`;
const weekReview = `Smoke周复盘-${randomSuffix}`;
const authEmail = `smoke-${randomSuffix}@dayfold.local`;
const authName = "Smoke User";
const authPassword = "smoke-pass-123";
let sessionCookie = "";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function fetchOrExplain(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `无法连接到本地 Dayfold 服务：${baseUrl}`,
        "请先确认你已经在另一个终端启动：",
        "npm run dev -- --hostname 127.0.0.1 --port 3001",
        `底层错误：${message}`
      ].join("\n")
    );
  }
}

async function ensureServerReachable() {
  const response = await fetchOrExplain(`${baseUrl}/api/auth/session`, {
    method: "GET"
  });

  assert(response.ok, `本地服务已启动，但 /api/auth/session 返回了异常状态：${response.status}`);
}

async function rawReadState(dateKey = selectedDateKey, cookie = sessionCookie) {
  return fetchOrExplain(`${baseUrl}/api/state?date=${dateKey}`, {
    cache: "no-store",
    headers: cookie
      ? {
          Cookie: cookie
        }
      : undefined
  });
}

async function readState(dateKey = selectedDateKey) {
  const response = await rawReadState(dateKey);

  if (!response.ok) {
    throw new Error(`读取状态失败: ${response.status}`);
  }

  return response.json();
}

async function mutate(payload) {
  const response = await fetchOrExplain(`${baseUrl}/api/mutate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionCookie ? { Cookie: sessionCookie } : {})
    },
    body: JSON.stringify({
      selectedDateKey,
      ...payload
    })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`写入失败: ${response.status} ${body.error ?? ""}`.trim());
  }
}

async function authenticate() {
  const response = await fetchOrExplain(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      mode: "signup",
      email: authEmail,
      name: authName,
      password: authPassword
    })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`鉴权失败: ${response.status} ${body.error ?? ""}`.trim());
  }

  const cookieHeader = response.headers.get("set-cookie");
  if (!cookieHeader) {
    throw new Error("鉴权成功但没有拿到 session cookie。");
  }

  sessionCookie = cookieHeader.split(";")[0];
}

function findTodaySection(state) {
  return state.day.planSections.find((section) => section.kind === "today");
}

function findWeekSection(state) {
  return state.day.planSections.find((section) => section.kind === "week");
}

function findPlanItem(state, title) {
  return state.day.planSections.flatMap((section) => section.items).find((item) => item.title === title);
}

function findManualGroup(state, title) {
  return state.day.manualActualGroups.find((group) => group.title === title);
}

function findActualGroup(state, title) {
  return state.dayActualGroups.find((group) => group.title === title);
}

async function main() {
  await ensureServerReachable();

  const unauthenticated = await rawReadState();
  assert(unauthenticated.status === 401, "未登录读取 /api/state 时应该返回 401。");

  await authenticate();
  const initialState = await readState();
  const todaySection = findTodaySection(initialState);
  assert(todaySection, "未找到今日计划分组。");

  await mutate({
    action: "create-plan-item",
    sectionId: todaySection.id,
    title: planTitle
  });

  let state = await readState();
  let planItem = findPlanItem(state, planTitle);
  assert(planItem, "创建计划项后未读到该计划。");

  await mutate({
    action: "copy-plan-item-tomorrow",
    planItemId: planItem.id
  });

  await mutate({
    action: "copy-plan-item-next-week",
    planItemId: planItem.id
  });

  const tomorrowState = await readState(shiftDateKey(selectedDateKey, 1));
  assert(findPlanItem(tomorrowState, planTitle), "复制到明日后，次日没有出现该计划。");

  const nextWeekState = await readState(shiftDateKey(selectedDateKey, 7));
  const nextWeekSection = findWeekSection(nextWeekState);
  assert(nextWeekSection, "未找到下一周的本周计划分组。");
  assert(findPlanItem(nextWeekState, planTitle), "复制到下周后，下周计划里没有出现该项目。");

  await mutate({
    action: "create-progress-entry",
    planItemId: planItem.id,
    content: progressContent,
    startMinute: progressStartMinute,
    endMinute: progressEndMinute
  });

  state = await readState();
  assert(
    state.day.progressEntries.some(
      (entry) =>
        entry.planItemId === planItem.id &&
        entry.content === progressContent &&
        entry.startMinute === progressStartMinute &&
        entry.endMinute === progressEndMinute
    ),
    "记进展后，今日进展中缺少对应时间段记录。"
  );
  let linkedActualGroup = findActualGroup(state, planTitle);
  assert(linkedActualGroup, "记进展后未出现在今日实际中。");
  assert(
    linkedActualGroup.items.some((item) => item.content === progressContent),
    "记进展后今日实际中缺少对应进展。"
  );

  await mutate({
    action: "create-progress-entry",
    planItemId: planItem.id,
    content: "",
    startMinute: 730,
    endMinute: 760
  });

  state = await readState();
  linkedActualGroup = findActualGroup(state, planTitle);
  assert(linkedActualGroup, "只记录时间和项目后，今日实际里应该有对应项目。");
  assert(
    !linkedActualGroup.items.some((item) => item.content === ""),
    "只记录时间和项目时，今日实际不应该生成空进展条目。"
  );

  await mutate({
    action: "create-progress-entry",
    planItemId: null,
    content: freeProgressTitle,
    startMinute: 780,
    endMinute: 820
  });

  state = await readState();
  const freeActualGroup = findActualGroup(state, freeProgressTitle);
  assert(freeActualGroup?.kind === "free", "未关联项目的今日进展应该作为项目级进入今日实际。");
  assert(freeActualGroup.items.length === 0, "未关联项目的今日进展不应该再生成下级进展条目。");

  await mutate({
    action: "toggle-plan-item",
    planItemId: planItem.id
  });

  state = await readState();
  planItem = findPlanItem(state, planTitle);
  assert(planItem?.completed, "勾选完成后计划项没有变为完成状态。");
  assert(
    !state.day.progressEntries.some((entry) => entry.sourceTitle === planTitle && entry.content === "完成"),
    "勾选完成后不应该自动生成“完成”进展。"
  );
  linkedActualGroup = findActualGroup(state, planTitle);
  assert(linkedActualGroup, "勾选完成后，今日实际里应该至少出现这个项目。");

  await mutate({
    action: "create-manual-actual-group",
    title: manualTitle,
    content: manualContent
  });

  state = await readState();
  const manualGroup = findManualGroup(state, manualTitle);
  assert(manualGroup, "手动实际分组创建失败。");
  assert(manualGroup.items.some((item) => item.content === manualContent), "手动实际内容创建失败。");

  await mutate({
    action: "save-day-note",
    content: dayNote
  });

  await mutate({
    action: "save-week-review",
    content: weekReview
  });

  state = await readState();
  assert(state.day.note === dayNote, "日笔记保存失败。");
  assert(state.weekReview === weekReview, "周复盘保存失败。");

  await mutate({
    action: "delete-manual-actual-group",
    groupId: manualGroup.id
  });

  await mutate({
    action: "delete-plan-item",
    planItemId: planItem.id
  });

  state = await readState();
  assert(!findPlanItem(state, planTitle), "删除计划项后该计划仍然存在。");
  linkedActualGroup = findActualGroup(state, planTitle);
  assert(!linkedActualGroup, "删除计划项后关联的今日实际仍然存在。");
  assert(
    !state.day.progressEntries.some((entry) => entry.sourceTitle === planTitle && entry.content === progressContent),
    "删除计划项后，手动进展仍然存在。"
  );
  assert(
    !state.day.progressEntries.some((entry) => entry.sourceTitle === planTitle && entry.content === "完成"),
    "删除计划项后，不应残留自动完成记录。"
  );

  console.log("Phase 2.4 smoke check passed.");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Date: ${selectedDateKey}`);
}

main().catch((error) => {
  console.error("Phase 2.4 smoke check failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
