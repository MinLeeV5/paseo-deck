import {
  activateTab,
  addPane,
  moveTab,
  resourceKey,
  type Board,
  type Pane,
  type Target,
} from "../shared/model.ts";

export type SubagentTarget = Extract<
  Target,
  { kind: "agent" | "provider_subagent" }
>;
export type AgentAddress = { serverId: string; agentId: string };
export type SubagentTrackProps = {
  onOpenSubagent(address: AgentAddress): void;
  onOpenProviderSubagent(parentAgentId: string, subagentId: string): void;
  [key: string]: unknown;
};
export type SubagentNavigation = {
  serverId: string;
  openAgent(agentId: string): void;
  openProviderSubagent(parentAgentId: string, subagentId: string): void;
};

// Scope the native track's callbacks instead of intercepting global navigation.
// Tracks rendered outside Deck, including a different host, keep their behavior.
export function scopeSubagentTrack(
  props: SubagentTrackProps,
  navigation: SubagentNavigation | null,
): SubagentTrackProps {
  if (!navigation) return props;
  return {
    ...props,
    onOpenSubagent(address) {
      if (address.serverId === navigation.serverId)
        navigation.openAgent(address.agentId);
      else props.onOpenSubagent(address);
    },
    onOpenProviderSubagent: navigation.openProviderSubagent,
  };
}

export function openSubagentTab(board: Board, sourceId: string, pane: Pane) {
  const group = board.groups.find((group) => group.tabIds.includes(sourceId));
  if (!group) return null;
  const existing = board.panes.find(
    (item) => resourceKey(item) === resourceKey(pane),
  );
  const tabId = existing?.id ?? pane.id;
  // Reuse the native content instance, even when the child is in another split.
  const next = existing
    ? activateTab(moveTab(board, tabId, group.id), tabId)
    : addPane(board, pane, { groupId: group.id });
  return { board: next, tabId, groupId: group.id };
}
