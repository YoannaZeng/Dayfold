import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const removableEntries = [".next", ".next-test", "tsconfig.tsbuildinfo"];
const dynamicEntries = readdirSync(projectRoot).filter((entry) => entry.startsWith(".next-stale-"));
const targets = [...removableEntries, ...dynamicEntries];

let removedCount = 0;

for (const entry of targets) {
  const targetPath = path.join(projectRoot, entry);

  if (!existsSync(targetPath)) {
    continue;
  }

  rmSync(targetPath, {
    force: true,
    recursive: true
  });

  removedCount += 1;
  console.log(`Removed ${entry}`);
}

if (removedCount === 0) {
  console.log("No cached preview artifacts needed cleanup.");
}
