import test from "node:test";
import assert from "node:assert/strict";
import {
  NATIVE_DECK_JOIN,
  readNativeDeckJoin,
  createNativeWorkspaceJoins,
} from "../plugin/client/native-entry-state.ts";

const marker = {
  clientId: "this-device",
  requestId: "creation",
  destination: "new",
};
const workspace = (extra = {}) => ({
  id: "workspace",
  metadata: { [NATIVE_DECK_JOIN]: marker },
  ...extra,
});
const agent = (id = "first", extra = {}) => ({
  id,
  workspaceId: "workspace",
  createdAt: "2026-11-16T08:00:00Z",
  updatedAt: "2026-11-16T08:00:00Z",
  ...extra,
});

for (const order of ["workspace-first", "agent-first"])
  test(`native creation adds its first Agent once with ${order} delivery`, () => {
    const joined = [];
    const observer = createNativeWorkspaceJoins(
      "this-device",
      (...args) => joined.push(args),
      (error) => {
        throw error;
      },
    );
    if (order === "workspace-first") {
      observer.workspace(workspace());
      observer.agent(agent());
    } else {
      observer.agent(agent());
      observer.workspace(workspace());
    }
    observer.workspace(workspace());
    observer.agent(agent("second", { createdAt: "2026-11-16T09:00:00Z" }));
    observer.agent(agent("first", { updatedAt: "2026-11-16T10:00:00Z" }));
    assert.equal(joined.length, 1);
    assert.equal(joined[0][0].id, "first");
    assert.equal(joined[0][2], "new");
  });

test("native creation intents stay on the initiating client and require an explicit destination", () => {
  const joined = [];
  const observer = createNativeWorkspaceJoins(
    "another-device",
    (...args) => joined.push(args),
    assert.fail,
  );
  observer.agent(agent());
  observer.workspace(workspace());
  assert.equal(joined.length, 0);
  for (const value of [
    undefined,
    null,
    true,
    "current",
    {},
    { ...marker, destination: "everywhere" },
  ]) {
    assert.equal(readNativeDeckJoin({ [NATIVE_DECK_JOIN]: value }), null);
  }
  assert.deepEqual(readNativeDeckJoin(workspace().metadata), marker);
});

test("hidden Agents and unavailable workspaces never get automatically added", () => {
  const joined = [];
  const observer = createNativeWorkspaceJoins(
    "this-device",
    (...args) => joined.push(args),
    assert.fail,
  );
  observer.workspace(workspace({ background: true }));
  observer.agent(agent());
  observer.workspace(workspace());
  assert.equal(joined.length, 1);
  const second = createNativeWorkspaceJoins(
    "this-device",
    (...args) => joined.push(args),
    assert.fail,
  );
  second.workspace(workspace());
  second.agent(agent("helper", { background: true }));
  second.agent(agent("archived", { archivedAt: "2026-11-16T09:00:00Z" }));
  assert.equal(joined.length, 1);
});

test("an older workspace snapshot cannot restore a cancelled creation intent", () => {
  const joined = [];
  const observer = createNativeWorkspaceJoins(
    "this-device",
    (...args) => joined.push(args),
    assert.fail,
  );
  observer.workspace(workspace({ syncSeq: 2, metadata: {} }));
  observer.workspace(workspace({ syncSeq: 1 }));
  observer.agent(agent());
  assert.equal(joined.length, 0);
});

test("automatic join errors are reported once without retrying on every directory update", () => {
  const errors = [];
  const observer = createNativeWorkspaceJoins(
    "this-device",
    () => {
      throw new Error("Storage unavailable");
    },
    (error) => errors.push(error.message),
  );
  observer.workspace(workspace());
  observer.agent(agent());
  observer.workspace(workspace());
  observer.agent(agent("second"));
  assert.deepEqual(errors, ["Storage unavailable"]);
});
