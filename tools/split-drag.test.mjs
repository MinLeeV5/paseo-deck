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
import {
  equalizeSplitTree,
  resizeSplitTree,
  splitGroupIds,
} from "../plugin/shared/split-tree.ts";

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
  test(`dragging a Tab to the ${edge} creates a pane and equalizes tracks in that direction`, () => {
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
    if (edge === "left" || edge === "right")
      for (const rect of after.rects.values()) {
        assert.ok(Math.abs(rect.width - 400) < 0.001);
        assert.equal(rect.height, 800);
      }
    else assert.deepEqual(after.rects.get(left), before.rects.get(left));
    assert.deepEqual(
      position(after.rects.get("new")),
      {
        left: [400, 0, 400, 800],
        right: [800, 0, 400, 800],
        top: [600, 0, 600, 400],
        bottom: [600, 400, 600, 400],
      }[edge],
    );
    assert.equal(boardSchema.safeParse(next).success, true);
    assert.deepEqual(restoreBoard(JSON.parse(JSON.stringify(next))), next);
  });
}

for (const axis of ["x", "y"]) {
  test(`new ${axis}-axis splits redistribute resized layouts equally from two through eight panes`, () => {
    let board = {
      ...applyLayoutPreset(
        Array.from({ length: 8 }, (_, index) => `tab-${index}`).reduce(
          (board, id) => addPane(board, resource(id)),
          emptyBoard,
        ),
        "two",
      ),
      direction: axis === "x" ? "row" : "column",
      layout: "auto",
      ratio: 0.7,
      columnWeights: axis === "x" ? [0.7, 0.3] : undefined,
      rowWeights: axis === "y" ? [0.7, 0.3] : undefined,
    };
    for (let count = 3; count <= 8; count++) {
      const source = board.groups.find((group) => group.tabIds.length > 1);
      const target = board.groups[count % 2 ? 0 : board.groups.length - 1];
      const edge =
        axis === "x"
          ? count % 2
            ? "left"
            : "right"
          : count % 2
            ? "top"
            : "bottom";
      board = splitTab(
        board,
        source.tabIds[0],
        target.id,
        edge,
        `new-${count}`,
      );
      assert.equal(board.groups.length, count);
      assert.equal(boardSchema.safeParse(board).success, true);
      for (const [width, height] of [
        [1200, 800],
        [375, 700],
      ]) {
        const rectangles = [
          ...boardGeometry(board, width, height).rects.values(),
        ];
        const size = axis === "x" ? "width" : "height";
        const start = axis === "x" ? "left" : "top";
        const trackSize = (axis === "x" ? width : height) / count;
        rectangles.sort((a, b) => a[start] - b[start]);
        rectangles.forEach((rect, index) => {
          assert.ok(Math.abs(rect[size] - trackSize) < 0.001);
          assert.ok(Math.abs(rect[start] - index * trackSize) < 0.001);
          assert.equal(
            rect[axis === "x" ? "height" : "width"],
            axis === "x" ? height : width,
          );
        });
      }
      board = {
        ...board,
        splitTree: resizeSplitTree(board.splitTree, "", 0.7),
      };
    }
  });
}

test("adding a column preserves row heights and balances each row independently", () => {
  const grid = addPane(
    {
      ...applyLayoutPreset(base, "grid"),
      columnWeights: [0.3, 0.7],
      rowWeights: [0.6, 0.4],
    },
    resource("extra"),
    { groupId: left },
  );
  const next = splitTab(grid, "extra", left, "right", "new");
  const rectangles = [...boardGeometry(next, 1200, 800).rects.values()];
  const top = rectangles.filter((rect) => rect.top === 0);
  const bottom = rectangles.filter((rect) => rect.top === 480);
  assert.equal(top.length, 3);
  assert.equal(bottom.length, 2);
  for (const rect of top) {
    assert.ok(Math.abs(rect.width - 400) < 0.001);
    assert.equal(rect.height, 480);
  }
  for (const rect of bottom) {
    assert.equal(rect.width, 600);
    assert.equal(rect.height, 320);
  }
  const equalized = boardGeometry(
    { ...next, splitTree: equalizeSplitTree(next.splitTree) },
    1200,
    800,
  );
  for (const rect of equalized.rects.values()) assert.equal(rect.height, 400);
});

test("moving a singleton to another edge preserves custom widths when no pane is added", () => {
  const three = splitTab(base, "a", right, "right", "single");
  const resized = {
    ...three,
    splitTree: resizeSplitTree(three.splitTree, "", 0.6),
  };
  const moved = splitTab(resized, "a", right, "left", "moved");
  assert.equal(moved.groups.length, resized.groups.length);
  assert.deepEqual(
    boardGeometry(moved, 1200, 800).rects.get(left),
    boardGeometry(resized, 1200, 800).rects.get(left),
  );
});

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
