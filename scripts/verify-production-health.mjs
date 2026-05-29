const timeoutMs = Number.parseInt(process.env.DAYFOLD_HEALTH_TIMEOUT_MS ?? "10000", 10);
const explicitHealthUrl = process.env.DAYFOLD_HEALTH_URL?.trim();
const publicOrigin = process.env.DAYFOLD_PUBLIC_ORIGIN?.trim();

function fail(message) {
  console.error("Production health check failed.");
  console.error(message);
  process.exit(1);
}

function getHealthUrl() {
  const rawUrl = explicitHealthUrl || publicOrigin;

  if (!rawUrl) {
    fail("缺少 DAYFOLD_PUBLIC_ORIGIN，或显式设置 DAYFOLD_HEALTH_URL。");
  }

  try {
    const parsed = new URL(rawUrl);

    if (!explicitHealthUrl || (parsed.pathname === "/" && !parsed.search && !parsed.hash)) {
      parsed.pathname = "/api/health";
      parsed.search = "";
      parsed.hash = "";
    }

    return parsed;
  } catch {
    fail("DAYFOLD_PUBLIC_ORIGIN / DAYFOLD_HEALTH_URL 不是有效 URL。");
  }
}

async function readResponseText(response) {
  const text = await response.text();

  if (text.length <= 500) {
    return text;
  }

  return `${text.slice(0, 500)}...`;
}

const healthUrl = getHealthUrl();
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  fail("DAYFOLD_HEALTH_TIMEOUT_MS 必须是正整数毫秒数。");
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(healthUrl, {
    headers: {
      "Cache-Control": "no-store"
    },
    signal: controller.signal
  });

  const responseText = await readResponseText(response);

  if (!response.ok) {
    fail(`/api/health 返回异常状态：${response.status}\n${responseText}`);
  }

  let body;
  try {
    body = JSON.parse(responseText);
  } catch {
    fail(`/api/health 没有返回 JSON：\n${responseText}`);
  }

  if (body.ok !== true || body.database !== "reachable") {
    fail(`/api/health 返回异常内容：\n${JSON.stringify(body, null, 2)}`);
  }

  console.log("Production health check passed.");
  console.log(`Health URL: ${healthUrl.toString()}`);
  console.log(`Database: ${body.database}`);
  if (body.checkedAt) {
    console.log(`Checked at: ${body.checkedAt}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(`无法访问 ${healthUrl.toString()}：${message}`);
} finally {
  clearTimeout(timeout);
}
