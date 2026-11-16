import test from "node:test";
import assert from "node:assert/strict";
import {
  openSubagentTab,
  scopeSubagentTrack,
} from "../plugin/client/subagent-navigation.ts";
import { boardSchema } from "../plugin/shared/model.ts";

function track() {
  const native = [],
    scoped = [];
  const props = {
    rows: [{ id: "child" }],
    onOpenSubagent: (address) => native.push(address),
    onOpenProviderSubagent: (...ids) => native.push(ids),
    onArchiveSubagent() {},
    sheetTabFor() {},
  };
  const navigation = {
    serverId: "host",
    openAgent: (agentId) => scoped.push({ kind: "agent", agentId }),
    openProviderSubagent: (parentAgentId, subagentId) =>
      scoped.push({ kind: "provider_subagent", parentAgentId, subagentId }),
  };
  return { props, navigation, native, scoped };
}

test("native subagent tracks outside Deck keep their callbacks", () => {
  const { props } = track();
  assert.equal(scopeSubagentTrack(props, null), props);
});

test("Deck routes managed and provider children through their source pane", () => {
  const { props, navigation, native, scoped } = track();
  const routed = scopeSubagentTrack(props, navigation);
  routed.onOpenSubagent({ serverId: "host", agentId: "child" });
  routed.onOpenProviderSubagent("parent", "provider-child");
  assert.deepEqual(scoped, [
    { kind: "agent", agentId: "child" },
    {
      kind: "provider_subagent",
      parentAgentId: "parent",
      subagentId: "provider-child",
    },
  ]);
  assert.deepEqual(native, []);
  assert.equal(routed.rows, props.rows);
  assert.equal(routed.onArchiveSubagent, props.onArchiveSubagent);
  assert.equal(routed.sheetTabFor, props.sheetTabFor);
});

test("a subagent on another host keeps native navigation", () => {
  const { props, navigation, native, scoped } = track();
  const address = { serverId: "other-host", agentId: "child" };
  scopeSubagentTrack(props, navigation).onOpenSubagent(address);
  assert.deepEqual(native, [address]);
  assert.deepEqual(scoped, []);
});

function pane(
  id,
  workspaceId = "workspace",
  target = { kind: "agent", agentId: id },
) {
  return {
    id,
    serverId: "host",
    workspaceId,
    workspaceName: workspaceId,
    title: id,
    target,
  };
}
function board() {
  return {
    version: 2,
    direction: "row",
    ratio: 0.5,
    panes: [pane("left"), pane("parent")],
    groups: [
      { id: "left-split", tabIds: ["left"], activeTabId: "left" },
      { id: "source-split", tabIds: ["parent"], activeTabId: "parent" },
    ],
  };
}

for (const child of [
  pane("child"),
  pane("child", "child-workspace"),
  pane("provider-child", "workspace", {
    kind: "provider_subagent",
    parentAgentId: "parent",
    subagentId: "provider-child",
  }),
]) {
  test(`${child.target.kind} in ${child.workspaceId} opens in the clicked split and preserves the parent`, () => {
    const before = board();
    const opened = openSubagentTab(before, "parent", child);
    assert.equal(opened.groupId, "source-split");
    assert.equal(opened.tabId, child.id);
    assert.deepEqual(opened.board.groups[1].tabIds, ["parent", child.id]);
    assert.equal(opened.board.groups[1].activeTabId, child.id);
    assert.equal(opened.board.groups[0], before.groups[0]);
    assert.equal(
      opened.board.panes.find((p) => p.id === "parent"),
      before.panes[1],
    );
    assert.equal(
      opened.board.panes.find((p) => p.id === child.id),
      child,
    );
    boardSchema.parse(opened.board);
  });
}

test("an existing child in another split moves into the clicked split without duplicating its content", () => {
  const before = board();
  const child = { ...pane("child"), state: { scroll: 120 } };
  before.panes.push(child);
  before.groups[0].tabIds.push(child.id);
  before.groups[0].activeTabId = child.id;
  const opened = openSubagentTab(before, "parent", { ...child, id: "unused" });
  assert.equal(opened.tabId, child.id);
  assert.equal(opened.board.panes.length, 3);
  assert.equal(
    opened.board.panes.find((p) => p.id === child.id),
    child,
  );
  assert.deepEqual(opened.board.groups[0].tabIds, ["left"]);
  assert.equal(opened.board.groups[0].activeTabId, "left");
  assert.deepEqual(opened.board.groups[1].tabIds, ["parent", "child"]);
  assert.equal(opened.board.groups[1].activeTabId, "child");
  const again = openSubagentTab(opened.board, "parent", {
    ...child,
    id: "unused-again",
  });
  assert.equal(again.board, opened.board);
  boardSchema.parse(opened.board);
});

test("a closed source tab cannot open a child in an unrelated split", () => {
  assert.equal(openSubagentTab(board(), "closed-parent", pane("child")), null);
});
