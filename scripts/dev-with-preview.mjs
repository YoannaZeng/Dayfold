import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const host = process.env.DAYFOLD_DEV_HOST ?? "127.0.0.1";
const port = process.env.DAYFOLD_DEV_PORT ?? "3001";
const previewUrl = process.env.DAYFOLD_PREVIEW_URL ?? `http://${host}:${port}`;
const shouldOpenPreview = !["0", "false", "no"].includes((process.env.DAYFOLD_AUTO_OPEN ?? "1").toLowerCase());
const nextBin = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");

let isStopping = false;

const child = spawn(nextBin, ["dev", "--hostname", host, "--port", port], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

child.once("error", (error) => {
  console.error(`Failed to start Next.js dev server: ${error.message}`);
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (isStopping) {
      return;
    }

    isStopping = true;
    child.kill(signal);
  });
}

if (shouldOpenPreview) {
  void waitForPreviewAndOpen();
}

async function waitForPreviewAndOpen() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (isStopping || child.exitCode !== null) {
      return;
    }

    if (await isPreviewReachable()) {
      console.log(`Opening preview: ${previewUrl}`);
      openPreview(previewUrl);
      return;
    }

    await delay(1000);
  }

  console.warn(`Preview did not become reachable in time: ${previewUrl}`);
}

async function isPreviewReachable() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  try {
    await fetch(previewUrl, {
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal
    });

    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function openPreview(url) {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args =
    process.platform === "darwin"
      ? [url]
      : process.platform === "win32"
        ? ["/c", "start", "", url]
        : [url];

  const opener = spawn(command, args, {
    detached: true,
    stdio: "ignore"
  });

  opener.unref();
}
