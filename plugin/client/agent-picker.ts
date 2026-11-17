import type { PaseoAgent } from "./paseo-types";
import type { NativeStatusBucket } from "./native-types";

export const agentGroups = [
  { key: "needs_input", label: "需要处理", icon: "CircleHelp" },
  { key: "attention", label: "未读", icon: "CircleDot" },
  { key: "running", label: "正在运行", icon: "Activity" },
  { key: "background", label: "后台任务", icon: "Layers" },
  { key: "recent", label: "最近会话", icon: "History" },
] as const;
export type AgentGroup = (typeof agentGroups)[number]["key"];
export type AgentFilter = "all" | Exclude<AgentGroup, "recent">;
type AgentActivity = Pick<PaseoAgent, "status"> &
  Partial<
    Pick<
      PaseoAgent,
      "backgroundWork" | "pendingPermissions" | "attentionReason"
    >
  >;

export function pickerAgentActivity(
  agent: AgentActivity,
  native: NativeStatusBucket | null = null,
) {
  const backgroundCount = agent.backgroundWork?.count ?? 0;
  const waiting =
    native === "needs_input" ||
    Boolean(agent.pendingPermissions?.length) ||
    agent.attentionReason === "permission";
  const failed = native === "failed" || agent.status === "error";
  const running = agent.status === "running" || agent.status === "initializing";
  // Unread is local to the client. A daemon's "finished" attention flag can
  // remain set after reading, so it must not stand in for the native indicator.
  const group: AgentGroup =
    waiting || failed
      ? "needs_input"
      : native === "attention"
        ? "attention"
        : running
          ? "running"
          : backgroundCount > 0
            ? "background"
            : "recent";
  const badge = waiting
    ? "等待回复或审批"
    : failed
      ? "运行失败"
      : group === "attention"
        ? "未读"
        : running
          ? agent.status === "initializing"
            ? "启动中"
            : "运行中"
          : backgroundCount > 0
            ? `后台任务 ${backgroundCount}`
            : null;
  const status: NativeStatusBucket | null = waiting
    ? "needs_input"
    : failed
      ? "failed"
      : group === "attention"
        ? "attention"
        : running
          ? "running"
          : null;
  return { group, badge, status, backgroundCount, running };
}

export function groupPickerAgents(
  agents: readonly PaseoAgent[],
  statuses: Record<string, NativeStatusBucket | null>,
  filter: AgentFilter = "all",
  openedAgentDecks: ReadonlyMap<string, number> = new Map(),
) {
  const eligible = agents.filter(
    (agent) => !agent.archivedAt && !agent.background && agent.workspaceId,
  );
  return agentGroups
    .filter((group) => filter === "all" || group.key === filter)
    .map((group) => ({
      ...group,
      agents: eligible
        .filter(
          (agent) =>
            pickerAgentActivity(agent, statuses[agent.id]).group === group.key,
        )
        .sort((a, b) => {
          const firstDeck = openedAgentDecks.get(a.id);
          const secondDeck = openedAgentDecks.get(b.id);
          if (firstDeck !== secondDeck)
            return (firstDeck ?? Infinity) - (secondDeck ?? Infinity);
          const first =
            a.attentionTimestamp ?? a.lastUserMessageAt ?? a.updatedAt;
          const second =
            b.attentionTimestamp ?? b.lastUserMessageAt ?? b.updatedAt;
          return second.localeCompare(first) || a.id.localeCompare(b.id);
        }),
    }));
}

// Keep the lightweight directory current for status-only updates, including
// 0.16 background work, without rebuilding it for every streamed token.
export function sameAgentDirectoryEntry(a: PaseoAgent, b: PaseoAgent) {
  return (
    a.title === b.title &&
    a.status === b.status &&
    a.workspaceId === b.workspaceId &&
    a.cwd === b.cwd &&
    a.background === b.background &&
    (a.backgroundWork?.count ?? 0) === (b.backgroundWork?.count ?? 0) &&
    a.requiresAttention === b.requiresAttention &&
    a.attentionReason === b.attentionReason &&
    a.attentionTimestamp === b.attentionTimestamp &&
    a.lastUserMessageAt === b.lastUserMessageAt &&
    a.pendingPermissions.length === b.pendingPermissions.length
  );
}
