import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const sourcePath = new URL("../src/pages/dashboardDrag.ts", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020,
  },
});
const tempDir = await mkdtemp(join(tmpdir(), "resty-dashboard-drag-"));
const modulePath = join(tempDir, "dashboardDrag.mjs");
await writeFile(modulePath, output.outputText);

const { getDragReorderCandidate } = await import(modulePath);

const metrics = {
  trackWidth: 100,
  trackHeight: 100,
  columnGap: 20,
  rowGap: 20,
  columnSpan: 120,
  rowSpan: 120,
};

const active = { x: 0, y: 0, w: 2, h: 2 };
const layouts = [
  { id: "active", layout: active },
  { id: "right", layout: { x: 2, y: 0, w: 2, h: 2 } },
  { id: "below", layout: { x: 0, y: 2, w: 2, h: 2 } },
];

test("dashboard drag ignores small accidental movement", () => {
  assert.deepEqual(
    getDragReorderCandidate({
      activeId: "active",
      layouts,
      original: active,
      deltaX: 60,
      deltaY: 8,
      metrics,
    }),
    active,
  );
});

test("dashboard drag follows the nearest card center in the influence area", () => {
  assert.deepEqual(
    getDragReorderCandidate({
      activeId: "active",
      layouts,
      original: active,
      deltaX: 250,
      deltaY: 12,
      metrics,
    }),
    { x: 2, y: 0, w: 2, h: 2 },
  );
});

test("dashboard drag keeps mostly horizontal movement from vertical jitter", () => {
  assert.deepEqual(
    getDragReorderCandidate({
      activeId: "active",
      layouts,
      original: active,
      deltaX: 185,
      deltaY: 74,
      metrics,
    }),
    { x: 2, y: 0, w: 2, h: 2 },
  );
});

test("dashboard drag still allows deliberate vertical movement", () => {
  assert.deepEqual(
    getDragReorderCandidate({
      activeId: "active",
      layouts,
      original: active,
      deltaX: 14,
      deltaY: 250,
      metrics,
    }),
    { x: 0, y: 2, w: 2, h: 2 },
  );
});
