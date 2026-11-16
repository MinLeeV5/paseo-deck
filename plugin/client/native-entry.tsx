import {
  useNewWorkspace,
  type PluginClientContext,
  type PluginComposerItemProps,
  type PluginNewWorkspaceItemProps,
  type PluginWorkspaceRowBadgeItemProps,
} from "@getpaseo/plugin/client";
import {
  Select,
  WorkspaceRowBadge,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { MAX_SPLITS } from "../shared/model";
import type { PaseoAgent, PaseoWorkspace } from "./paseo-types";
import {
  joinAgentToDeck,
  readBoardSnapshot,
  subscribeBoardSnapshot,
} from "./web";
import {
  NATIVE_DECK_JOIN,
  createNativeWorkspaceJoins,
  readNativeDeckJoin,
} from "./native-entry-state";

const requestId = () =>
  `native-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function installNativeDeckEntries(client: PluginClientContext) {
  if (
    Platform.OS !== "web" ||
    typeof client.addComposerItem !== "function" ||
    typeof client.addNewWorkspaceItem !== "function"
  )
    return () => {};
  const clientId = requestId();
  const cleanups: (() => void)[] = [];
  const releases: (() => Promise<void>)[] = [];
  const agents = new Map<string, PaseoAgent>();
  const workspaces = new Map<string, PaseoWorkspace>();
  const pills = new Map<
    string,
    {
      registration: ReturnType<PluginClientContext["addComposerPill"]>;
      workspaceId: string;
      joined: boolean;
    }
  >();
  let hostId: string | undefined,
    stopped = false;
  let notifyError = (error: unknown) =>
    console.error("[Paseo Deck native join]", error);
  const join = (
    agent: Pick<PaseoAgent, "id" | "workspaceId" | "title">,
    destination: "current" | "new",
    open: boolean,
  ) => {
    if (!hostId || !agent.workspaceId)
      throw new Error("此 Agent 尚未关联 workspace。");
    const workspace = workspaces.get(agent.workspaceId);
    const paneId = joinAgentToDeck({
      serverId: hostId,
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      title: agent.title ?? "未命名 Agent",
      workspaceName: workspace
        ? `${workspace.projectCustomName ?? workspace.projectDisplayName} / ${workspace.title ?? workspace.name}`
        : agent.workspaceId,
      destination,
    });
    if (open)
      client.openScreen({
        screenId: "main",
        params: { tabId: paneId, request: requestId() },
      });
  };
  const automatic = createNativeWorkspaceJoins(
    clientId,
    (agent, _workspace, destination) => join(agent, destination, false),
    (error) =>
      notifyError(
        new Error(
          `加入 Deck 失败：${error instanceof Error ? error.message : String(error)}。可在会话下方重试。`,
        ),
      ),
  );
  const syncPill = (agent: PaseoAgent) => {
    const previous = pills.get(agent.id);
    if (agent.archivedAt || agent.background || !agent.workspaceId) {
      previous?.registration.remove();
      pills.delete(agent.id);
      return;
    }
    const joined =
      !!hostId &&
      readBoardSnapshot(hostId).panes.some(
        (pane) =>
          pane.target.kind === "agent" && pane.target.agentId === agent.id,
      );
    if (
      previous &&
      previous.workspaceId === agent.workspaceId &&
      previous.joined === joined
    )
      return;
    const button = {
      title: joined ? "在 Deck 中打开" : "加入 Deck",
      icon: "PanelsTopLeft",
      behavior: joined
        ? {
            kind: "action" as const,
            onPress: () => join(agents.get(agent.id) ?? agent, "current", true),
          }
        : {
            kind: "menu" as const,
            items: (["current", "new"] as const).map((destination) => ({
              kind: "item" as const,
              id: destination,
              title: destination === "new" ? "添加到新分屏" : "添加到当前分屏",
              icon: destination === "new" ? "PanelRightOpen" : "PanelsTopLeft",
              behavior: {
                kind: "action" as const,
                onPress: () =>
                  join(agents.get(agent.id) ?? agent, destination, true),
              },
            })),
          },
    };
    if (previous && previous.workspaceId === agent.workspaceId) {
      previous.registration.update(button);
      previous.joined = joined;
    } else {
      previous?.registration.remove();
      const registration = client.addComposerPill({
        id: `join-${agent.id}`,
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        button,
      });
      pills.set(agent.id, {
        registration,
        workspaceId: agent.workspaceId,
        joined,
      });
    }
  };
  const ensureHost = (id: string) => {
    if (stopped || hostId) return;
    hostId = id;
    const applyAgent = (agent: PaseoAgent) => {
      if (stopped) return;
      const previous = agents.get(agent.id);
      if (previous && previous.updatedAt > agent.updatedAt) return;
      agents.set(agent.id, agent);
      syncPill(agent);
      automatic.agent(agent);
    };
    const applyWorkspace = (workspace: PaseoWorkspace) => {
      if (stopped) return;
      workspaces.set(workspace.id, workspace);
      automatic.workspace(workspace);
    };
    cleanups.push(
      client.paseo.agents.subscribe((update) => {
        if (update.kind === "upsert") applyAgent(update.agent);
        else if (update.kind === "remove") {
          agents.delete(update.agentId);
          automatic.removeAgent(update.agentId);
          pills.get(update.agentId)?.registration.remove();
          pills.delete(update.agentId);
        }
      }),
    );
    cleanups.push(
      client.paseo.workspaces.subscribe((update) => {
        if (update.kind === "upsert") applyWorkspace(update.workspace);
        else if (update.kind === "remove") {
          workspaces.delete(update.id);
          automatic.removeWorkspace(update.id);
        }
      }),
    );
    cleanups.push(
      subscribeBoardSnapshot(() => {
        for (const agent of agents.values()) syncPill(agent);
      }),
    );
    void client.paseo.agents
      .list({ page: { limit: 200 }, subscribe: {} })
      .then((result) => {
        if (result.subscription) {
          if (stopped) {
            void result.subscription.release().catch(console.error);
            return;
          }
          releases.push(() => result.subscription!.release());
          cleanups.push(
            result.subscription.subscribe({
              snapshot: ({ entries }) => {
                for (const { agent } of entries) applyAgent(agent);
              },
              update: () => {},
            }),
          );
        }
        for (const { agent } of result.entries) applyAgent(agent);
      })
      .catch((error) => {
        if (!stopped) notifyError(error);
      });
    void client.paseo.workspaces
      .list({ page: { limit: 200 }, subscribe: {} })
      .then((result) => {
        if (stopped) {
          void result.subscription.release().catch(console.error);
          return;
        }
        releases.push(() => result.subscription.release());
        cleanups.push(
          result.subscription.subscribe({
            snapshot: ({ entries }) => {
              for (const workspace of entries) applyWorkspace(workspace);
            },
            update: () => {},
          }),
        );
        for (const workspace of result.entries) applyWorkspace(workspace);
      })
      .catch((error) => {
        if (!stopped) notifyError(error);
      });
  };
  function ObserveNativeHost({ host }: PluginComposerItemProps) {
    const toast = useToast();
    useEffect(() => {
      notifyError = (error) =>
        toast.error(error instanceof Error ? error.message : String(error));
      ensureHost(host.id);
    }, [host.id, toast]);
    return null;
  }
  function NewWorkspaceDeck({ host }: PluginNewWorkspaceItemProps) {
    const setup = useNewWorkspace();
    const toast = useToast();
    useEffect(() => {
      notifyError = (error) =>
        toast.error(error instanceof Error ? error.message : String(error));
      ensureHost(host.id);
    }, [host.id, toast]);
    const marker = readNativeDeckJoin(setup.metadata);
    return (
      <Select
        title="Deck"
        icon="PanelsTopLeft"
        value={marker?.clientId === clientId ? marker.destination : "none"}
        options={[
          { value: "none", label: "不添加" },
          { value: "current", label: "添加到当前分屏" },
          { value: "new", label: "添加到新分屏" },
        ]}
        onValueChange={async ({ value }) => {
          if (
            value === "new" &&
            readBoardSnapshot(host.id).groups.length >= MAX_SPLITS
          )
            throw new Error("Deck 已达到 8 个分屏，请选择当前分屏。");
          await setup.setMetadata({
            [NATIVE_DECK_JOIN]:
              value === "none"
                ? null
                : { clientId, requestId: requestId(), destination: value },
          });
        }}
      />
    );
  }
  function DeckBadge({ host, workspaceId }: PluginWorkspaceRowBadgeItemProps) {
    const board = useSyncExternalStore(
      subscribeBoardSnapshot,
      () => readBoardSnapshot(host.id),
      () => readBoardSnapshot(host.id),
    );
    const count = board.panes.filter(
      (pane) => pane.workspaceId === workspaceId,
    ).length;
    return count ? (
      <WorkspaceRowBadge
        icon="PanelsTopLeft"
        label={`Deck ${count}`}
        accessibilityLabel={`已加入 Deck，${count} 个标签页`}
      />
    ) : null;
  }
  // Render nothing in the toolbar: observing the native host must not take up space.
  if (
    typeof client.addComposerItem === "function" &&
    typeof client.addComposerPill === "function"
  ) {
    cleanups.push(
      client.addComposerItem({
        id: "deck-native-host",
        Component: ObserveNativeHost,
      }),
    );
  }
  if (
    typeof client.addNewWorkspaceItem === "function" &&
    typeof useNewWorkspace === "function" &&
    typeof Select === "function"
  ) {
    cleanups.push(
      client.addNewWorkspaceItem({
        id: "deck-destination",
        Component: NewWorkspaceDeck,
      }),
    );
  }
  if (
    typeof client.addWorkspaceRowBadgeItem === "function" &&
    WorkspaceRowBadge
  ) {
    cleanups.push(
      client.addWorkspaceRowBadgeItem({
        id: "deck-membership",
        title: "Deck 标签页",
        icon: "PanelsTopLeft",
        Component: DeckBadge,
      }),
    );
  }
  cleanups.push(
    client.addCommandCenterItem({
      id: "add-agent-to-deck",
      title: "将当前 Agent 加入 Deck",
      icon: "PanelsTopLeft",
      context: "agent",
      onSelect({ agent }) {
        ensureHost(agent.hostId);
        join(
          { id: agent.id, workspaceId: agent.workspaceId, title: agent.title },
          "current",
          true,
        );
      },
    }),
  );
  return () => {
    stopped = true;
    for (const cleanup of cleanups.reverse()) cleanup();
    for (const { registration } of pills.values()) registration.remove();
    pills.clear();
    for (const release of releases) void release().catch(console.error);
  };
}
