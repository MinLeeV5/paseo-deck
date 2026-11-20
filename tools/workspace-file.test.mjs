import { strict as assert } from "node:assert";
import test from "node:test";
import { workspaceFilePath } from "../plugin/client/workspace-file.ts";

test("new files use a workspace-relative path and retain the parent directory", () => {
  assert.deepEqual(workspaceFilePath(" README.md "), {
    path: "README.md",
    parentPath: ".",
    name: "README.md",
  });
  assert.deepEqual(workspaceFilePath("docs\\guides\\notes.md"), {
    path: "docs/guides/notes.md",
    parentPath: "docs/guides",
    name: "notes.md",
  });
});

test("file creation rejects absolute paths, ambiguous segments, and empty names", () => {
  for (const path of [
    "",
    "/tmp/notes.md",
    "C:\\notes.md",
    "C:notes.md",
    "../notes.md",
    "docs/../notes.md",
    "docs/./notes.md",
    "docs//notes.md",
    "docs/",
    "line\nfeed.md",
  ])
    assert.throws(() => workspaceFilePath(path), /相对于 workspace/);
});
