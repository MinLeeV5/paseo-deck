import test from "node:test";
import assert from "node:assert/strict";
import { workspaceCreationOptions } from "../plugin/client/workspace-creation.ts";

const input = {
  project: {
    projectId: "project",
    projectKind: "git",
    projectRootPath: "/repo",
  },
  isolation: "worktree",
  title: "Feature workspace",
  idempotencyKey: "create-feature",
};

test("worktree creation preserves the selected local or remote base ref", () => {
  for (const baseBranch of [
    "main",
    "release/v2",
    "origin/main",
    "upstream/release/v2",
    "refs/heads/release/v2",
    "refs/remotes/origin/main",
  ]) {
    const options = workspaceCreationOptions({ ...input, baseBranch });
    assert.equal(options.source.kind, "worktree");
    assert.equal(options.source.baseBranch, baseBranch);
    assert.equal(options.source.projectId, input.project.projectId);
    assert.equal(options.source.cwd, input.project.projectRootPath);
  }
});

test("automatic selection omits the base ref and explicit selections are trimmed", () => {
  for (const baseBranch of [undefined, "", "   "]) {
    assert.equal(
      Object.hasOwn(
        workspaceCreationOptions({ ...input, baseBranch }).source,
        "baseBranch",
      ),
      false,
    );
  }
  assert.equal(
    workspaceCreationOptions({ ...input, baseBranch: " origin/main " }).source
      .baseBranch,
    "origin/main",
  );
});

test("using the original directory ignores an earlier worktree branch selection", () => {
  const options = workspaceCreationOptions({
    ...input,
    isolation: "directory",
    baseBranch: "origin/release/v2",
  });
  assert.deepEqual(options.source, {
    kind: "directory",
    projectId: "project",
    path: "/repo",
  });
  assert.throws(
    () =>
      workspaceCreationOptions({
        ...input,
        project: { ...input.project, projectKind: "directory" },
      }),
    /不支持创建 worktree/,
  );
});
