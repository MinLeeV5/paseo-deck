import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKSPACE_AUTO_TITLE,
  initialWorkspaceAutoTitle,
  nextWorkspaceAutoTitle,
  createWorkspaceAutoTitles,
} from "../plugin/client/workspace-auto-title.ts";
import { workspaceCreationOptions } from "../plugin/client/workspace-creation.ts";

const workspace = (extra = {}) => ({
  id: "workspace",
  name: "illegal-snake",
  title: null,
  syncSeq: 1,
  metadata: { [WORKSPACE_AUTO_TITLE]: initialWorkspaceAutoTitle },
  ...extra,
});
const agent = (extra = {}) => ({
  id: "first",
  workspaceId: "workspace",
  createdAt: "2026-11-16T08:00:00Z",
  updatedAt: "2026-11-16T08:00:00Z",
  lastUserMessageAt: "2026-11-16T08:00:00Z",
  title: "修复 Jenkins 制品归档",
  labels: {},
  ...extra,
});
const project = {
  projectId: "project",
  projectKind: "git",
  projectRootPath: "/project",
};

test("unnamed workspace creation opts into naming after its first conversation", () => {
  const input = {
    project,
    title: "  ",
    isolation: "worktree",
    idempotencyKey: "create",
  };
  const options = workspaceCreationOptions(input);
  assert.equal(options.title, undefined);
  assert.deepEqual(
    options.metadata[WORKSPACE_AUTO_TITLE],
    initialWorkspaceAutoTitle,
  );
  const named = workspaceCreationOptions({ ...input, title: "  手动命名  " });
  assert.equal(named.title, "手动命名");
  assert.equal(named.metadata, undefined);
});

test("only the first visible root Agent names an untitled workspace after a user message", () => {
  const first = agent({ title: null, lastUserMessageAt: null });
  const others = [
    agent({ id: "helper", background: true }),
    agent({ id: "child", labels: { "paseo.parent-agent-id": "parent" } }),
    agent({ id: "archived", archivedAt: "2026-11-16T08:00:00Z" }),
    agent({ id: "second", createdAt: "2026-11-16T09:00:00Z" }),
    agent({ workspaceId: "another-workspace" }),
  ];
  assert.equal(
    nextWorkspaceAutoTitle(workspace(), [...others, first], true),
    null,
  );
  assert.deepEqual(
    nextWorkspaceAutoTitle(workspace(), [...others, agent()], true),
    {
      agentId: "first",
      title: agent().title,
    },
  );
  assert.equal(
    nextWorkspaceAutoTitle(workspace({ background: true }), [agent()], true),
    null,
  );
});

test("existing default-named Deck workspaces recover while explicit names are preserved", () => {
  const legacy = workspace({ metadata: {} });
  assert.equal(nextWorkspaceAutoTitle(legacy, [agent()], false), null);
  assert.equal(
    nextWorkspaceAutoTitle(legacy, [agent()], true).title,
    agent().title,
  );
  assert.equal(
    nextWorkspaceAutoTitle(workspace({ title: "我的工作区" }), [agent()], true),
    null,
  );
  assert.equal(
    nextWorkspaceAutoTitle(
      workspace({ metadata: { [WORKSPACE_AUTO_TITLE]: false } }),
      [agent()],
      true,
    ),
    null,
  );
});

function fixture({ read, write } = {}) {
  let current = workspace();
  const writes = [],
    errors = [];
  const observer = createWorkspaceAutoTitles(
    () => ({
      async refresh() {
        return read ? read(current) : structuredClone(current);
      },
      async setTitle(title) {
        writes.push(title);
        await write?.(title);
        current = { ...current, title, syncSeq: current.syncSeq + 1 };
        observer.workspace(current);
        return { title };
      },
      async setMetadata(patch) {
        current = {
          ...current,
          metadata: { ...current.metadata, ...patch },
          syncSeq: current.syncSeq + 1,
        };
        observer.workspace(current);
      },
    }),
    () => true,
    (error) => errors.push(error.message),
  );
  return {
    observer,
    writes,
    errors,
    get current() {
      return current;
    },
  };
}

for (const order of ["workspace-first", "agent-first"])
  test(`first conversation names its workspace with ${order} delivery`, async () => {
    const f = fixture();
    if (order === "workspace-first") {
      f.observer.workspace(workspace());
      f.observer.agent(agent());
    } else {
      f.observer.agent(agent());
      f.observer.workspace(workspace());
    }
    await f.observer.settled();
    assert.deepEqual(f.writes, [agent().title]);
    assert.deepEqual(f.current.metadata[WORKSPACE_AUTO_TITLE], {
      agentId: "first",
      title: agent().title,
    });
    f.observer.agent(agent());
    f.observer.board();
    await f.observer.settled();
    assert.equal(f.writes.length, 1);
  });

test("generated Agent titles arriving during a write converge and never overwrite a manual rename", async () => {
  let finish;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  const f = fixture({ write: () => gate });
  f.observer.workspace(workspace());
  f.observer.agent(agent({ title: "原始首条消息" }));
  await new Promise((resolve) => setImmediate(resolve));
  f.observer.agent(agent({ updatedAt: "2026-11-16T09:00:00Z" }));
  finish();
  await f.observer.settled();
  assert.deepEqual(f.writes, ["原始首条消息", agent().title]);
  f.observer.workspace(
    workspace({ ...f.current, title: "手动名称", syncSeq: 99 }),
  );
  f.observer.workspace(workspace({ syncSeq: 1 }));
  f.observer.agent(
    agent({ title: "另一个标题", updatedAt: "2026-11-16T10:00:00Z" }),
  );
  await f.observer.settled();
  assert.equal(f.writes.length, 2);
});

test("refresh protects a manual title that arrived before the automatic write", async () => {
  const f = fixture({
    read: (w) => ({ ...w, title: "刚刚手动命名", syncSeq: 2 }),
  });
  f.observer.workspace(workspace());
  f.observer.agent(agent());
  await f.observer.settled();
  assert.deepEqual(f.writes, []);
});

test("a write failure is reported once per title and teardown stops pending writes", async () => {
  const f = fixture({
    write: () => {
      throw new Error("Offline");
    },
  });
  f.observer.workspace(workspace());
  f.observer.agent(agent());
  await f.observer.settled();
  f.observer.agent(agent({ updatedAt: "2026-11-16T09:00:00Z" }));
  await f.observer.settled();
  assert.deepEqual(f.errors, ["Offline"]);
  assert.equal(f.writes.length, 1);
  f.observer.retry();
  await f.observer.settled();
  assert.equal(f.writes.length, 2);
  const stopped = fixture();
  stopped.observer.workspace(workspace());
  stopped.observer.agent(agent());
  stopped.observer.dispose();
  await stopped.observer.settled();
  assert.deepEqual(stopped.writes, []);
});
