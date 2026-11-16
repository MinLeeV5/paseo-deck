import test from "node:test";
import assert from "node:assert/strict";
import { addDeckAgent, createBoardStore } from "../plugin/client/deck-entry.ts";
import {
  addPane,
  activateTab,
  boardSchema,
  emptyBoard,
  moveTab,
  removeEmptyGroup,
  removeTab,
} from "../plugin/shared/model.ts";
import {
  applyLayoutPreset,
  boardGeometry,
  layoutTracks,
} from "../plugin/shared/layout.ts";

const resource = (id) => ({
  id,
  serverId: "host",
  workspaceId: "workspace",
  workspaceName: "Workspace",
  title: id,
  target: { kind: "agent", agentId: id },
  state: { draft: `unsent-${id}` },
});

function lineBoard(count, axis) {
  const panes = Array.from({ length: count }, (_, i) => resource(`tab-${i}`));
  const groups = panes.map((pane, i) => ({
    id: `group-${i}`,
    tabIds: [pane.id],
    activeTabId: pane.id,
  }));
  const leaves = groups.map((group) => ({ type: "group", groupId: group.id }));
  const splitTree = leaves.reduceRight((second, first) => ({
    type: "split",
    axis,
    ratio: 0.65,
    first,
    second,
  }));
  return {
    ...emptyBoard,
    panes,
    groups,
    direction: axis === "x" ? "row" : "column",
    splitTree,
  };
}

function closeGroup(board, groupId) {
  const group = board.groups.find((group) => group.id === groupId);
  return removeEmptyGroup(group.tabIds.reduce(removeTab, board), groupId);
}

function assertEqualTracks(board, axis) {
  assert.equal(boardSchema.safeParse(board).success, true);
  for (const [width, height] of [
    [1200, 800],
    [375, 812],
  ]) {
    const rectangles = [...boardGeometry(board, width, height).rects.values()];
    const size = axis === "x" ? "width" : "height";
    const start = axis === "x" ? "left" : "top";
    const unit = (axis === "x" ? width : height) / board.groups.length;
    rectangles.sort((a, b) => a[start] - b[start]);
    rectangles.forEach((rect, index) => {
      assert.ok(Math.abs(rect[size] - unit) < 0.001);
      assert.ok(Math.abs(rect[start] - unit * index) < 0.001);
      assert.equal(
        rect[axis === "x" ? "height" : "width"],
        axis === "x" ? height : width,
      );
    });
  }
}

for (const axis of ["x", "y"]) {
  for (const position of ["first", "middle", "last"]) {
    test(`closing the ${position} ${axis}-axis split reflows eight panes down to one`, () => {
      const initial = lineBoard(8, axis);
      const store = createBoardStore(() => initial);
      assert.equal(store.read("host"), initial);
      while (store.read("host").groups.length > 1) {
        const before = store.read("host");
        const index =
          position === "first"
            ? 0
            : position === "last"
              ? before.groups.length - 1
              : Math.floor(before.groups.length / 2);
        const next = store.publish(
          "host",
          closeGroup(before, before.groups[index].id),
        );
        assert.equal(next, store.read("host"));
        assertEqualTracks(next, axis);
        for (const pane of next.panes) {
          assert.equal(
            pane,
            initial.panes.find((value) => value.id === pane.id),
          );
          assert.equal(pane.state.draft, `unsent-${pane.id}`);
        }
      }
    });
  }

  test(`native Agent additions reflow ${axis}-axis splits before Deck mounts`, () => {
    const initial = lineBoard(2, axis);
    const store = createBoardStore(() => initial);
    for (let count = 3; count <= 8; count++) {
      let sequence = 0;
      const result = addDeckAgent(
        store.read("host"),
        {
          serverId: "host",
          workspaceId: "workspace",
          workspaceName: "Workspace",
          agentId: `native-${count}`,
          title: `Native ${count}`,
          destination: "new",
        },
        undefined,
        () => `native-${count}-${sequence++}`,
      );
      const published = store.publish("host", result.board);
      assert.equal(published.groups.length, count);
      assertEqualTracks(published, axis);
    }
    assert.equal(store.read("other-host"), initial);
  });

  test(`moving the last Tab out reflows the remaining ${axis}-axis splits`, () => {
    const initial = lineBoard(4, axis);
    const store = createBoardStore(() => initial);
    const moved = moveTab(initial, "tab-1", "group-3");
    const next = store.publish("host", moved);
    assert.equal(next.groups.length, 3);
    assert.equal(next.panes, initial.panes);
    assertEqualTracks(next, axis);
  });
}

for (const preset of ["two", "three", "four", "grid"]) {
  test(`closing a resized ${preset} preset resets both track dimensions`, () => {
    const populated = Array.from({ length: 8 }, (_, i) =>
      resource(`tab-${i}`),
    ).reduce(addPane, emptyBoard);
    const initial = {
      ...applyLayoutPreset(populated, preset),
      ratio: 0.7,
      columnWeights:
        preset === "three"
          ? [0.2, 0.3, 0.5]
          : preset === "four"
            ? [0.1, 0.2, 0.3, 0.4]
            : [0.3, 0.7],
      rowWeights: preset === "grid" ? [0.6, 0.4] : [1],
    };
    const store = createBoardStore(() => initial);
    const next = store.publish(
      "host",
      closeGroup(initial, initial.groups[0].id),
    );
    const tracks = layoutTracks(next);
    for (const weight of tracks.columnWeights)
      assert.ok(Math.abs(weight - 1 / tracks.columns) < 0.001);
    for (const weight of tracks.rowWeights)
      assert.ok(Math.abs(weight - 1 / tracks.rows) < 0.001);
    assert.equal(boardSchema.safeParse(next).success, true);
  });
}

test("closing several workspaces at once reflows the surviving groups", () => {
  const initial = lineBoard(5, "x");
  const store = createBoardStore(() => initial);
  const next = store.publish("host", {
    ...initial,
    groups: initial.groups.filter((_, i) => i % 2 === 0),
    panes: initial.panes.filter((_, i) => i % 2 === 0),
  });
  assert.equal(next.groups.length, 3);
  assertEqualTracks(next, "x");
});

test("a count change equalizes both axes of a nested layout", () => {
  const initial = {
    ...lineBoard(4, "x"),
    splitTree: {
      type: "split",
      axis: "x",
      ratio: 0.3,
      first: { type: "group", groupId: "group-0" },
      second: {
        type: "split",
        axis: "y",
        ratio: 0.7,
        first: { type: "group", groupId: "group-1" },
        second: {
          type: "split",
          axis: "x",
          ratio: 0.4,
          first: { type: "group", groupId: "group-2" },
          second: { type: "group", groupId: "group-3" },
        },
      },
    },
  };
  const store = createBoardStore(() => initial);
  const next = store.publish("host", closeGroup(initial, "group-2"));
  const geometry = boardGeometry(next, 1200, 800);
  assert.equal(geometry.rects.get("group-0").width, 600);
  assert.equal(geometry.rects.get("group-1").height, 400);
  assert.equal(geometry.rects.get("group-3").height, 400);
});

test("restoring, editing, and moving Tabs preserve manual sizes when split count stays the same", () => {
  const initial = lineBoard(3, "x");
  const store = createBoardStore(() => initial);
  assert.equal(store.read("host"), initial);
  const originalGeometry = boardGeometry(initial, 1200, 800).rects;
  const added = store.publish(
    "host",
    addPane(initial, resource("extra"), { groupId: "group-0" }),
  );
  const moved = store.publish("host", moveTab(added, "extra", "group-1"));
  const active = store.publish("host", activateTab(moved, "tab-1"));
  const removed = store.publish("host", removeTab(active, "extra"));
  assert.equal(removed.splitTree, initial.splitTree);
  assert.deepEqual(boardGeometry(removed, 1200, 800).rects, originalGeometry);
  const resized = {
    ...removed,
    splitTree: { ...removed.splitTree, ratio: 0.8 },
  };
  assert.equal(store.publish("host", resized), resized);
  assert.equal(store.read("host").splitTree.ratio, 0.8);
});
