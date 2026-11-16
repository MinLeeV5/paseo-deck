import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { PaseoAgent, PaseoWorkspace } from "./paseo-types";

export const WORKSPACE_AUTO_TITLE = "paseo-deck.auto-title";
export const initialWorkspaceAutoTitle = { agentId: null, title: null };
type AutoTitle = { agentId: string | null; title: string | null };
type WorkspaceHandle = Pick<
  ReturnType<PluginClientContext["paseo"]["workspaces"]["ref"]>,
  "refresh" | "setTitle" | "setMetadata"
>;

// Empty Deck workspaces predate this marker too. Adopt them once, then keep
// following their first conversation only while the user has not renamed them.
export function nextWorkspaceAutoTitle(
  workspace: PaseoWorkspace,
  agents: Iterable<PaseoAgent>,
  joined: boolean,
): { agentId: string; title: string } | null {
  if (workspace.internal || workspace.background || workspace.archivingAt)
    return null;
  const value = workspace.metadata?.[WORKSPACE_AUTO_TITLE];
  let previous: AutoTitle;
  if (value === undefined) {
    if (!joined || workspace.title) return null;
    previous = initialWorkspaceAutoTitle;
  } else {
    if (!value || typeof value !== "object") return null;
    const marker = value as Partial<AutoTitle>;
    if (
      !(marker.agentId === null || typeof marker.agentId === "string") ||
      !(marker.title === null || typeof marker.title === "string")
    )
      return null;
    previous = marker as AutoTitle;
  }
  if ((workspace.title || null) !== previous.title) return null;
  const first = [...agents]
    .filter(
      (agent) =>
        agent.workspaceId === workspace.id &&
        !agent.background &&
        !agent.archivedAt &&
        !agent.labels?.["paseo.parent-agent-id"] &&
        (!previous.agentId || agent.id === previous.agentId),
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )[0];
  const title = first?.title?.trim();
  return first?.lastUserMessageAt && title && title !== workspace.title
    ? { agentId: first.id, title }
    : null;
}

export function createWorkspaceAutoTitles(
  ref: (id: string) => WorkspaceHandle,
  joined: (id: string) => boolean,
  reportError: (error: unknown) => void,
) {
  const workspaces = new Map<string, PaseoWorkspace>();
  const agents = new Map<string, PaseoAgent>();
  const pending = new Map<string, Promise<void>>();
  const dirty = new Set<string>();
  const failed = new Map<string, string>();
  let stopped = false;
  const remember = (workspace: PaseoWorkspace) => {
    const old = workspaces.get(workspace.id);
    if (
      old?.syncSeq !== undefined &&
      workspace.syncSeq !== undefined &&
      old.syncSeq > workspace.syncSeq
    )
      return;
    workspaces.set(workspace.id, workspace);
  };
  const next = (id: string) => {
    const workspace = workspaces.get(id);
    return workspace
      ? nextWorkspaceAutoTitle(workspace, agents.values(), joined(id))
      : null;
  };
  const check = (id: string) => {
    if (stopped) return;
    if (pending.has(id)) {
      dirty.add(id);
      return;
    }
    const change = next(id);
    if (!change || failed.get(id) === change.title) return;
    dirty.add(id);
    const job = Promise.resolve().then(async () => {
      let attemptedTitle = change.title;
      try {
        while (!stopped && dirty.delete(id)) {
          const workspace = ref(id);
          const snapshot = await workspace.refresh();
          if (stopped || !snapshot) break;
          remember(snapshot);
          const change = next(id);
          if (!change) break;
          attemptedTitle = change.title;
          await workspace.setTitle(change.title);
          if (stopped) break;
          await workspace.setMetadata({ [WORKSPACE_AUTO_TITLE]: change });
          if (stopped) break;
          const updated = await workspace.refresh();
          if (stopped || !updated) break;
          remember(updated);
          // A generated Agent title may arrive while the previous write is in flight.
          if (next(id)) dirty.add(id);
        }
      } catch (error) {
        failed.set(id, attemptedTitle);
        if (!stopped) reportError(error);
      } finally {
        pending.delete(id);
        dirty.delete(id);
      }
    });
    pending.set(id, job);
  };
  return {
    workspace(workspace: PaseoWorkspace) {
      remember(workspace);
      check(workspace.id);
    },
    agent(agent: PaseoAgent) {
      const old = agents.get(agent.id);
      if (old && old.updatedAt > agent.updatedAt) return;
      agents.set(agent.id, agent);
      if (
        old &&
        old.title === agent.title &&
        old.workspaceId === agent.workspaceId &&
        old.lastUserMessageAt === agent.lastUserMessageAt &&
        old.background === agent.background &&
        old.archivedAt === agent.archivedAt &&
        old.labels?.["paseo.parent-agent-id"] ===
          agent.labels?.["paseo.parent-agent-id"]
      )
        return;
      if (agent.workspaceId) check(agent.workspaceId);
    },
    board() {
      for (const id of workspaces.keys()) check(id);
    },
    retry() {
      failed.clear();
      for (const id of workspaces.keys()) check(id);
    },
    removeAgent(id: string) {
      agents.delete(id);
    },
    removeWorkspace(id: string) {
      workspaces.delete(id);
      failed.delete(id);
    },
    dispose() {
      stopped = true;
      dirty.clear();
      workspaces.clear();
      agents.clear();
      failed.clear();
    },
    async settled() {
      await Promise.all(pending.values());
    },
  };
}
