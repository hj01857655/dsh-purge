/**
 * 用户层 profile/cordis.patch.yml 的本体 insert（#154 / #159）。
 *
 * 包内 overlay 只改已入队行的 inject/config，不能再 insert 一次（Hub 已入队会
 * already queued）。postinstall 和演练台子行都走这里：行不存在就写一条。
 *
 * 与上游实现的差异：insert 块不硬编码。本包的 cordis.patch.yml 带 4 个子行
 * （dsh-purge + redteam + store + ui）和 20 项 config，写死一份精简模板会让
 * 用户装完丢了 autoRetry / postPrompt / 演练台那三行。所以优先从包内
 * cordis.patch.yml 抠出真实块，取不到才用 FALLBACK_INSERT_BLOCK。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PURGE_NAME = "dsh-purge";

/** 包根目录（本文件在 lib/ 下）。 */
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 兜底模板：只在读不到包内 cordis.patch.yml 时使用。 */
export const FALLBACK_INSERT_BLOCK = [
  "- insert:",
  "    - id: dsh-purge",
  "      name: dsh-purge",
  "      inject: [systemPrompt, tools]",
  "      config:",
  "        enabled: true",
  "        stripMnemon: true",
  "        capabilityProtocol: true",
  "        hooksDenyBypass: true",
  "",
].join("\n");

/**
 * 从一份 cordis.patch.yml 文本里抠出 `- insert:` 开头的整块。
 * 块结束于下一条顶格非空行（`^[^\s#-]`）或文件尾；块内的注释与空行保留。
 */
export function extractInsertBlock(text) {
  const lines = String(text || "").split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^- insert:\s*$/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return "";
  let end = lines.length - 1;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^[^\s#-]/.test(line) || /^-\s/.test(line)) {
      end = i - 1;
      break;
    }
  }
  const block = lines.slice(start, end + 1);
  while (block.length && !block[block.length - 1].trim()) block.pop();
  return block.join("\n");
}

/** 读包内的 insert 块；读不到返回兜底模板。 */
export function readOwnInsertBlock(pkgRoot = PKG_ROOT) {
  try {
    const fp = path.join(pkgRoot, "cordis.patch.yml");
    const text = fs.readFileSync(fp, "utf8");
    const block = extractInsertBlock(text);
    if (block.trim()) return block;
  } catch {
    /* 读不到就用兜底 */
  }
  return FALLBACK_INSERT_BLOCK.replace(/\n$/, "");
}

export const INSERT_BLOCK = readOwnInsertBlock();

export function profileHasPurgeBodyInsert(text) {
  const lines = String(text || "").split(/\r?\n/);
  let insertIndent = -1;
  for (const line of lines) {
    if (/^-\s*insert:\s*$/.test(line) || /^\s+-\s*insert:\s*$/.test(line)) {
      insertIndent = (line.match(/^[ \t]*/) || [""])[0].length;
      continue;
    }
    if (insertIndent < 0) continue;
    const indent = (line.match(/^[ \t]*/) || [""])[0].length;
    const trimmed = line.trim();
    if (trimmed && indent <= insertIndent && /^-\s/.test(trimmed)) {
      insertIndent = -1;
      if (/^-\s*insert:\s*$/.test(trimmed)) {
        insertIndent = indent;
      }
      continue;
    }
    // 本体行：id: dsh-purge，或用户按 #159 临时绕过写的 dsh-purge-main / name: dsh-purge
    if (/^-\s*id:\s*dsh-purge(-main)?\s*$/.test(trimmed)) return true;
    if (/^-\s*name:\s*['"]?dsh-purge['"]?\s*$/.test(trimmed)) return true;
  }
  return false;
}

export function ensureProfileBodyInsert(profileDir) {
  const fp = path.join(profileDir, "cordis.patch.yml");
  let text = "";
  try { text = fs.readFileSync(fp, "utf8"); } catch { text = ""; }
  if (profileHasPurgeBodyInsert(text)) {
    return { ok: true, wrote: false, path: fp };
  }
  const prefix = text && !text.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(fp, `${text}${prefix}${text ? "\n" : ""}${INSERT_BLOCK}\n`, "utf8");
  return { ok: true, wrote: true, path: fp };
}

function readJson(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

function profileOwnsPurge(dir) {
  const pkg = readJson(path.join(dir, "package.json"));
  const bundles = pkg?.dsh?.profile?.bundles;
  if (Array.isArray(bundles) && bundles.includes(PURGE_NAME)) return true;
  const deps = pkg?.dependencies;
  if (deps && typeof deps === "object" && PURGE_NAME in deps) return true;
  try {
    return fs.existsSync(path.join(dir, "node_modules", PURGE_NAME, "package.json"));
  } catch {
    return false;
  }
}

export function listProfileDirs(dshHome) {
  const root = path.join(dshHome || "", "profiles");
  const out = [];
  let names = [];
  try { names = fs.readdirSync(root); } catch { return out; }
  for (const name of names) {
    const dir = path.join(root, name);
    try {
      if (fs.statSync(dir).isDirectory()) out.push(dir);
    } catch { /* skip */ }
  }
  return out;
}

export function ensureProfileBundles(profileDir) {
  const fp = path.join(profileDir, "package.json");
  const pkg = readJson(fp);
  if (!pkg) return { ok: false, wrote: false, path: fp };
  pkg.dsh = pkg.dsh && typeof pkg.dsh === "object" ? pkg.dsh : {};
  pkg.dsh.profile = pkg.dsh.profile && typeof pkg.dsh.profile === "object" ? pkg.dsh.profile : {};
  const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : [];
  if (bundles.includes(PURGE_NAME)) return { ok: true, wrote: false, path: fp };
  pkg.dsh.profile.bundles = [...bundles, PURGE_NAME];
  fs.writeFileSync(fp, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return { ok: true, wrote: true, path: fp };
}

/**
 * pnpm 10+ 默认拦 postinstall（ERR_PNPM_IGNORED_BUILDS）。写进 profile 的 allowBuilds，下次 add 能跑脚本。
 *
 * pnpm 按安装标识匹配 allowBuilds 的 key。`github:user/repo` 依赖装进来后，pnpm 记的
 * 标识是 `name@https://codeload.github.com/<user>/<repo>/tar.gz/<commit>`——**带 commit 哈希**，
 * 升级换 commit 就匹配不上、又弹一次批准窗。所以这里一次写足五种形式：
 *   1. `dsh-purge`（裸包名）
 *   2. `…codeload.github.com/…/tar.gz`（github: 依赖的规范形式，不带哈希 → 通配所有版本）
 *   3. package.json dsh.install.tarball（archive 形式）
 *   4. package.json dsh.install.git（.git 形式）
 *   5. pnpm 升级时自己写的带哈希行无需补——第 2 条已通配
 */
export const ALLOW_BUILDS_ENTRIES = [
  PURGE_NAME,
  `${PURGE_NAME}@https://codeload.github.com/hj01857655/dsh-purge/tar.gz`,
];

/** 从本包 package.json 的 dsh.install 里读出精确 tarball 标识（读不到给空）。 */
function ownInstallSpecifiers() {
  const out = [];
  try {
    const pkg = readJson(path.join(PKG_ROOT, "package.json"));
    const inst = pkg?.dsh?.install || {};
    for (const key of ["tarball", "git"]) {
      const url = typeof inst[key] === "string" ? inst[key].trim() : "";
      if (!url) continue;
      out.push(`${PURGE_NAME}@${url}`);
    }
  } catch { /* 读不到就算了，前两条已够宽 */ }
  return out;
}

export function ensurePnpmAllowBuild(profileDir) {
  const fp = path.join(profileDir, "pnpm-workspace.yaml");
  let text = "";
  try { text = fs.readFileSync(fp, "utf8"); } catch { text = ""; }

  const wanted = [...ALLOW_BUILDS_ENTRIES, ...ownInstallSpecifiers()];
  const missing = wanted.filter((entry) => {
    const re = new RegExp(`(^|\\n)[ \\t]*(["']?)${entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\2[ \\t]*:[ \\t]*true\\b`);
    return !re.test(text);
  });
  if (missing.length === 0) return { ok: true, wrote: false, path: fp };

  const lines = missing.map((entry) => `  ${entry}: true`).join("\n");
  if (!String(text).trim()) {
    fs.writeFileSync(fp, `allowBuilds:\n${lines}\n`, "utf8");
    return { ok: true, wrote: true, path: fp };
  }
  if (/(^|\n)allowBuilds[ \t]*:/.test(text)) {
    const next = text.replace(/(^|\n)(allowBuilds[ \t]*:[ \t]*\n)/, `$1$2${lines}\n`);
    if (next === text) return { ok: true, wrote: false, path: fp };
    fs.writeFileSync(fp, next, "utf8");
    return { ok: true, wrote: true, path: fp };
  }
  const prefix = text.endsWith("\n") ? "" : "\n";
  fs.writeFileSync(fp, `${text}${prefix}\nallowBuilds:\n${lines}\n`, "utf8");
  return { ok: true, wrote: true, path: fp };
}

/** 已装进 bundles / node_modules 但缺 insert 的 profile，补上本体行。 */
export function ensureAllProfileBodyInserts(dshHome) {
  return ensureAllProfileInstall(dshHome).map((item) => ({
    dir: item.dir,
    ok: item.ok,
    wrote: Boolean(item.insert?.wrote),
    path: item.insert?.path || path.join(item.dir || "", "cordis.patch.yml"),
    error: item.error,
  }));
}

/** bundles + 本体 insert + pnpm allowBuilds。postinstall 被跳过、升级覆盖 overlay 之后靠这条把按钮找回来。 */
export function ensureAllProfileInstall(dshHome) {
  const results = [];
  for (const dir of listProfileDirs(dshHome)) {
    if (!profileOwnsPurge(dir)) continue;
    try {
      const bundles = ensureProfileBundles(dir);
      const insert = ensureProfileBodyInsert(dir);
      const pnpm = ensurePnpmAllowBuild(dir);
      results.push({ dir, ok: true, bundles, insert, pnpm });
    } catch (error) {
      results.push({
        dir,
        ok: false,
        error: error && error.message ? error.message : String(error),
      });
    }
  }
  return results;
}
