import {
  addPane,
  resourceKey,
  type Board,
  type Pane,
} from "../shared/model.ts";

export type DeckAgentEntry = {
  serverId: string;
  workspaceId: string;
  agentId: string;
  title: string;
  workspaceName: string;
  destination: "current" | "new";
};

export function addDeckAgent(
  board: Board,
  entry: DeckAgentEntry,
  focusedGroup?: string,
  makeId = () =>
    `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
) {
  const pane: Pane = {
    id: makeId(),
    serverId: entry.serverId,
    workspaceId: entry.workspaceId,
    workspaceName: entry.workspaceName,
    title: entry.title,
    target: { kind: "agent", agentId: entry.agentId },
  };
  const groupId = board.groups.some((group) => group.id === focusedGroup)
    ? focusedGroup!
    : board.groups[0].id;
  const next = addPane(board, pane, {
    groupId,
    newGroupId: entry.destination === "new" ? `group-${makeId()}` : undefined,
  });
  const opened = next.panes.find(
    (item) => resourceKey(item) === resourceKey(pane),
  )!;
  return {
    board: next,
    paneId: opened.id,
    groupId: next.groups.find((group) => group.tabIds.includes(opened.id))!.id,
  };
}

// Screens can be retained or not mounted yet when a native page adds an Agent.
// Keep one current layout per host so a later screen commit cannot overwrite it.
export function createBoardStore(load: (hostId: string) => Board) {
  const boards = new Map<string, Board>();
  const focus = new Map<string, string>();
  const listeners = new Set<() => void>();
  return {
    read(hostId: string) {
      let board = boards.get(hostId);
      if (!board) {
        board = load(hostId);
        boards.set(hostId, board);
      }
      return board;
    },
    publish(hostId: string, board: Board) {
      if (boards.get(hostId) === board) return;
      boards.set(hostId, board);
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    readFocus: (hostId: string) => focus.get(hostId),
    rememberFocus: (hostId: string, groupId: string) => {
      focus.set(hostId, groupId);
    },
  };
}
