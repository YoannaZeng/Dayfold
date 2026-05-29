import { spawnSync } from "node:child_process";

const productionEnv = {
  ...process.env,
  NODE_ENV: "production"
};

const steps = [
  {
    label: "生产环境变量预检",
    command: "npm",
    args: ["run", "verify:deploy-env"]
  },
  {
    label: "生成 Prisma Client",
    command: "npm",
    args: ["run", "prisma:generate"]
  },
  {
    label: "校验 Prisma schema",
    command: "prisma",
    args: ["validate", "--schema", "prisma/schema.prisma"]
  },
  {
    label: "Next.js 生产构建",
    command: "npm",
    args: ["run", "build"]
  }
];

function runStep({ label, command, args }) {
  console.log(`\n==> ${label}`);

  const result = spawnSync(command, args, {
    env: productionEnv,
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`${label} 启动失败：${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${label} 未通过。`);
    process.exit(result.status ?? 1);
  }
}

for (const step of steps) {
  runStep(step);
}

console.log("\nProduction preflight passed.");
