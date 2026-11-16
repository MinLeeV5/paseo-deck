import test from "node:test";
import assert from "node:assert/strict";
import {
  addDeckAgent,
  createBoardStore,
  workspaceDeckGroups,
} from "../plugin/client/deck-entry.ts";
import { emptyBoard, moveTab, removeTab } from "../plugin/shared/model.ts";

const entry = {
  serverId: "host",
  workspaceId: "workspace",
  agentId: "agent",
  title: "Task",
  workspaceName: "Project / Worktree",
  destination: "current",
};
const empty = () => structuredClone(emptyBoard);

test("native entry joins the last focused split and keeps its source identity", () => {
  const board = {
    ...empty(),
    groups: [
      { id: "left", tabIds: [], activeTabId: null },
      { id: "right", tabIds: [], activeTabId: null },
    ],
  };
  const result = addDeckAgent(board, entry, "right");
  assert.equal(result.groupId, "right");
  assert.equal(result.board.groups[1].activeTabId, result.paneId);
  assert.deepEqual(result.board.panes[0].target, {
    kind: "agent",
    agentId: "agent",
  });
  assert.equal(result.board.panes[0].workspaceId, "workspace");
  assert.equal(board.panes.length, 0);
});

test("native re-adding locates an existing Agent even when a new split is requested", () => {
  const first = addDeckAgent(empty(), entry);
  const again = addDeckAgent(first.board, { ...entry, destination: "new" });
  assert.equal(again.paneId, first.paneId);
  assert.equal(again.board.panes.length, 1);
  assert.equal(again.board.groups.length, first.board.groups.length);
});

test("native additions use an available group and respect the eight-split limit", () => {
  const initial = empty();
  assert.equal(
    addDeckAgent(initial, entry, "removed").groupId,
    initial.groups[0].id,
  );
  let board = initial;
  while (board.groups.length < 8) {
    board = addDeckAgent(board, {
      ...entry,
      agentId: `agent-${board.groups.length}`,
      destination: "new",
    }).board;
  }
  assert.throws(
    () =>
      addDeckAgent(board, { ...entry, agentId: "ninth", destination: "new" }),
    /分屏/,
  );
  assert.equal(
    addDeckAgent(board, { ...entry, agentId: "current" }).board.panes.length,
    board.panes.length + 1,
  );
});

test("native additions before screen mount and later Deck edits share the same host layout", () => {
  let loads = 0,
    updates = 0;
  const store = createBoardStore(() => {
    loads++;
    return empty();
  });
  const remove = store.subscribe(() => updates++);
  const first = addDeckAgent(store.read("host"), entry);
  store.publish("host", first.board);
  store.rememberFocus("host", first.groupId);
  const second = addDeckAgent(
    store.read("host"),
    { ...entry, agentId: "second" },
    store.readFocus("host"),
  );
  store.publish("host", second.board);
  store.publish("host", second.board);
  assert.equal(store.read("host").panes.length, 2);
  assert.equal(loads, 1);
  assert.equal(updates, 2);
  assert.equal(store.read("other-host").panes.length, 0);
  assert.equal(store.readFocus("other-host"), undefined);
  remove();
  store.publish("host", empty());
  assert.equal(updates, 2);
});

test("workspace badges follow the dragged Tab's split instead of its tab count", () => {
  let board = empty();
  for (const [agentId, workspaceId, destination] of [
    ["moving", "workspace", "current"],
    ["stay", "other", "current"],
    ["middle", "other", "new"],
    ["right", "other", "new"],
  ])
    board = addDeckAgent(board, {
      ...entry,
      agentId,
      workspaceId,
      destination,
    }).board;
  const moving = board.panes.find((pane) => pane.target.agentId === "moving");
  const store = createBoardStore(() => board);
  const seen = [];
  store.subscribe(() =>
    seen.push(workspaceDeckGroups(store.read("host"), "host", "workspace")),
  );
  assert.deepEqual(workspaceDeckGroups(board, "host", "workspace"), [1]);
  store.publish("host", moveTab(board, moving.id, board.groups[2].id));
  board = store.read("host");
  assert.deepEqual(seen, [[3]]);
  assert.deepEqual(workspaceDeckGroups(board, "host", "other"), [1, 2, 3]);
  assert.deepEqual(
    workspaceDeckGroups(board, "different-host", "workspace"),
    [],
  );
  board = removeTab(board, moving.id);
  assert.deepEqual(workspaceDeckGroups(board, "host", "workspace"), []);
});

test("workspace split locations stay unique and renumber when an empty source split closes", () => {
  let board = addDeckAgent(empty(), entry).board;
  board = addDeckAgent(board, {
    ...entry,
    agentId: "second",
    destination: "new",
  }).board;
  board = addDeckAgent(
    board,
    { ...entry, agentId: "third" },
    board.groups[1].id,
  ).board;
  assert.deepEqual(workspaceDeckGroups(board, "host", "workspace"), [1, 2]);
  board = moveTab(board, board.groups[0].tabIds[0], board.groups[1].id);
  assert.equal(board.groups.length, 1);
  assert.deepEqual(workspaceDeckGroups(board, "host", "workspace"), [1]);
});
