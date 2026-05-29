const required = ["DATABASE_URL", "DAYFOLD_SESSION_SECRET", "DAYFOLD_PUBLIC_ORIGIN"];
const missing = required.filter((key) => !process.env[key]?.trim());
const errors = [];

if (missing.length) {
  errors.push(`缺少生产环境变量：${missing.join(", ")}`);
}

const databaseUrl = process.env.DATABASE_URL ?? "";
if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
  errors.push("DATABASE_URL 必须是 PostgreSQL 连接串。");
}

if (databaseUrl && /^postgres(ql)?:\/\//.test(databaseUrl)) {
  try {
    const parsed = new URL(databaseUrl);

    if (process.env.NODE_ENV === "production") {
      const hostname = parsed.hostname.toLowerCase();
      const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
      const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
      const localDatabaseNames = new Set(["dayfold_v2", "dayfold_test"]);

      if (localHosts.has(hostname)) {
        errors.push("生产环境 DATABASE_URL 不能指向本机数据库。");
      }

      if (localDatabaseNames.has(databaseName)) {
        errors.push("生产环境 DATABASE_URL 不能指向本地开发/测试数据库。");
      }
    }
  } catch {
    errors.push("DATABASE_URL 不是有效 URL。");
  }
}

const sessionSecret = process.env.DAYFOLD_SESSION_SECRET ?? "";
if (sessionSecret) {
  if (sessionSecret === "replace-with-a-long-random-secret-before-deploy" || sessionSecret === "dayfold-dev-secret-change-me") {
    errors.push("DAYFOLD_SESSION_SECRET 不能使用示例或开发默认值。");
  }

  if (sessionSecret.length < 32) {
    errors.push("DAYFOLD_SESSION_SECRET 至少建议 32 个字符。");
  }
}

const publicOrigin = process.env.DAYFOLD_PUBLIC_ORIGIN ?? "";
if (publicOrigin) {
  try {
    const parsed = new URL(publicOrigin);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      errors.push("DAYFOLD_PUBLIC_ORIGIN 必须以 http:// 或 https:// 开头。");
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      errors.push("DAYFOLD_PUBLIC_ORIGIN 只填写域名来源，不要带路径、参数或 #。");
    }
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      errors.push("生产环境 DAYFOLD_PUBLIC_ORIGIN 应使用 https://。");
    }
    if (process.env.NODE_ENV === "production") {
      const hostname = parsed.hostname.toLowerCase();
      const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

      if (localHosts.has(hostname)) {
        errors.push("生产环境 DAYFOLD_PUBLIC_ORIGIN 不能指向本地域名。");
      }
    }
  } catch {
    errors.push("DAYFOLD_PUBLIC_ORIGIN 不是有效 URL。");
  }
}

if (process.env.NODE_ENV === "production" && process.env.DAYFOLD_CLAIM_LEGACY_DEMO_USER === "true") {
  errors.push("生产环境不能启用 DAYFOLD_CLAIM_LEGACY_DEMO_USER。");
}

if (errors.length) {
  console.error("Deployment env check failed.");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Deployment env check passed.");
console.log(`Public origin: ${publicOrigin}`);
