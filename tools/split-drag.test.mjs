import test from "node:test";
import assert from "node:assert/strict";
import {
  addPane,
  emptyBoard,
  boardSchema,
  moveTab,
  reconcileBoardLayout,
  restoreBoard,
} from "../plugin/shared/model.ts";
import {
  applyLayoutPreset,
  boardGeometry,
  canSplitTab,
  layoutTree,
  splitDropPosition,
  splitTab,
} from "../plugin/shared/layout.ts";
import { resizeSplitTree, splitGroupIds } from "../plugin/shared/split-tree.ts";

const resource = (id) => ({
  id,
  serverId: "host",
  workspaceId: id,
  workspaceName: id,
  title: id,
  target: { kind: "agent", agentId: id },
  state: { draft: `unsent-${id}` },
});
const base = applyLayoutPreset(
  ["a", "b", "c", "d"].reduce(
    (board, id) => addPane(board, resource(id)),
    emptyBoard,
  ),
  "two",
);
const left = base.groups[0].id,
  right = base.groups[1].id;
const position = ({ left, top, width, height }) => [left, top, width, height];

for (const edge of ["left", "right", "top", "bottom"]) {
  test(`dragging a Tab to the ${edge} splits only that pane, from two panes to three`, () => {
    const next = splitTab(base, "a", right, edge, "new");
    assert.equal(next.groups.length, 3);
    assert.equal(next.panes, base.panes);
    assert.equal(next.panes[0], base.panes[0]);
    assert.equal(
      next.groups.find((group) => group.id === "new").activeTabId,
      "a",
    );
    assert.equal(
      next.groups.find((group) => group.id === left).activeTabId,
      "b",
    );
    const before = boardGeometry(base, 1200, 800),
      after = boardGeometry(next, 1200, 800);
    assert.deepEqual(after.rects.get(left), before.rects.get(left));
    assert.deepEqual(
      position(after.rects.get("new")),
      {
        left: [600, 0, 300, 800],
        right: [900, 0, 300, 800],
        top: [600, 0, 600, 400],
        bottom: [600, 400, 600, 400],
      }[edge],
    );
    assert.equal(boardSchema.safeParse(next).success, true);
    assert.deepEqual(restoreBoard(JSON.parse(JSON.stringify(next))), next);
  });
}

test("a Tab can be split off its own group without closing any other Tab", () => {
  const next = splitTab(base, "a", left, "bottom", "own");
  assert.deepEqual(next.groups.find((group) => group.id === left).tabIds, [
    "b",
  ]);
  assert.deepEqual(
    position(boardGeometry(next, 1200, 800).rects.get(right)),
    [600, 0, 600, 800],
  );
  assert.equal(splitTab(next, "a", "own", "left", "noop"), next);
});

test("nested splits resize independently and collapse when their last Tab moves out", () => {
  const three = splitTab(base, "a", right, "bottom", "bottom");
  const four = splitTab(three, "c", "bottom", "left", "nested");
  const geometry = boardGeometry(four, 1200, 800);
  const divider = geometry.dividers.find(
    (divider) => divider.axis === "x" && divider.treePath !== "",
  );
  const resized = {
    ...four,
    splitTree: resizeSplitTree(four.splitTree, divider.treePath, 0.7),
  };
  const resizedGeometry = boardGeometry(resized, 1200, 800);
  assert.deepEqual(resizedGeometry.rects.get(left), geometry.rects.get(left));
  assert.equal(resizedGeometry.rects.get("nested").width, 420);
  assert.equal(resizedGeometry.rects.get("bottom").width, 180);
  const merged = moveTab(resized, "c", "bottom");
  assert.equal(merged.groups.length, 3);
  assert.deepEqual(
    position(boardGeometry(merged, 1200, 800).rects.get("bottom")),
    [600, 400, 600, 400],
  );
  assert.equal(merged.panes, base.panes);
  assert.equal(boardSchema.safeParse(merged).success, true);
});

test("moving a singleton to an edge removes its former pane and respects the eight-pane limit", () => {
  let board = splitTab(base, "a", right, "bottom", "single");
  const moved = splitTab(board, "a", left, "top", "moved");
  assert.equal(moved.groups.length, board.groups.length);
  assert.ok(!splitGroupIds(moved.splitTree).includes("single"));
  for (let i = 0; i < 5; i++)
    board = {
      ...board,
      groups: [
        ...board.groups,
        { id: `empty-${i}`, tabIds: [], activeTabId: null },
      ],
    };
  board = reconcileBoardLayout(board);
  assert.equal(canSplitTab(board.groups, "c", left), false);
  assert.equal(splitTab(board, "c", left, "right", "too-many"), board);
  assert.equal(canSplitTab(board.groups, "a", left), true);
  assert.equal(
    boardSchema.safeParse(splitTab(board, "a", left, "right", "replace"))
      .success,
    true,
  );
});

test("converting track layouts preserves every rectangle, including the full-width last row", () => {
  for (const preset of ["two", "three", "four", "grid"]) {
    const board = applyLayoutPreset(base, preset);
    assert.deepEqual(
      boardGeometry({ ...board, splitTree: layoutTree(board) }, 1200, 800)
        .rects,
      boardGeometry(board, 1200, 800).rects,
    );
  }
  const board = {
    ...base,
    groups: [...base.groups, { id: "empty", tabIds: [], activeTabId: null }],
    layout: "auto",
  };
  assert.deepEqual(
    boardGeometry({ ...board, splitTree: layoutTree(board) }, 1200, 800).rects,
    boardGeometry(board, 1200, 800).rects,
  );
});

test("presets, new resources, and closed empty groups stay compatible with a split layout", () => {
  const board = splitTab(base, "a", right, "bottom", "new");
  const added = addPane(board, resource("extra"), {
    groupId: left,
    newGroupId: "extra-group",
  });
  assert.equal(boardSchema.safeParse(added).success, true);
  const closed = reconcileBoardLayout({
    ...added,
    groups: added.groups.filter((group) => group.id !== "extra-group"),
    panes: added.panes.filter((pane) => pane.id !== "extra"),
  });
  assert.equal(boardSchema.safeParse(closed).success, true);
  assert.deepEqual(closed.splitTree, board.splitTree);
  assert.equal(applyLayoutPreset(board, "three").splitTree, undefined);
  assert.equal(splitTab(board, "missing", right, "left", "stale"), board);
  assert.equal(splitTab(board, "b", "missing", "left", "stale"), board);
  assert.equal(splitTab(board, "b", right, "left", left), board);
  assert.equal(
    restoreBoard({
      ...board,
      splitTree: { type: "group", groupId: "missing" },
    }),
    null,
  );
});

test("drop zones match the native center, four edges, corner priority, and invalid coordinates", () => {
  for (const [x, y, expected] of [
    [500, 400, "center"],
    [20, 400, "left"],
    [990, 400, "right"],
    [500, 15, "top"],
    [500, 799, "bottom"],
    [2, 2, "left"],
    [900, 2, "right"],
    [200, 150, "top"],
    [-1, 300, null],
    [500, 801, null],
    [NaN, 100, null],
  ])
    assert.equal(splitDropPosition(1000, 800, x, y), expected);
});
