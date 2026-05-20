const baseUrl = process.env.DAYFOLD_BASE_URL ?? "http://127.0.0.1:3001";
const selectedDateKey = process.env.DAYFOLD_SMOKE_DATE ?? "2099-01-05";

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

await runCheck("主页可访问", async () => {
  const response = await fetchOrExplain("/");

  assert(response.ok, `主页返回异常状态：${response.status}`);

  const html = await response.text();
  assert(html.includes("Dayfold"), "主页已返回，但页面内容里没有看到 Dayfold 标识。");
});

await runCheck("健康检查正常", async () => {
  const response = await fetchOrExplain("/api/health", {
    headers: {
      "Cache-Control": "no-store"
    }
  });

  assert(response.ok, `/api/health 返回异常状态：${response.status}`);

  const body = await response.json();
  assert(body.ok === true, "/api/health 已返回，但 ok 不是 true。");
  assert(body.database === "reachable", "/api/health 已返回，但数据库没有处于 reachable 状态。");
});

await runCheck("会话接口正常", async () => {
  const response = await fetchOrExplain("/api/auth/session", {
    headers: {
      "Cache-Control": "no-store"
    }
  });

  assert(response.ok, `/api/auth/session 返回异常状态：${response.status}`);

  const body = await response.json();
  assert(Object.prototype.hasOwnProperty.call(body, "user"), "/api/auth/session 响应里缺少 user 字段。");
});

await runCheck("状态接口未登录保护正常", async () => {
  const response = await fetchOrExplain(`/api/state?date=${selectedDateKey}`, {
    headers: {
      "Cache-Control": "no-store"
    }
  });

  assert(
    response.status === 401 || response.ok,
    `/api/state 返回了不符合预期的状态：${response.status}。`
  );
});

console.log("Quick smoke check passed.");
