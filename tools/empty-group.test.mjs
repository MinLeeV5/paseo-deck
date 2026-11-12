import test from "node:test";
import assert from "node:assert/strict";
import {
  addPane,
  boardSchema,
  emptyBoard,
  removeEmptyGroup,
} from "../plugin/shared/model.ts";
import { applyLayoutPreset, boardGeometry } from "../plugin/shared/layout.ts";

const pane = {
  id: "agent-tab",
  serverId: "host",
  workspaceId: "workspace",
  workspaceName: "Workspace",
  title: "Agent",
  target: { kind: "agent", agentId: "agent" },
  state: { draft: "keep this input" },
};
const populated = addPane(emptyBoard, pane);

function assertFillsBoard(board, width = 1200, height = 800) {
  assert.equal(boardSchema.safeParse(board).success, true);
  const geometry = boardGeometry(board, width, height);
  const rects = [...geometry.rects.values()];
  assert.equal(rects.length, board.groups.length);
  assert.equal(geometry.dividers.length, board.groups.length - 1);
  const area = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  assert.ok(Math.abs(area - width * height) < 0.001);
  rects.forEach((rect, index) => {
    assert.ok(rect.width > 0 && rect.height > 0);
    assert.ok(rect.left >= 0 && rect.top >= 0);
    assert.ok(rect.left + rect.width <= width + 0.001);
    assert.ok(rect.top + rect.height <= height + 0.001);
    for (const other of rects.slice(index + 1)) {
      const overlapWidth =
        Math.min(rect.left + rect.width, other.left + other.width) -
        Math.max(rect.left, other.left);
      const overlapHeight =
        Math.min(rect.top + rect.height, other.top + other.height) -
        Math.max(rect.top, other.top);
      assert.ok(overlapWidth <= 0.001 || overlapHeight <= 0.001);
    }
  });
  assert.equal(board.panes, populated.panes);
  assert.equal(board.panes[0], pane);
}

test("closing a split cannot remove content or the last empty split", () => {
  const split = applyLayoutPreset(populated, "three");
  assert.equal(removeEmptyGroup(split, split.groups[0].id), split);
  assert.equal(removeEmptyGroup(split, "missing"), split);
  assert.equal(removeEmptyGroup(emptyBoard, "group-main"), emptyBoard);
  assert.equal(removeEmptyGroup(populated, "group-main"), populated);
});

for (const preset of ["two", "three", "four", "grid"]) {
  test(`closing empty ${preset} splits refills the board without remounting resources`, () => {
    let board = applyLayoutPreset(populated, preset);
    const occupiedGroup = board.groups[0];
    while (board.groups.length > 1) {
      const closing = board.groups.at(-1).id;
      board = removeEmptyGroup(board, closing);
      assert.ok(board.groups.every((group) => group.id !== closing));
      assert.equal(board.groups[0], occupiedGroup);
      assertFillsBoard(board);
      assert.equal(removeEmptyGroup(board, closing), board);
    }
    const rect = boardGeometry(board, 1200, 800).rects.get(occupiedGroup.id);
    assert.deepEqual(rect, {
      left: 0,
      top: 0,
      width: 1200,
      height: 800,
      insetX: 0,
      insetY: 0,
    });
  });
}

test("closing nested empty splits expands siblings and preserves unrelated ratios", () => {
  const board = {
    ...populated,
    groups: [
      { id: "empty-left", tabIds: [], activeTabId: null },
      ...populated.groups,
      { id: "empty-bottom", tabIds: [], activeTabId: null },
    ],
    splitTree: {
      type: "split",
      axis: "x",
      ratio: 0.4,
      first: { type: "group", groupId: "empty-left" },
      second: {
        type: "split",
        axis: "y",
        ratio: 0.6,
        first: { type: "group", groupId: "group-main" },
        second: { type: "group", groupId: "empty-bottom" },
      },
    },
  };
  const innerClosed = removeEmptyGroup(board, "empty-bottom");
  assert.equal(innerClosed.splitTree.ratio, 0.4);
  assert.equal(innerClosed.splitTree.second.groupId, "group-main");
  assert.equal(
    boardGeometry(innerClosed, 1200, 800).rects.get("group-main").height,
    800,
  );
  assertFillsBoard(innerClosed);
  const outerClosed = removeEmptyGroup(board, "empty-left");
  assert.equal(outerClosed.splitTree, board.splitTree.second);
  assert.equal(
    boardGeometry(outerClosed, 1200, 800).rects.get("group-main").width,
    1200,
  );
  assertFillsBoard(outerClosed);
  assertFillsBoard(removeEmptyGroup(innerClosed, "empty-left"));
  assertFillsBoard(removeEmptyGroup(outerClosed, "empty-bottom"));
});
