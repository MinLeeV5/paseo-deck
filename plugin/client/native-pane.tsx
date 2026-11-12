import {
  Component,
  createElement,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import { Pressable, Text, View } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { Pane, Target } from "../shared/model";
import type { NativeBridge, NativePaneInput } from "./native-types";
import { onNativeActionShortcut } from "./web";

export const NativeKeyboard = memo(function NativeKeyboard({
  bridge,
  enabled,
  onNewTab,
}: {
  bridge: NativeBridge;
  enabled: boolean;
  onNewTab(): void;
}) {
  return (
    <QueryClientProvider client={bridge.queryClient}>
      <KeyboardBindings bridge={bridge} enabled={enabled} onNewTab={onNewTab} />
    </QueryClientProvider>
  );
});
function KeyboardBindings({
  bridge,
  enabled,
  onNewTab,
}: {
  bridge: NativeBridge;
  enabled: boolean;
  onNewTab(): void;
}) {
  const keys = bridge.useShortcutKeys("focus-message-input");
  const interruptKeys = bridge.useShortcutKeys("agent-interrupt");
  const newTabKeys = bridge.useShortcutKeys("workspace-tab-new");
  const dispatcher = bridge.useKeyboardActionDispatcher();
  useEffect(() => {
    if (!enabled) return;
    const bindings: [string[][] | null, () => boolean][] = [
      [
        keys,
        () =>
          dispatcher.dispatch({
            id: "message-input.focus",
            scope: "message-input",
          }),
      ],
      [
        interruptKeys,
        () =>
          dispatcher.dispatch({
            id: "agent.interrupt",
            scope: "message-input",
          }),
      ],
      [
        newTabKeys,
        () => {
          onNewTab();
          return true;
        },
      ],
    ];
    const cleanups = bindings.flatMap(([chord, dispatch]) =>
      chord?.length
        ? [onNativeActionShortcut(chord, bridge.hasActiveWebOverlay, dispatch)]
        : [],
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [bridge, enabled, keys, interruptKeys, newTabKeys, dispatcher, onNewTab]);
  return null;
}

class PaneErrorBoundary extends Component<
  { children: ReactNode; color: string; onClose(): void },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch(error: Error) {
    console.error("[Split native pane]", error.stack ?? error.message);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, padding: 20, gap: 12 }}>
        <Text style={{ color: this.props.color }}>
          原生面板加载失败：{this.state.error}
        </Text>
        <Pressable onPress={this.props.onClose}>
          <Text style={{ color: this.props.color }}>移除此面板</Text>
        </Pressable>
      </View>
    );
  }
}
type NativePaneProps = {
  tabId: string;
  bridge: NativeBridge;
  pane: Pane;
  focused: boolean;
  visible: boolean;
  theme: PluginScreenProps["theme"];
  onFocus(): void;
  onOpen(target: Target): void;
  onOpenSide(target: Target): void;
  onRetarget(target: Target): void;
  onState(state: Pane["state"]): void;
  onClose(): void;
  onImport(): void;
};
export const NativePane = memo(function NativePane(props: NativePaneProps) {
  return (
    <QueryClientProvider client={props.bridge.queryClient}>
      <PaneErrorBoundary
        key={`${props.pane.id}:${props.pane.target.kind}`}
        color={props.theme.colors.foreground}
        onClose={props.onClose}
      >
        <NativePaneContent {...props} />
      </PaneErrorBoundary>
    </QueryClientProvider>
  );
});
function NativePaneContent({
  tabId,
  bridge,
  pane,
  focused,
  visible,
  onFocus,
  onOpen,
  onOpenSide,
  onRetarget,
  onClose,
  onState,
  onImport,
}: NativePaneProps) {
  const client = bridge.useHostRuntimeClient(pane.serverId);
  const workspaceRoot =
    bridge.useWorkspaceDirectory(pane.serverId, pane.workspaceId) ?? undefined;
  const workspaceKey = `split-demo:${pane.serverId}:${pane.workspaceId}:${tabId}`;
  const routeFocused = bridge.useIsFocused();
  const active = routeFocused && visible;
  const timelineSync = bridge.useSessionStore(
    (state) => state.sessions[pane.serverId]?.viewedTimelineSync ?? null,
  );
  const agentId = pane.target.kind === "agent" ? pane.target.agentId : null;
  useEffect(() => {
    if (active && agentId)
      void bridge
        .getHostRuntimeStore()
        .prepareAgentTimeline(pane.serverId, agentId)
        .catch((error) => console.error("[Split timeline]", error));
  }, [bridge, pane.serverId, agentId, active]);
  useLayoutEffect(() => {
    timelineSync?.replaceVisibleAgentIds(
      workspaceKey,
      active && agentId ? [agentId] : [],
    );
    return () => timelineSync?.replaceVisibleAgentIds(workspaceKey, []);
  }, [timelineSync, workspaceKey, agentId, active]);
  const tabIds = useMemo(() => [tabId], [tabId]);
  const openFile = useCallback(
    (location: { path: string; lineStart?: number; lineEnd?: number }) =>
      onOpen({ kind: "file", ...location }),
    [onOpen],
  );
  const input = useMemo<NativePaneInput>(
    () => ({
      tab: {
        tabId,
        key: tabId,
        kind: pane.target.kind,
        target: pane.target,
        state: pane.state,
      },
      normalizedServerId: pane.serverId,
      normalizedWorkspaceId: pane.workspaceId,
      host: "main",
      panelRevision: 0,
      onOpenTab: onOpen,
      onOpenPreferredTarget: onOpen,
      onOpenTargetToSide: onOpenSide,
      onCloseCurrentTab: onClose,
      onRetargetCurrentTab: onRetarget,
      onSetCurrentTabState: onState,
      onOpenWorkspaceFile: (request) => openFile(request.location),
      onOpenImportSheet: onImport,
    }),
    [
      pane,
      tabId,
      onOpen,
      onOpenSide,
      onClose,
      onRetarget,
      onState,
      onImport,
      openFile,
    ],
  );
  const content = useMemo(
    () => bridge.buildWorkspacePaneContentModel(input),
    [bridge, input],
  );
  const sheetHost = useMemo(
    () => ({
      workspaceKey,
      serverId: pane.serverId,
      workspaceId: pane.workspaceId,
      isWorkspaceFocused: active,
      buildContent: (
        tab: NativePaneInput["tab"],
        closeCurrentTab: () => void,
      ) =>
        bridge.buildWorkspacePaneContentModel({
          ...input,
          tab,
          host: "sheet",
          onCloseCurrentTab: closeCurrentTab,
        }),
    }),
    [workspaceKey, pane.serverId, pane.workspaceId, active, bridge, input],
  );
  let child: ReactNode = createElement(bridge.WorkspacePaneContent, {
    content,
    isWorkspaceFocused: active,
    isPaneFocused: focused && active,
    onFocusPane: onFocus,
  });
  child = createElement(
    bridge.AssistantFileLinkResolverProvider,
    {
      client,
      serverId: pane.serverId,
      workspaceRoot,
      onOpenWorkspaceFile: openFile,
    },
    child,
  );
  if (bridge.SheetPaneHostProvider)
    child = createElement(
      bridge.SheetPaneHostProvider,
      { value: sheetHost },
      child,
    );
  child = createElement(bridge.DiffDocumentWorkspaceCacheProvider, {}, child);
  child = createElement(bridge.WorkspaceFocusProvider, { workspaceKey }, child);
  child = createElement(
    bridge.WorkspaceComposerEditingSessionsProvider,
    { workspaceKey, tabIds },
    child,
  );
  // A closed split must release its retained editor sessions. Keep that cache
  // inside this stable pane instead of retaining it in Paseo's global map.
  child = createElement(bridge.ComposerEditingSessionsProvider, {}, child);
  return createElement(bridge.RetainedPanelActivity, { active }, child);
}
