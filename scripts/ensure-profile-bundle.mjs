#!/usr/bin/env node
/**
 * 装进 DSH profile 时补三笔（#154 / #155 / #157）：
 *   1. dsh.profile.bundles
 *   2. 用户层 cordis.patch.yml 的本体 insert
 *   3. pnpm-workspace.yaml 的 allowBuilds（pnpm 11/12 会拦 postinstall）
 *
 * `pnpm add` / `dsh plugin add` 都不会自己写这些；插件市场会写，已有则跳过。
 * 在插件仓库里直接 `pnpm install`（不是装进 profile）则整段跳过。
 *
 * 设计原则：**失败不吵**。这是在别人机器上跑的安装钩子，任何异常都只打印一行
 * 警告就退出 0 —— 补配置失败不该让 `pnpm add` 整体失败。
 */
import fs from "node:fs";
import path from "node:path";
import {
  PURGE_NAME as NAME,
  ensureAllProfileInstall,
  ensureProfileBodyInsert,
  ensureProfileBundles,
  ensurePnpmAllowBuild,
  profileHasPurgeBodyInsert,
} from "../lib/profile-insert.js";

export { profileHasPurgeBodyInsert };

function readJson(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

/** DSH profile 的 package.json 长这样：name 以 dsh-profile- 开头，或带 dsh.profile.bundles。 */
function isProfilePkg(pkg) {
  if (!pkg || typeof pkg !== "object") return false;
  if (typeof pkg.name === "string" && pkg.name.startsWith("dsh-profile-")) return true;
  return Array.isArray(pkg.dsh?.profile?.bundles);
}

/** 从安装上下文往上找 profile 根目录。 */
function findProfileDir() {
  const seeds = [process.env.INIT_CWD, process.env.npm_config_local_prefix, process.cwd()].filter(Boolean);
  for (const seed of seeds) {
    let dir = path.resolve(seed);
    for (let i = 0; i < 8; i += 1) {
      if (isProfilePkg(readJson(path.join(dir, "package.json")))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/** DSH_HOME：环境变量优先，否则 ~/.dsh。 */
function dshHomeOf() {
  const fromEnv = String(process.env.DSH_HOME || "").trim();
  if (fromEnv) return fromEnv;
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return home ? path.join(home, ".dsh") : "";
}

function main() {
  const profileDir = findProfileDir();
  const dshHome = dshHomeOf();

  // 情形 A：装进了某个 profile —— 直接补这个 profile。
  if (profileDir) {
    const out = { profile: profileDir };
    try { out.bundles = ensureProfileBundles(profileDir); } catch (e) { out.bundles = { ok: false, error: String(e) }; }
    try { out.insert = ensureProfileBodyInsert(profileDir); } catch (e) { out.insert = { ok: false, error: String(e) }; }
    try { out.pnpm = ensurePnpmAllowBuild(profileDir); } catch (e) { out.pnpm = { ok: false, error: String(e) }; }
    const changed = [out.bundles?.wrote, out.insert?.wrote, out.pnpm?.wrote].filter(Boolean).length;
    console.log(`[dsh-purge] profile 已就绪：${profileDir}（补了 ${changed} 处）`);
    return;
  }

  // 情形 B：在插件仓库里自己 pnpm install —— 什么都不做。
  const here = readJson(path.join(process.cwd(), "package.json"));
  if (here?.name === NAME) {
    console.log("[dsh-purge] 在插件仓库内安装，跳过 profile 补写");
    return;
  }

  // 情形 C：找不到 profile，但有 DSH_HOME —— 扫一遍所有已装过本插件的 profile（#167：升级后补回）。
  if (dshHome) {
    const results = ensureAllProfileInstall(dshHome);
    if (results.length) {
      const changed = results.reduce((n, r) => (
        n + [r.bundles?.wrote, r.insert?.wrote, r.pnpm?.wrote].filter(Boolean).length
      ), 0);
      console.log(`[dsh-purge] 扫描 ${dshHome}：${results.length} 个 profile，补了 ${changed} 处`);
      return;
    }
  }

  console.log("[dsh-purge] 未找到 DSH profile，跳过（不是装进 profile 的场景）");
}

try {
  main();
} catch (error) {
  console.warn(`[dsh-purge] postinstall 跳过：${error && error.message ? error.message : error}`);
}
process.exit(0);
