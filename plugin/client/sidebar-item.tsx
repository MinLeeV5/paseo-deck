import { useRpc, type PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Platform, Text, View } from "react-native";
import { bridgeInfoRpc } from "../shared/bridge";
import type { Pane } from "../shared/model";
import type { NativeBridge, NativeStatusBucket } from "./native-types";
import {
  describeControl,
  loadNativeBridge,
  readBoardSnapshot,
  subscribeBoardSnapshot,
} from "./web";

const states = ["needs_input", "failed", "running", "attention"] as const;
const labels = {
  needs_input: "等待输入或审批",
  failed: "运行失败",
  running: "正在运行",
  attention: "未读",
};

export function DeckSidebarItem(props: PluginSidebarItemProps) {
  const board = useSyncExternalStore(
    subscribeBoardSnapshot,
    () => readBoardSnapshot(props.host.id),
    () => readBoardSnapshot(props.host.id),
  );
  const panes = useMemo(
    () =>
      board.panes.filter(
        (pane) => pane.target.kind === "agent" || pane.target.kind === "draft",
      ),
    [board.panes],
  );
  return (
    <SidebarRow
      icon="PanelsTopLeft"
      label="Paseo Deck"
      active={props.currentScreen?.screenId === "main"}
      trailing={
        panes.length > 0 && Platform.OS === "web" ? (
          <DeckCounts key={props.host.id} panes={panes} theme={props.theme} />
        ) : undefined
      }
      onPress={() => {
        if (props.currentScreen?.screenId !== "main")
          props.openScreen({ screenId: "main" });
      }}
    />
  );
}

function DeckCounts({
  panes,
  theme,
}: {
  panes: Pane[];
  theme: PluginSidebarItemProps["theme"];
}) {
  const bridgeInfo = useRpc(bridgeInfoRpc);
  const bridge = useQuery({
    queryKey: ["split-native-bridge"],
    queryFn: () => loadNativeBridge(() => bridgeInfo({})),
    retry: false,
    staleTime: Infinity,
  }).data;
  const [statuses, setStatuses] = useState<
    Record<string, NativeStatusBucket | null>
  >({});
  const report = useCallback(
    (tabId: string, status: NativeStatusBucket | null) => {
      setStatuses((previous) => {
        if ((previous[tabId] ?? null) === status) return previous;
        const next = { ...previous };
        if (status) next[tabId] = status;
        else delete next[tabId];
        return next;
      });
    },
    [],
  );
  const parts = states.flatMap((status) => {
    const count = panes.filter((pane) => statuses[pane.id] === status).length;
    return count
      ? [{ status, count, label: `${labels[status]} ${count}` }]
      : [];
  });
  const summary = parts.map((part) => part.label).join("，");
  useEffect(() => describeControl("deck-sidebar-counts", summary), [summary]);
  if (!bridge) return null;
  return (
    <QueryClientProvider client={bridge.queryClient}>
      {Array.from(new Set(panes.map((pane) => pane.serverId))).map(
        (serverId) => (
          <ObserveDirectory
            key={serverId}
            serverId={serverId}
            bridge={bridge}
          />
        ),
      )}
      {panes.map((pane) => (
        <ObserveTab key={pane.id} pane={pane} bridge={bridge} report={report} />
      ))}
      {parts.length > 0 ? (
        <View
          testID="deck-sidebar-counts"
          accessible
          accessibilityRole="text"
          accessibilityLabel={summary}
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {parts.map(({ status, count, label }) => (
            <CountIndicator
              key={status}
              status={status}
              count={count}
              label={label}
              theme={theme}
              bridge={bridge}
            />
          ))}
        </View>
      ) : null}
    </QueryClientProvider>
  );
}

function ObserveDirectory({
  serverId,
  bridge,
}: {
  serverId: string;
  bridge: NativeBridge;
}) {
  const client = bridge.useHostRuntimeClient(serverId);
  // Share the host's reference-counted metadata observation, including while
  // Deck is closed or has never been opened. This does not request timelines.
  useEffect(() => {
    if (client)
      return bridge.getHostRuntimeStore().acquireDirectoryDemand(serverId);
  }, [bridge, client, serverId]);
  return null;
}

// Only descriptors are mounted here. They read the same native status as the
// Tab strip without opening conversations, clearing unread, or polling agents.
const ObserveTab = memo(function ObserveTab({
  pane,
  bridge,
  report,
}: {
  pane: Pane;
  bridge: NativeBridge;
  report(tabId: string, status: NativeStatusBucket | null): void;
}) {
  const tab = useMemo(
    () => ({
      tabId: `deck-sidebar:${pane.id}`,
      key: pane.id,
      kind: pane.target.kind,
      target: pane.target,
      state: pane.state,
    }),
    [pane.id, pane.target, pane.state],
  );
  return (
    <bridge.WorkspaceTabPresentationResolver
      tab={tab}
      serverId={pane.serverId}
      workspaceId={pane.workspaceId}
    >
      {(presentation) => (
        <ReportStatus
          tabId={pane.id}
          status={presentation.statusBucket}
          report={report}
        />
      )}
    </bridge.WorkspaceTabPresentationResolver>
  );
});

function ReportStatus({
  tabId,
  status,
  report,
}: {
  tabId: string;
  status: NativeStatusBucket | null;
  report(tabId: string, status: NativeStatusBucket | null): void;
}) {
  useLayoutEffect(() => {
    report(tabId, status);
    return () => report(tabId, null);
  }, [tabId, status, report]);
  return null;
}

function CountIndicator({
  status,
  count,
  label,
  theme,
  bridge,
}: {
  status: (typeof states)[number];
  count: number;
  label: string;
  theme: PluginSidebarItemProps["theme"];
  bridge: NativeBridge;
}) {
  const testID = `deck-sidebar-count-${status}`;
  useEffect(() => describeControl(testID, label), [testID, label]);
  const color =
    status === "needs_input"
      ? theme.colors.statusWarning
      : status === "failed"
        ? theme.colors.statusDanger
        : theme.colors.statusSuccess;
  return (
    <View
      testID={testID}
      aria-hidden
      style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
    >
      <View
        style={{
          width: 14,
          height: 14,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {status === "running" ? (
          <bridge.StatusRing backdrop="surfaceSidebar" />
        ) : (
          <View
            style={
              status === "needs_input"
                ? {
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    borderWidth: 1.5,
                    borderColor: color,
                  }
                : {
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: color,
                  }
            }
          />
        )}
      </View>
      <Text
        style={{
          color:
            status === "needs_input" ? color : theme.colors.foregroundMuted,
          fontSize: 12,
          fontVariant: ["tabular-nums"],
        }}
      >
        {count}
      </Text>
    </View>
  );
}
