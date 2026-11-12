import { z } from "zod";

export type SplitNode =
  | { type: "group"; groupId: string }
  | {
      type: "split";
      axis: "x" | "y";
      ratio: number;
      first: SplitNode;
      second: SplitNode;
    };

export const splitNodeSchema: z.ZodType<SplitNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("group"), groupId: z.string().min(1) }),
    z.object({
      type: z.literal("split"),
      axis: z.enum(["x", "y"]),
      ratio: z.number().positive().lt(1),
      first: splitNodeSchema,
      second: splitNodeSchema,
    }),
  ]),
);

export function splitGroupIds(node: SplitNode): string[] {
  return node.type === "group"
    ? [node.groupId]
    : [...splitGroupIds(node.first), ...splitGroupIds(node.second)];
}

// Collapse only branches whose pane disappeared, leaving the rest in place.
export function retainSplitGroups(
  node: SplitNode,
  ids: Set<string>,
): SplitNode | null {
  if (node.type === "group") return ids.has(node.groupId) ? node : null;
  const first = retainSplitGroups(node.first, ids),
    second = retainSplitGroups(node.second, ids);
  if (!first) return second;
  if (!second) return first;
  return first === node.first && second === node.second
    ? node
    : { ...node, first, second };
}

export function reconcileSplitTree(
  node: SplitNode,
  groupIds: string[],
  axis: "x" | "y",
): SplitNode {
  let next = retainSplitGroups(node, new Set(groupIds));
  const present = new Set(next ? splitGroupIds(next) : []);
  for (const groupId of groupIds) {
    if (present.has(groupId)) continue;
    const leaf: SplitNode = { type: "group", groupId };
    next = next
      ? { type: "split", axis, ratio: 0.5, first: next, second: leaf }
      : leaf;
  }
  return next!;
}

export function replaceSplitGroup(
  node: SplitNode,
  groupId: string,
  replacement: SplitNode,
): SplitNode {
  if (node.type === "group")
    return node.groupId === groupId ? replacement : node;
  const first = replaceSplitGroup(node.first, groupId, replacement),
    second = replaceSplitGroup(node.second, groupId, replacement);
  return first === node.first && second === node.second
    ? node
    : { ...node, first, second };
}

export function resizeSplitTree(
  node: SplitNode,
  path: string,
  ratio: number,
): SplitNode {
  if (node.type !== "split") return node;
  if (!path) return { ...node, ratio: Math.max(0.05, Math.min(0.95, ratio)) };
  const side = path[0] === "0" ? "first" : "second";
  return { ...node, [side]: resizeSplitTree(node[side], path.slice(1), ratio) };
}

export function equalizeSplitTree(node: SplitNode): SplitNode {
  if (node.type === "group") return node;
  return {
    ...node,
    ratio: 0.5,
    first: equalizeSplitTree(node.first),
    second: equalizeSplitTree(node.second),
  };
}
