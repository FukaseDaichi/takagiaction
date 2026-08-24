#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  symlink,
  unlink,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode !== "setup" && mode !== "check") {
  console.error("Usage: node scripts/manage-skill-links.mjs <setup|check>");
  process.exit(2);
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, ".agents", "skills");
const exposureRoot = join(repositoryRoot, ".claude", "skills");
const isWindows = process.platform === "win32";
const errors = [];
const changes = [];

function comparablePath(path) {
  const absolute = resolve(path);
  return isWindows ? absolute.toLowerCase() : absolute;
}

function pointsTo(rawTarget, linkPath, expectedTarget) {
  return comparablePath(resolve(dirname(linkPath), rawTarget)) === comparablePath(expectedTarget);
}

function placeholderTarget(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.length === 1 && lines[0].trim() ? lines[0].trim() : null;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function pathInfo(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function validateSkill(name) {
  const skillFile = join(sourceRoot, name, "SKILL.md");
  let content;
  try {
    content = await readFile(skillFile, "utf8");
  } catch (error) {
    errors.push(`${name}: 正本の SKILL.md を読めません (${error.message})`);
    return false;
  }

  const frontmatter = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) {
    errors.push(`${name}: SKILL.md に YAML frontmatter がありません`);
    return false;
  }

  const nameValue = frontmatter.match(/^name:\s*(.+?)\s*$/m)?.[1]?.replace(/^(["'])(.*)\1$/, "$2");
  const descriptionValue = frontmatter.match(/^description:\s*(.+?)\s*$/m)?.[1];
  if (!nameValue) errors.push(`${name}: frontmatter の name がありません`);
  if (!descriptionValue) errors.push(`${name}: frontmatter の description がありません`);
  if (nameValue && nameValue !== name) {
    errors.push(`${name}: frontmatter の name (${nameValue}) がディレクトリ名と一致しません`);
  }
  return Boolean(nameValue && descriptionValue && nameValue === name);
}

async function removeStaleExposure(name, exposurePath, info) {
  const expectedTarget = join(sourceRoot, name);
  if (info.isSymbolicLink()) {
    const rawTarget = await readlink(exposurePath);
    if (!pointsTo(rawTarget, exposurePath, expectedTarget)) {
      errors.push(`${name}: 正本にない公開リンクが別の場所を指しています (${rawTarget})`);
      return;
    }
    if (mode === "setup") {
      await unlink(exposurePath);
      changes.push(`${name}: 不要になった公開リンクを削除`);
    } else {
      errors.push(`${name}: 正本にない公開リンクが残っています`);
    }
    return;
  }

  if (info.isFile()) {
    const content = await readFile(exposurePath, "utf8");
    const rawTarget = placeholderTarget(content);
    if (rawTarget && pointsTo(rawTarget, exposurePath, expectedTarget)) {
      if (mode === "setup") {
        await unlink(exposurePath);
        changes.push(`${name}: 不要になった Git symlink プレースホルダーを削除`);
      } else {
        errors.push(`${name}: 正本にない Git symlink プレースホルダーが残っています`);
      }
      return;
    }
  }

  errors.push(`${name}: 正本にない実体があります。自動削除しません`);
}

async function ensureExposure(name) {
  const sourcePath = join(sourceRoot, name);
  const exposurePath = join(exposureRoot, name);
  let info = await pathInfo(exposurePath);

  if (info?.isFile()) {
    const content = await readFile(exposurePath, "utf8");
    const rawTarget = placeholderTarget(content);
    if (!rawTarget || !pointsTo(rawTarget, exposurePath, sourcePath)) {
      errors.push(`${name}: 公開先に内容の異なる通常ファイルがあります。自動置換しません`);
      return;
    }
    if (mode === "check") {
      errors.push(`${name}: 公開先が Git symlink プレースホルダーの通常ファイルです`);
      return;
    }
    await unlink(exposurePath);
    changes.push(`${name}: Git symlink プレースホルダーをリンクへ置換`);
    info = null;
  }

  if (info && !info.isSymbolicLink()) {
    errors.push(`${name}: 公開先が通常ディレクトリです。自動置換しません`);
    return;
  }

  if (!info) {
    if (mode === "check") {
      errors.push(`${name}: Claude Code 向け公開リンクがありません`);
      return;
    }
    const target = isWindows ? sourcePath : relative(exposureRoot, sourcePath);
    await symlink(target, exposurePath, isWindows ? "junction" : "dir");
    changes.push(`${name}: ${isWindows ? "junction" : "相対 symlink"} を作成`);
  }

  const rawTarget = await readlink(exposurePath);
  if (!pointsTo(rawTarget, exposurePath, sourcePath)) {
    errors.push(`${name}: 公開リンクの参照先が不正です (${rawTarget})`);
    return;
  }

  try {
    const sourceContent = await readFile(join(sourcePath, "SKILL.md"));
    const exposedContent = await readFile(join(exposurePath, "SKILL.md"));
    if (sha256(sourceContent) !== sha256(exposedContent)) {
      errors.push(`${name}: 正本と公開先の SKILL.md が一致しません`);
    }
  } catch (error) {
    errors.push(`${name}: 公開先の SKILL.md を読めません (${error.message})`);
  }
}

await mkdir(exposureRoot, { recursive: true });

const sourceEntries = await readdir(sourceRoot, { withFileTypes: true });
const skillNames = sourceEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const sourceNameSet = new Set(skillNames);

for (const entry of sourceEntries) {
  if (!entry.isDirectory()) {
    errors.push(`${entry.name}: .agents/skills 直下はスキルディレクトリだけにしてください`);
  }
}

const exposureEntries = await readdir(exposureRoot, { withFileTypes: true });
for (const entry of exposureEntries) {
  if (entry.name === ".gitkeep" || sourceNameSet.has(entry.name)) continue;
  const exposurePath = join(exposureRoot, entry.name);
  const info = await pathInfo(exposurePath);
  await removeStaleExposure(entry.name, exposurePath, info);
}

for (const name of skillNames) {
  const valid = await validateSkill(name);
  if (valid) await ensureExposure(name);
}

if (changes.length) {
  for (const change of changes) console.log(change);
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`${mode}: ${skillNames.length} 件の共有スキルを検証しました`);
