import { MAX_SPLITS, moveTab, type Board, type TabGroup } from "./model.ts";
import {
  replaceSplitGroup,
  retainSplitGroups,
  type SplitNode,
} from "./split-tree.ts";

export type LayoutPreset = "two" | "three" | "four" | "grid";
export type Axis = "x" | "y";
export type SplitEdge = "left" | "right" | "top" | "bottom";
export type LayoutRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  insetX: number;
  insetY: number;
};
type LayoutInput = Pick<
  Board,
  | "groups"
  | "direction"
  | "ratio"
  | "layout"
  | "columnWeights"
  | "rowWeights"
  | "splitTree"
>;
export type LayoutDividerGeometry = {
  id: string;
  axis: Axis;
  boundary: number;
  rect: LayoutRect;
  treePath?: string;
  ratio?: number;
  dimension?: number;
};
const normalized = (
  values: number[] | undefined,
  count: number,
  fallback?: number[],
) => {
  const usable =
    values?.length === count &&
    values.every((value) => Number.isFinite(value) && value > 0)
      ? values
      : (fallback ?? Array.from({ length: count }, () => 1 / count));
  const sum = usable.reduce((total, value) => total + value, 0);
  return usable.map((value) => value / sum);
};
export function layoutTracks(board: LayoutInput) {
  const count = board.groups.length;
  const columns =
    board.layout === "three"
      ? Math.min(3, count)
      : board.layout === "four"
        ? Math.min(4, count)
        : board.layout === "two" || board.layout === "grid"
          ? Math.min(2, count)
          : board.direction === "row"
            ? Math.min(2, count)
            : 1;
  const rows = Math.ceil(count / columns);
  const columnWeights = normalized(
    board.columnWeights,
    columns,
    columns === 2 ? [board.ratio, 1 - board.ratio] : undefined,
  );
  const verticalPairs =
    board.direction === "column" && (!board.layout || board.layout === "auto");
  const pairs = Math.ceil(count / 2);
  const rowWeights = normalized(
    board.rowWeights,
    rows,
    verticalPairs
      ? board.groups.map((_group, index) =>
          index === count - 1 && index % 2 === 0
            ? 1 / pairs
            : (index % 2 === 0 ? board.ratio : 1 - board.ratio) / pairs,
        )
      : undefined,
  );
  return { columns, rows, columnWeights, rowWeights };
}
export function boardGeometry(
  board: LayoutInput,
  width: number,
  height: number,
) {
  const tracks = layoutTracks(board);
  const starts = (weights: number[], size: number) =>
    weights.reduce<number[]>(
      (out, _weight, index) => [
        ...out,
        index === 0 ? 0 : out[index - 1] + weights[index - 1] * size,
      ],
      [],
    );
  const xs = starts(tracks.columnWeights, width),
    ys = starts(tracks.rowWeights, height);
  const rects = new Map<string, LayoutRect>();
  const dividers: LayoutDividerGeometry[] = [];
  if (board.splitTree) {
    const walk = (node: SplitNode, rect: LayoutRect, path: string) => {
      if (node.type === "group") {
        rects.set(node.groupId, rect);
        return;
      }
      const horizontal = node.axis === "x";
      const first = {
        ...rect,
        width: horizontal ? rect.width * node.ratio : rect.width,
        height: horizontal ? rect.height : rect.height * node.ratio,
      };
      const second = {
        ...rect,
        left: rect.left + (horizontal ? first.width : 0),
        top: rect.top + (horizontal ? 0 : first.height),
        width: rect.width - (horizontal ? first.width : 0),
        height: rect.height - (horizontal ? 0 : first.height),
        insetX: horizontal ? 4 : rect.insetX,
        insetY: horizontal ? rect.insetY : 4,
      };
      dividers.push({
        id: `tree-${path || "root"}`,
        axis: node.axis,
        boundary: 1,
        rect: second,
        treePath: path,
        ratio: node.ratio,
        dimension: horizontal ? rect.width : rect.height,
      });
      walk(node.first, first, `${path}0`);
      walk(node.second, second, `${path}1`);
    };
    walk(
      board.splitTree,
      { left: 0, top: 0, width, height, insetX: 0, insetY: 0 },
      "",
    );
    return { ...tracks, rects, dividers };
  }
  board.groups.forEach((group, index) => {
    const column = index % tracks.columns,
      row = Math.floor(index / tracks.columns);
    const span =
      column === 0 && index + 1 === board.groups.length && tracks.columns > 1;
    const rect = {
      left: xs[column],
      top: ys[row],
      width: span ? width : tracks.columnWeights[column] * width,
      height: tracks.rowWeights[row] * height,
      insetX: column > 0 ? 4 : 0,
      insetY: row > 0 ? 4 : 0,
    };
    rects.set(group.id, rect);
    if (column > 0)
      dividers.push({
        id: `x-${row}-${column}`,
        axis: "x",
        boundary: column,
        rect,
      });
    if (column === 0 && row > 0)
      dividers.push({
        id: `y-${row}`,
        axis: "y",
        boundary: row,
        rect: { ...rect, width },
      });
  });
  return { ...tracks, rects, dividers };
}

// Convert the existing tracks only when a local split is requested. Legacy and
// preset layouts retain their geometry and divider behavior until that point.
export function layoutTree(board: LayoutInput): SplitNode {
  if (board.splitTree) return board.splitTree;
  const tracks = layoutTracks(board);
  const chain = (
    nodes: SplitNode[],
    weights: number[],
    axis: Axis,
  ): SplitNode => {
    if (nodes.length === 1) return nodes[0];
    return {
      type: "split",
      axis,
      ratio: weights[0] / weights.reduce((sum, value) => sum + value, 0),
      first: nodes[0],
      second: chain(nodes.slice(1), weights.slice(1), axis),
    };
  };
  const rows: SplitNode[] = [];
  for (let index = 0; index < board.groups.length; index += tracks.columns) {
    const leaves = board.groups
      .slice(index, index + tracks.columns)
      .map((group): SplitNode => ({ type: "group", groupId: group.id }));
    rows.push(chain(leaves, tracks.columnWeights.slice(0, leaves.length), "x"));
  }
  return chain(rows, tracks.rowWeights, "y");
}

export function canSplitTab(
  groups: TabGroup[],
  tabId: string,
  targetGroupId: string,
): boolean {
  const source = groups.find((group) => group.tabIds.includes(tabId));
  const target = groups.find((group) => group.id === targetGroupId);
  return Boolean(
    source &&
      target &&
      (source !== target || source.tabIds.length > 1) &&
      groups.length + (source.tabIds.length > 1 ? 1 : 0) <= MAX_SPLITS,
  );
}

export function splitTab(
  board: Board,
  tabId: string,
  targetGroupId: string,
  edge: SplitEdge,
  newGroupId: string,
): Board {
  if (
    !canSplitTab(board.groups, tabId, targetGroupId) ||
    board.groups.some((group) => group.id === newGroupId)
  )
    return board;
  const next = moveTab(board, tabId, newGroupId, true);
  const tree = retainSplitGroups(
    layoutTree(board),
    new Set(
      next.groups
        .filter((group) => group.id !== newGroupId)
        .map((group) => group.id),
    ),
  )!;
  const existing: SplitNode = { type: "group", groupId: targetGroupId },
    added: SplitNode = { type: "group", groupId: newGroupId };
  const before = edge === "left" || edge === "top";
  const replacement: SplitNode = {
    type: "split",
    axis: edge === "left" || edge === "right" ? "x" : "y",
    ratio: 0.5,
    first: before ? added : existing,
    second: before ? existing : added,
  };
  const groups = next.groups.filter((group) => group.id !== newGroupId);
  groups.splice(
    groups.findIndex((group) => group.id === targetGroupId) + (before ? 0 : 1),
    0,
    next.groups.find((group) => group.id === newGroupId)!,
  );
  return {
    ...next,
    groups,
    layout: "auto",
    splitTree: replaceSplitGroup(tree, targetGroupId, replacement),
  };
}

// Match Paseo's workspace: a central merge zone, outer 15% edge bands, then
// whichever edge is nearest. The Tab strip is handled separately and wins.
export function splitDropPosition(
  width: number,
  height: number,
  x: number,
  y: number,
): SplitEdge | "center" | null {
  if (
    ![width, height, x, y].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    x < 0 ||
    x > width ||
    y < 0 ||
    y > height
  )
    return null;
  if (
    x >= width * 0.3 &&
    x <= width * 0.7 &&
    y >= height * 0.3 &&
    y <= height * 0.7
  )
    return "center";
  if (x <= width * 0.15) return "left";
  if (x >= width * 0.85) return "right";
  if (y <= height * 0.15) return "top";
  if (y >= height * 0.85) return "bottom";
  const edges: { edge: SplitEdge; distance: number }[] = [
    { edge: "left", distance: x },
    { edge: "right", distance: width - x },
    { edge: "top", distance: y },
    { edge: "bottom", distance: height - y },
  ];
  return edges.sort((a, b) => a.distance - b.distance)[0].edge;
}
// Redistribute references rather than recreate resources. Inspectors stay with
// their conversation, and each native resource keeps its existing pane ID.
export function applyLayoutPreset(
  board: Board,
  preset: LayoutPreset,
  focusedTabId?: string | null,
): Board {
  const count = preset === "two" ? 2 : preset === "three" ? 3 : 4;
  const ordered = board.groups.flatMap((group) => group.tabIds);
  const consumed = new Set<string>();
  const units: string[][] = [];
  for (const tabId of ordered) {
    if (consumed.has(tabId)) continue;
    const pane = board.panes.find((pane) => pane.id === tabId)!;
    const opener =
      pane.presentation === "inspector"
        ? board.panes.find(
            (value) =>
              value.id === pane.openerTabId &&
              value.workspaceId === pane.workspaceId,
          )
        : pane;
    const unit = opener
      ? [
          opener.id,
          ...board.panes
            .filter(
              (value) =>
                value.presentation === "inspector" &&
                value.openerTabId === opener.id &&
                value.workspaceId === opener.workspaceId,
            )
            .map((value) => value.id),
        ]
      : [tabId];
    const fresh = [...new Set(unit)].filter((id) => !consumed.has(id));
    fresh.forEach((id) => consumed.add(id));
    if (fresh.length) units.push(fresh);
  }
  const active = new Set(board.groups.map((group) => group.activeTabId));
  const usedIds = new Set<string>();
  let offset = 0;
  const groups: TabGroup[] = Array.from({ length: count }, (_unused, index) => {
    const take = Math.ceil((units.length - offset) / (count - index));
    const tabIds = units.slice(offset, offset + take).flat();
    offset += take;
    let id = board.groups[index]?.id ?? `group-${preset}-${index}`;
    while (usedIds.has(id)) id += "-next";
    usedIds.add(id);
    return {
      id,
      tabIds,
      activeTabId:
        focusedTabId && tabIds.includes(focusedTabId)
          ? focusedTabId
          : (tabIds.find((id) => active.has(id)) ?? tabIds[0] ?? null),
    };
  });
  return {
    ...board,
    groups,
    layout: preset,
    splitTree: undefined,
    direction: "row",
    ratio: 0.5,
    columnWeights: Array.from(
      { length: preset === "three" ? 3 : preset === "four" ? 4 : 2 },
      () => (preset === "three" ? 1 / 3 : preset === "four" ? 1 / 4 : 1 / 2),
    ),
    rowWeights: preset === "grid" ? [0.5, 0.5] : [1],
  };
}
