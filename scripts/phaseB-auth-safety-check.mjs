const baseUrl = process.env.DAYFOLD_BASE_URL ?? "http://127.0.0.1:3002";
const selectedDateKey = process.env.DAYFOLD_SMOKE_DATE ?? "2099-02-03";
const randomSuffix = Math.random().toString(36).slice(2, 10);
const password = "smoke-pass-123";
const userAEmail = `phaseb-a-${randomSuffix}@dayfold.local`;
const userBEmail = `phaseb-b-${randomSuffix}@dayfold.local`;
const userAIp = `203.0.113.${Math.floor(Math.random() * 80) + 10}`;
const userBIp = `198.51.100.${Math.floor(Math.random() * 80) + 10}`;
const planTitle = `PhaseB隔离计划-${randomSuffix}`;
const userBPlanTitle = `PhaseB待清空计划-${randomSuffix}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchOrExplain(path, options = {}) {
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  try {
    return await fetch(url, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `无法连接到测试版 Dayfold 服务：${baseUrl}`,
        "请先确认你已经在另一个终端启动：",
        "npm run dev:test",
        `底层错误：${message}`
      ].join("\n")
    );
  }
}

function cookieFrom(response) {
  const cookieHeader = response.headers.get("set-cookie");
  assert(cookieHeader, "鉴权成功但没有拿到 session cookie。");
  return cookieHeader.split(";")[0];
}

async function signUp(email, name, ip) {
  const response = await fetchOrExplain("/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      "x-forwarded-for": ip
    },
    body: JSON.stringify({
      mode: "signup",
      email,
      name,
      password
    })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`注册失败: ${response.status} ${body.error ?? ""}`.trim());
  }

  return cookieFrom(response);
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

async function mutate(cookie, payload, origin = baseUrl) {
  return fetchOrExplain("/api/mutate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: origin
    },
    body: JSON.stringify({
      selectedDateKey,
      ...payload
    })
  });
}

function todaySectionFrom(state) {
  const section = state.day.planSections.find((entry) => entry.kind === "today");
  assert(section, "未找到今日计划分组。");
  return section;
}

function findPlanItem(state, title) {
  return state.day.planSections.flatMap((section) => section.items).find((item) => item.title === title);
}

async function createPlanItem(cookie, title) {
  const state = await readState(cookie);
  const section = todaySectionFrom(state);
  const response = await mutate(cookie, {
    action: "create-plan-item",
    sectionId: section.id,
    title
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`创建计划失败: ${response.status} ${body.error ?? ""}`.trim());
  }

  const nextState = await readState(cookie);
  const item = findPlanItem(nextState, title);
  assert(item, `创建计划后没有读到 ${title}。`);
  return item;
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

async function clearAccountData(cookie) {
  const response = await fetchOrExplain("/api/account-data", {
    method: "DELETE",
    headers: {
      Cookie: cookie,
      Origin: baseUrl
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`清空账号数据失败: ${response.status} ${body.error ?? ""}`.trim());
  }
}

async function logout(cookie) {
  const response = await fetchOrExplain("/api/auth/session", {
    method: "DELETE",
    headers: {
      Cookie: cookie,
      Origin: baseUrl
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`退出失败: ${response.status} ${body.error ?? ""}`.trim());
  }
}

async function main() {
  const health = await fetchOrExplain("/api/auth/session");
  assert(health.ok, `/api/auth/session 应可访问，实际状态：${health.status}`);

  const cookieA = await signUp(userAEmail, "Phase B User A", userAIp);
  const itemA = await createPlanItem(cookieA, planTitle);

  const evilResponse = await mutate(
    cookieA,
    {
      action: "delete-plan-item",
      planItemId: itemA.id
    },
    "https://evil.example"
  );
  assert(evilResponse.status === 403, "跨站来源调用写入接口应该被拒绝。");

  let stateA = await readState(cookieA);
  assert(findPlanItem(stateA, planTitle), "跨站请求被拒绝后，用户 A 的计划不应被删除。");

  const backupA = await exportBackup(cookieA);
  assert(backupA.meta?.product === "Dayfold", "导出文件缺少 Dayfold 元信息。");
  assert(
    backupA.data?.planItems?.some((item) => item.title === planTitle),
    "导出文件中缺少用户 A 的计划。"
  );

  const cookieB = await signUp(userBEmail, "Phase B User B", userBIp);
  const stateB = await readState(cookieB);
  assert(!findPlanItem(stateB, planTitle), "用户 B 不应该看到用户 A 的计划。");

  await createPlanItem(cookieB, userBPlanTitle);
  await clearAccountData(cookieB);
  const clearedB = await readState(cookieB);
  assert(!findPlanItem(clearedB, userBPlanTitle), "清空当前账号数据后，用户 B 的计划仍然存在。");
  assert(
    clearedB.day.planSections.every((section) => section.items.length === 0),
    "清空当前账号数据后，新 day 应该只剩默认空分组。"
  );

  stateA = await readState(cookieA);
  assert(findPlanItem(stateA, planTitle), "清空用户 B 后，不应该影响用户 A 的数据。");

  await logout(cookieA);
  const afterLogout = await fetchOrExplain(`/api/state?date=${selectedDateKey}`, {
    headers: {
      Cookie: cookieA
    }
  });
  assert(afterLogout.status === 401, "退出后继续读取状态应该返回 401。");

  console.log("Phase B.3 auth and safety check passed.");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`User A: ${userAEmail}`);
  console.log(`User B: ${userBEmail}`);
}

main().catch((error) => {
  console.error("Phase B.3 auth and safety check failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
