import type { PaseoAgent, PaseoWorkspace } from "./paseo-types";

export const NATIVE_DECK_JOIN = "paseo-deck.join";
export type NativeDeckJoin = {
  clientId: string;
  requestId: string;
  destination: "current" | "new";
};
export function readNativeDeckJoin(
  metadata: Record<string, unknown> | undefined,
) {
  const marker = metadata?.[NATIVE_DECK_JOIN];
  if (!marker || typeof marker !== "object") return null;
  const value = marker as Partial<NativeDeckJoin>;
  return typeof value.clientId === "string" &&
    typeof value.requestId === "string" &&
    (value.destination === "current" || value.destination === "new")
    ? (value as NativeDeckJoin)
    : null;
}

// The workspace and its first Agent can arrive in either order. An intent is
// consumed once, only by the client that selected it on the native create page.
export function createNativeWorkspaceJoins(
  clientId: string,
  join: (
    agent: PaseoAgent,
    workspace: PaseoWorkspace,
    destination: NativeDeckJoin["destination"],
  ) => void,
  reportError: (error: unknown) => void,
) {
  const workspaces = new Map<string, PaseoWorkspace>();
  const agents = new Map<string, PaseoAgent>();
  const consumed = new Set<string>();
  const check = (workspaceId: string) => {
    const workspace = workspaces.get(workspaceId);
    const marker = readNativeDeckJoin(workspace?.metadata);
    if (
      !workspace ||
      workspace.background ||
      workspace.internal ||
      workspace.archivingAt ||
      !marker ||
      marker.clientId !== clientId ||
      consumed.has(marker.requestId)
    )
      return;
    const agent = [...agents.values()]
      .filter(
        (a) => a.workspaceId === workspaceId && !a.archivedAt && !a.background,
      )
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )[0];
    if (!agent) return;
    consumed.add(marker.requestId);
    try {
      join(agent, workspace, marker.destination);
    } catch (error) {
      reportError(error);
    }
  };
  return {
    agent(agent: PaseoAgent) {
      const previous = agents.get(agent.id);
      if (previous && previous.updatedAt > agent.updatedAt) return;
      agents.set(agent.id, agent);
      if (agent.workspaceId) check(agent.workspaceId);
    },
    workspace(workspace: PaseoWorkspace) {
      const previous = workspaces.get(workspace.id);
      if (
        previous?.syncSeq !== undefined &&
        workspace.syncSeq !== undefined &&
        previous.syncSeq > workspace.syncSeq
      )
        return;
      workspaces.set(workspace.id, workspace);
      check(workspace.id);
    },
    removeAgent: (id: string) => {
      agents.delete(id);
    },
    removeWorkspace: (id: string) => {
      workspaces.delete(id);
    },
  };
}
