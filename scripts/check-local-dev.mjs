import { existsSync, lstatSync, readFileSync, readlinkSync, rmSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const nodeModulesPath = path.join(projectRoot, "node_modules");
const tsBuildInfoPath = path.join(projectRoot, "tsconfig.tsbuildinfo");

if (!existsSync(nodeModulesPath)) {
  console.error("Missing ./node_modules in app-v2. Run npm install inside app-v2 before starting local preview.");
  process.exit(1);
}

const nodeModulesStat = lstatSync(nodeModulesPath);

if (nodeModulesStat.isSymbolicLink()) {
  const linkedTarget = readlinkSync(nodeModulesPath);

  console.error(
    `app-v2/node_modules is a symlink to ${linkedTarget}. Shared dependencies make Next.js cache and hot reload unstable here. Replace it with a local install before running preview.`
  );
  process.exit(1);
}

if (existsSync(tsBuildInfoPath)) {
  const tsBuildInfo = readFileSync(tsBuildInfoPath, "utf8");

  if (tsBuildInfo.includes("../app-v1/node_modules")) {
    rmSync(tsBuildInfoPath, { force: true });
    console.log("Removed stale tsconfig.tsbuildinfo that still pointed at app-v1 dependencies.");
  }
}
