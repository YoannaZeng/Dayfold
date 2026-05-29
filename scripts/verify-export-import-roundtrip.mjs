const baseUrl = process.env.DAYFOLD_BASE_URL ?? "http://127.0.0.1:3001";
const selectedDateKey = process.env.DAYFOLD_SMOKE_DATE ?? "2099-01-05";
const randomSuffix = Math.random().toString(36).slice(2, 8);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchOrExplain(pathname, options = {}) {
  try {
    return await fetch(`${baseUrl}${pathname}`, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(
      [
        `无法连接到本地 Dayfold 服务：${baseUrl}`,
        "请先确认本地预览已经启动：",
        "npm run dev",
        `底层错误：${message}`
      ].join("\n")
    );
  }
}

function getSessionCookie(response) {
  const cookieHeader = response.headers.get("set-cookie");

  if (!cookieHeader) {
    throw new Error("鉴权成功但没有拿到 session cookie。");
  }

  return cookieHeader.split(";")[0];
}

async function signUpUser(label) {
  const response = await fetchOrExplain("/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      mode: "signup",
      email: `roundtrip-${label}-${randomSuffix}@dayfold.local`,
      name: `Roundtrip ${label}`,
      password: "roundtrip-pass-123"
    })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`注册失败: ${response.status} ${body.error ?? ""}`.trim());
  }

  return getSessionCookie(response);
}

async function readState(cookie, dateKey = selectedDateKey) {
  const response = await fetchOrExplain(`/api/state?date=${dateKey}`, {
    cache: "no-store",
    headers: {
      Cookie: cookie
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`读取状态失败: ${response.status} ${body.error ?? ""}`.trim());
  }

  return response.json();
}

async function readTrash(cookie) {
  const response = await fetchOrExplain("/api/trash", {
    cache: "no-store",
    headers: {
      Cookie: cookie
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`读取回收站失败: ${response.status} ${body.error ?? ""}`.trim());
  }

  return response.json();
}

async function mutate(cookie, payload) {
  const response = await fetchOrExplain("/api/mutate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
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

async function exportBackup(cookie) {
  const response = await fetchOrExplain("/api/export", {
    method: "GET",
    headers: {
      Cookie: cookie
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`导出失败: ${response.status} ${body.error ?? ""}`.trim());
  }

  return response.json();
}

async function importBackup(cookie, payload) {
  const response = await fetchOrExplain("/api/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`导入失败: ${response.status} ${body.error ?? ""}`.trim());
  }

  return response.json();
}

function sortById(values) {
  return [...values].sort((left, right) => left.id.localeCompare(right.id));
}

function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function stripIdLikeFields(value) {
  if (Array.isArray(value)) {
    return value.map(stripIdLikeFields);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "id" && !key.endsWith("Id") && !key.endsWith("Ids"))
      .map(([key, entryValue]) => [key, stripIdLikeFields(entryValue)])
  );
}

function findTaggedFreeProgress(state, content) {
  return state.day.progressEntries.find((entry) => entry.planItemId === null && entry.content === content);
}

function findManualGroup(state, title) {
  return state.day.manualActualGroups.find((group) => group.title === title);
}

function findTodaySection(state) {
  return state.day.planSections.find((section) => section.kind === "today");
}

async function runCheck(label, check) {
  try {
    await check();
    console.log(`PASS ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${label}`);
    console.error(message);
    process.exit(1);
  }
}

async function main() {
  const sourceCookie = await signUpUser("source");
  const targetCookie = await signUpUser("target");
  const legacyCookie = await signUpUser("legacy");

  const sourceState = await readState(sourceCookie);
  const todaySection = findTodaySection(sourceState);
  assert(todaySection, "未找到今日计划分组。");

  const trashPlanTitle = `Roundtrip 计划 ${randomSuffix}`;
  const freeProgressTitle = `Roundtrip 自由进展 ${randomSuffix}`;
  const manualGroupTitle = `Roundtrip 手动实际 ${randomSuffix}`;
  const manualItemContent = `Roundtrip 内容 ${randomSuffix}`;

  await mutate(sourceCookie, {
    action: "create-plan-item",
    sectionId: todaySection.id,
    title: trashPlanTitle
  });

  let nextState = await readState(sourceCookie);
  const trashPlanItem = nextState.day.planSections.flatMap((section) => section.items).find((item) => item.title === trashPlanTitle);
  assert(trashPlanItem, "没有找到用于回收站验证的计划项。");

  await mutate(sourceCookie, {
    action: "create-progress-entry",
    planItemId: null,
    content: freeProgressTitle,
    startMinute: 540,
    endMinute: 600
  });

  nextState = await readState(sourceCookie);
  const freeProgressEntry = nextState.day.progressEntries.find(
    (entry) => entry.planItemId === null && entry.content === freeProgressTitle
  );
  assert(freeProgressEntry, "没有找到自由进展条目。");

  await mutate(sourceCookie, {
    action: "update-actual-group-tags",
    groupKind: "free",
    groupId: freeProgressEntry.id,
    tags: ["focus", "ship"]
  });

  await mutate(sourceCookie, {
    action: "create-manual-actual-group",
    title: manualGroupTitle,
    content: manualItemContent,
    tags: ["manual", "review"]
  });

  await mutate(sourceCookie, {
    action: "delete-plan-item",
    planItemId: trashPlanItem.id
  });

  const sourceExport = await exportBackup(sourceCookie);
  const sourceTrashEntry = sourceExport.data.trashEntries.find(
    (entry) => entry.kind === "plan-item" && entry.title === trashPlanTitle
  );

  assert(sourceExport.meta.exportVersion === 5, "导出版本应该升级到 5。");
  assert(sourceExport.data.progressEntryTags.length > 0, "v5 备份里应该包含 ProgressEntryTag。");
  assert(sourceExport.data.manualActualGroupTags.length > 0, "v5 备份里应该包含 ManualActualGroupTag。");
  assert(sourceExport.data.trashEntries.length > 0, "v5 备份里应该包含 TrashEntry。");
  assert(sourceTrashEntry, "源备份里应该包含刚删除的计划项回收站条目。");

  await importBackup(targetCookie, sourceExport);

  const targetState = await readState(targetCookie);
  const targetExport = await exportBackup(targetCookie);
  const targetTrashEntry = targetExport.data.trashEntries.find(
    (entry) => entry.kind === "plan-item" && entry.title === trashPlanTitle
  );

  await runCheck("free progress tags round-trip", async () => {
    const importedFreeProgress = findTaggedFreeProgress(targetState, freeProgressTitle);

    assert(importedFreeProgress, "导入后没有找到自由进展条目。");
    assert(
      JSON.stringify(sortStrings(importedFreeProgress.tags)) === JSON.stringify(["focus", "ship"]),
      "导入后的自由进展标签不正确。"
    );
    assert(
      targetExport.data.progressEntryTags.length === sourceExport.data.progressEntryTags.length,
      "ProgressEntryTag 导入后数量不一致。"
    );
  });

  await runCheck("manual actual group tags round-trip", async () => {
    const importedManualGroup = findManualGroup(targetState, manualGroupTitle);

    assert(importedManualGroup, "导入后没有找到手动实际分组。");
    assert(
      JSON.stringify(sortStrings(importedManualGroup.tags)) === JSON.stringify(["manual", "review"]),
      "导入后的手动实际分组标签不正确。"
    );
    assert(
      targetExport.data.manualActualGroupTags.length === sourceExport.data.manualActualGroupTags.length,
      "ManualActualGroupTag 导入后数量不一致。"
    );
  });

  await runCheck("trash entries round-trip", async () => {
    assert(targetTrashEntry, "导入后导出的备份里缺少预期回收站条目。");
    assert(
      JSON.stringify(stripIdLikeFields(targetTrashEntry)) === JSON.stringify(stripIdLikeFields(sourceTrashEntry)),
      "TrashEntry 在导入导出后没有保持语义一致。"
    );
    assert(
      targetExport.data.trashEntries.length === sourceExport.data.trashEntries.length,
      "TrashEntry 导入后数量不一致。"
    );

    const trashState = await readTrash(targetCookie);
    assert(
      trashState.entries.some((entry) => entry.title === trashPlanTitle),
      "导入后回收站里缺少预期条目。"
    );
  });

  const v4Payload = JSON.parse(JSON.stringify(sourceExport));
  v4Payload.meta.exportVersion = 4;
  delete v4Payload.data.progressEntryTags;
  delete v4Payload.data.manualActualGroupTags;
  delete v4Payload.data.trashEntries;

  await importBackup(legacyCookie, v4Payload);

  await runCheck("v4 backups still import without inference", async () => {
    const legacyExport = await exportBackup(legacyCookie);
    assert(legacyExport.data.progressEntryTags.length === 0, "旧备份导入后不应该推断 ProgressEntryTag。");
    assert(legacyExport.data.manualActualGroupTags.length === 0, "旧备份导入后不应该推断 ManualActualGroupTag。");
    assert(legacyExport.data.trashEntries.length === 0, "旧备份导入后不应该推断 TrashEntry。");

    const legacyState = await readState(legacyCookie);
    const importedFreeProgress = legacyState.day.progressEntries.find(
      (entry) => entry.planItemId === null && entry.content === freeProgressTitle
    );
    assert(importedFreeProgress, "旧备份导入后，自由进展主体数据应该仍然存在。");
    assert(importedFreeProgress.tags.length === 0, "旧备份导入后，自由进展标签应该保持为空。");

    const importedManualGroup = legacyState.day.manualActualGroups.find((group) => group.title === manualGroupTitle);
    assert(importedManualGroup, "旧备份导入后，手动实际分组主体数据应该仍然存在。");
    assert(importedManualGroup.tags.length === 0, "旧备份导入后，手动实际分组标签应该保持为空。");
  });

  console.log("Export/import round-trip verification passed.");
}

await main();
