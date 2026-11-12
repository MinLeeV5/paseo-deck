import { z } from "zod";

export const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("agent"), agentId: z.string().min(1) }),
  z.object({ kind: z.literal("draft"), draftId: z.string().min(1) }),
  z.object({ kind: z.literal("terminal"), terminalId: z.string().min(1) }),
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1),
    lineStart: z.number().optional(),
    lineEnd: z.number().optional(),
  }),
  z.object({ kind: z.literal("files") }),
  z.object({
    kind: z.literal("working_diff"),
    focusPath: z.string().optional(),
  }),
  z.object({
    kind: z.literal("provider_subagent"),
    parentAgentId: z.string(),
    subagentId: z.string(),
  }),
]);

export const paneSchema = z.object({
  id: z.string().min(1),
  serverId: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceName: z.string(),
  title: z.string(),
  target: targetSchema,
  state: z.json().optional(),
});
export const groupSchema = z.object({
  id: z.string().min(1),
  tabIds: z.array(z.string().min(1)).max(8),
  activeTabId: z.string().nullable(),
});
const layoutShape = {
  panes: z.array(paneSchema).max(8),
  direction: z.enum(["row", "column"]),
  ratio: z.number().min(0.2).max(0.8),
};
export const legacyBoardSchema = z.object({
  version: z.literal(1),
  ...layoutShape,
});
export const boardSchema = z
  .object({
    version: z.literal(2),
    ...layoutShape,
    groups: z.array(groupSchema).min(1).max(8),
  })
  .superRefine((board, context) => {
    const ids = new Set(board.panes.map((pane) => pane.id));
    const assigned = board.groups.flatMap((group) => group.tabIds);
    if (
      ids.size !== board.panes.length ||
      new Set(assigned).size !== assigned.length ||
      assigned.length !== ids.size ||
      assigned.some((id) => !ids.has(id)) ||
      new Set(board.groups.map((group) => group.id)).size !==
        board.groups.length ||
      board.groups.some((group) =>
        group.tabIds.length
          ? !group.activeTabId || !group.tabIds.includes(group.activeTabId)
          : group.activeTabId !== null,
      )
    )
      context.addIssue({
        code: "custom",
        message: "分屏与 Tab 的资源身份无效",
      });
  });
export type Target = z.infer<typeof targetSchema>;
export type Pane = z.infer<typeof paneSchema>;
export type TabGroup = z.infer<typeof groupSchema>;
export type Board = z.infer<typeof boardSchema>;
export const emptyBoard: Board = {
  version: 2,
  panes: [],
  groups: [{ id: "group-main", tabIds: [], activeTabId: null }],
  direction: "row",
  ratio: 0.5,
};

export function restoreBoard(value: unknown): Board | null {
  const current = boardSchema.safeParse(value);
  if (current.success) return current.data;
  const legacy = legacyBoardSchema.safeParse(value);
  if (!legacy.success) return null;
  return {
    ...legacy.data,
    version: 2,
    groups: legacy.data.panes.length
      ? legacy.data.panes.map((pane) => ({
          id: `group:${pane.id}`,
          tabIds: [pane.id],
          activeTabId: pane.id,
        }))
      : emptyBoard.groups,
  };
}
export function resourceKey(
  pane: Pick<Pane, "serverId" | "workspaceId" | "target">,
): string {
  return `${pane.serverId}:${pane.workspaceId}:${JSON.stringify(pane.target)}`;
}
export function activateTab(board: Board, tabId: string): Board {
  const group = board.groups.find((group) => group.tabIds.includes(tabId));
  if (!group || group.activeTabId === tabId) return board;
  return {
    ...board,
    groups: board.groups.map((item) =>
      item === group ? { ...item, activeTabId: tabId } : item,
    ),
  };
}
export function addPane(
  board: Board,
  pane: Pane,
  destination?: { groupId: string; newGroupId?: string },
): Board {
  const duplicate = board.panes.find(
    (item) => resourceKey(item) === resourceKey(pane),
  );
  if (duplicate) return activateTab(board, duplicate.id);
  if (board.panes.length >= 8)
    throw new Error("最多打开 8 个资源 Tab，请先关闭一个 Tab。");
  if (destination?.newGroupId && board.groups.length >= 8)
    throw new Error("最多显示 8 个分屏。");
  const groupId = destination?.groupId ?? board.groups[0].id;
  if (
    !destination?.newGroupId &&
    !board.groups.some((group) => group.id === groupId)
  )
    throw new Error("目标分屏已关闭，请重新选择。");
  return {
    ...board,
    panes: [...board.panes, pane],
    groups: destination?.newGroupId
      ? [
          ...board.groups,
          {
            id: destination.newGroupId,
            tabIds: [pane.id],
            activeTabId: pane.id,
          },
        ]
      : board.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                tabIds: [...group.tabIds, pane.id],
                activeTabId: pane.id,
              }
            : group,
        ),
  };
}
export function removeTab(board: Board, tabId: string): Board {
  const group = board.groups.find((group) => group.tabIds.includes(tabId));
  if (!group) return board;
  const index = group.tabIds.indexOf(tabId);
  const tabIds = group.tabIds.filter((id) => id !== tabId);
  return {
    ...board,
    panes: board.panes.filter((pane) => pane.id !== tabId),
    groups: board.groups.map((item) =>
      item === group
        ? {
            ...group,
            tabIds,
            activeTabId:
              group.activeTabId === tabId
                ? (tabIds[index] ?? tabIds[index - 1] ?? null)
                : group.activeTabId,
          }
        : item,
    ),
  };
}
export function moveTab(
  board: Board,
  tabId: string,
  destinationId: string,
  create = false,
  index?: number,
): Board {
  const source = board.groups.find((group) => group.tabIds.includes(tabId));
  if (!source) return board;
  // The insertion index is measured after removing the moving Tab.
  const insert = (ids: string[]) => {
    const next = [...ids];
    const at =
      index === undefined || !Number.isFinite(index)
        ? ids.length
        : Math.max(0, Math.min(ids.length, Math.trunc(index)));
    next.splice(at, 0, tabId);
    return next;
  };
  if (source.id === destinationId) {
    if (index === undefined) return board;
    const tabIds = insert(source.tabIds.filter((id) => id !== tabId));
    if (tabIds.every((id, i) => id === source.tabIds[i])) return board;
    return {
      ...board,
      groups: board.groups.map((group) =>
        group === source ? { ...group, tabIds } : group,
      ),
    };
  }
  if (create && board.groups.some((group) => group.id === destinationId))
    return board;
  if (create && board.groups.length >= 8 && source.tabIds.length > 1)
    throw new Error("最多显示 8 个分屏。");
  if (!create && !board.groups.some((group) => group.id === destinationId))
    return board;
  const without = removeTab(board, tabId);
  const groups = without.groups.map((group) =>
    group.id === destinationId
      ? { ...group, tabIds: insert(group.tabIds), activeTabId: tabId }
      : group,
  );
  if (create)
    groups.push({ id: destinationId, tabIds: [tabId], activeTabId: tabId });
  return {
    ...board,
    groups: groups.filter(
      (group) => group.id !== source.id || group.tabIds.length > 0,
    ),
  };
}

// Resolve the current build, never a hard-coded Metro ID from another release.
export function findMetroModule(source: string, exportName: string): number {
  for (const pattern of [`.${exportName}=`, `\"${exportName}\"`]) {
    let offset = source.indexOf(pattern);
    while (offset !== -1) {
      const begin = source.lastIndexOf("\n__d(", offset);
      const end = source.indexOf("\n__d(", offset);
      if (begin >= 0) {
        const text = source.slice(begin, end < 0 ? undefined : end);
        const match = text.match(/},(\d+),\[[\d,]*\]\);\s*$/);
        if (match) return Number(match[1]);
      }
      offset = source.indexOf(pattern, offset + pattern.length);
    }
  }
  throw new Error(`此 Paseo 构建没有可识别的 ${exportName} 入口。`);
}
