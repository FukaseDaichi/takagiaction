#!/usr/bin/env node

// .agents/skills/<name>/SKILL.md（正本）から .claude/skills/<name>/SKILL.md
// （Claude Code 用の参照スタブ）を生成・検証する。
// 方式の理由と運用は .agents/rules/skill-management.md を参照。

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode !== "setup" && mode !== "check") {
  console.error("Usage: node scripts/manage-skill-stubs.mjs <setup|check>");
  process.exit(2);
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, ".agents", "skills");
const stubRoot = join(repositoryRoot, ".claude", "skills");
const keepFile = ".gitkeep";
const errors = [];
const changes = [];

function stubBody(name, description) {
  return `---
name: ${name}
description: ${description}
---

このファイルは Claude Code 用の参照スタブ。スキルの実体は \`.agents/skills/${name}/SKILL.md\`。
実体を読み、その手順に従って実行せよ。編集は実体側だけに行う。
`;
}

/** SKILL.md の frontmatter から name と description を取り出す。 */
function parseFrontmatter(content, label) {
  const text = content.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) {
    errors.push(`${label}: frontmatter が --- で始まっていない`);
    return null;
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    errors.push(`${label}: frontmatter の終端 --- が見つからない`);
    return null;
  }
  const fields = {};
  for (const line of text.slice(4, end + 1).split("\n")) {
    const match = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(line);
    if (match) fields[match[1]] = match[2].trim();
  }
  for (const key of ["name", "description"]) {
    if (!fields[key]) {
      errors.push(`${label}: frontmatter に ${key} が無いか空である`);
      return null;
    }
    if (/^[|>]/.test(fields[key])) {
      errors.push(`${label}: ${key} がブロックスカラーである。1 行で書くこと`);
      return null;
    }
  }
  return fields;
}

async function pathKind(path) {
  try {
    const info = await stat(path);
    return info.isDirectory() ? "directory" : "file";
  } catch (error) {
    if (error.code === "ENOENT") return null;
    // 壊れた symlink は stat が ENOENT 以外を返し得る
    return "broken";
  }
}

async function listSkillNames() {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function syncSkill(name) {
  const sourceFile = join(sourceRoot, name, "SKILL.md");
  let content;
  try {
    content = await readFile(sourceFile, "utf8");
  } catch {
    errors.push(`.agents/skills/${name}/SKILL.md が無い。1 スキル = 1 ディレクトリ + SKILL.md が必須`);
    return;
  }
  const fields = parseFrontmatter(content, `.agents/skills/${name}/SKILL.md`);
  if (!fields) return;
  if (fields.name !== name) {
    errors.push(`.agents/skills/${name}/SKILL.md: frontmatter の name が "${fields.name}" でディレクトリ名と一致しない`);
    return;
  }

  const stubDir = join(stubRoot, name);
  const stubFile = join(stubDir, "SKILL.md");
  const expected = stubBody(name, fields.description);

  const dirKind = await pathKind(stubDir);
  if (dirKind !== null && dirKind !== "directory") {
    if (mode === "check") {
      errors.push(`.claude/skills/${name} が通常ディレクトリでない（symlink 残骸またはリンク先文字列だけのファイル）`);
      return;
    }
    await rm(stubDir, { force: true, recursive: true });
    changes.push(`removed non-directory .claude/skills/${name}`);
  }

  let actual = null;
  try {
    actual = (await readFile(stubFile, "utf8")).replace(/\r\n/g, "\n");
  } catch {
    actual = null;
  }

  if (actual === expected) return;

  if (mode === "check") {
    errors.push(
      actual === null
        ? `.claude/skills/${name}/SKILL.md が読めない。npm run skills:setup を実行する`
        : `.claude/skills/${name}/SKILL.md が正本と食い違う（description の同期漏れ）。npm run skills:setup を実行する`,
    );
    return;
  }
  await mkdir(stubDir, { recursive: true });
  await writeFile(stubFile, expected, "utf8");
  changes.push(`wrote .claude/skills/${name}/SKILL.md`);
}

async function pruneStaleStubs(names) {
  let entries;
  try {
    entries = await readdir(stubRoot, { withFileTypes: true });
  } catch {
    return;
  }
  const known = new Set(names);
  for (const entry of entries) {
    if (entry.name === keepFile || known.has(entry.name)) continue;
    const path = join(stubRoot, entry.name);
    if (mode === "check") {
      errors.push(`.claude/skills/${entry.name} に対応する正本が .agents/skills/ に無い`);
      continue;
    }
    // 正本を持たない公開先は、参照スタブと確認できた場合だけ削除する
    let body = null;
    try {
      body = await readFile(join(path, "SKILL.md"), "utf8");
    } catch {
      body = null;
    }
    const isStub = body !== null && body.includes(".agents/skills/");
    const isBroken = (await pathKind(path)) !== "directory";
    if (!isStub && !isBroken) {
      errors.push(`.claude/skills/${entry.name} は生成した参照スタブではない。内容を確認して手で処理する`);
      continue;
    }
    await rm(path, { force: true, recursive: true });
    changes.push(`removed stale .claude/skills/${entry.name}`);
  }
}

const names = await listSkillNames();
await mkdir(stubRoot, { recursive: true });
for (const name of names) await syncSkill(name);
await pruneStaleStubs(names);

if (errors.length > 0) {
  console.error(`skills:${mode} failed:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
for (const change of changes) console.log(`skills:${mode}: ${change}`);
console.log(`skills:${mode}: ${names.length} skills OK (.agents/skills -> .claude/skills stubs)`);
