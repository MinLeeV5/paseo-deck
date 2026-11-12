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
import { shortcutDigit, type ShortcutEvent } from "../shared/shortcuts";
import type { NativeBridge, NativePaneInput } from "./native-types";
import { onNativeActionShortcut } from "./web";

type NativeKeyboardProps = {
  bridge: NativeBridge;
  enabled: boolean;
  onNewTab(): void;
  onCloseTab(): void;
  onCycleTab(direction: -1 | 1): void;
  onJumpTab(index: number): void;
  onNewAgent(): void;
  onNewTerminal(): void;
  onSplit(direction: "row" | "column"): void;
};
export const NativeKeyboard = memo(function NativeKeyboard(
  props: NativeKeyboardProps,
) {
  return (
    <QueryClientProvider client={props.bridge.queryClient}>
      <KeyboardBindings {...props} />
    </QueryClientProvider>
  );
});
function KeyboardBindings({
  bridge,
  enabled,
  onNewTab,
  onCloseTab,
  onCycleTab,
  onJumpTab,
  onNewAgent,
  onNewTerminal,
  onSplit,
}: NativeKeyboardProps) {
  const keys = bridge.useShortcutKeys("focus-message-input");
  const interruptKeys = bridge.useShortcutKeys("agent-interrupt");
  const newTabKeys = bridge.useShortcutKeys("workspace-tab-new");
  const closeTabKeys = bridge.useShortcutKeys("workspace-tab-close-current");
  const nextTabKeys = bridge.useShortcutKeys("workspace-tab-next");
  const previousTabKeys = bridge.useShortcutKeys("workspace-tab-prev");
  const jumpTabKeys = bridge.useShortcutKeys("workspace-tab-jump-index");
  const newAgentKeys = bridge.useShortcutKeys("workspace-tab-target-agent");
  const newTerminalKeys = bridge.useShortcutKeys("workspace-terminal-new");
  const splitRightKeys = bridge.useShortcutKeys("workspace-pane-split-right");
  const splitDownKeys = bridge.useShortcutKeys("workspace-pane-split-down");
  const dispatcher = bridge.useKeyboardActionDispatcher();
  useEffect(() => {
    if (!enabled) return;
    const cycle = (direction: -1 | 1) => () => {
      onCycleTab(direction);
      return true;
    };
    const run = (action: () => void) => () => {
      action();
      return true;
    };
    const bindings: [string[][] | null, (event: ShortcutEvent) => boolean][] = [
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
      [
        closeTabKeys,
        () => {
          onCloseTab();
          return true;
        },
      ],
      [nextTabKeys, cycle(1)],
      [previousTabKeys, cycle(-1)],
      [[["ctrl", "tab"]], cycle(1)],
      [[["ctrl", "shift", "tab"]], cycle(-1)],
      [
        jumpTabKeys,
        (event) => {
          const digit = shortcutDigit(event);
          if (digit === null) return false;
          onJumpTab(digit - 1);
          return true;
        },
      ],
      [newAgentKeys, run(onNewAgent)],
      [newTerminalKeys, run(onNewTerminal)],
      [splitRightKeys, run(() => onSplit("row"))],
      [splitDownKeys, run(() => onSplit("column"))],
    ];
    const cleanups = bindings.flatMap(([chord, dispatch]) =>
      chord?.length
        ? [onNativeActionShortcut(chord, bridge.hasActiveWebOverlay, dispatch)]
        : [],
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [
    bridge,
    enabled,
    keys,
    interruptKeys,
    newTabKeys,
    closeTabKeys,
    nextTabKeys,
    previousTabKeys,
    jumpTabKeys,
    newAgentKeys,
    newTerminalKeys,
    splitRightKeys,
    splitDownKeys,
    dispatcher,
    onNewTab,
    onCloseTab,
    onCycleTab,
    onJumpTab,
    onNewAgent,
    onNewTerminal,
    onSplit,
  ]);
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
