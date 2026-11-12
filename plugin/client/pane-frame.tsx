import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { Pane, RelatedTabs, TabGroup, Target } from "../shared/model";
import type { NativeBridge, NativeStatusBucket } from "./native-types";
import type { Directory } from "./directory";
import { IconButton, targetIcons } from "./compact-ui";
import { WorkspaceIcon } from "./workspace-icon";
import { NativePane } from "./native-pane";
import { WorkspaceActions } from "./workspace-actions";
import { TabContextMenu, TabMenuTrigger } from "./tab-context-menu";
import type { PaneMenuAction } from "./resource-picker";
import {
  describeControl,
  revealControl,
  keyboardFocusVisible,
  onTabKeys,
  onTabScroll,
} from "./web";

export type Rect = { left: number; top: number; width: number; height: number };
export const TabStrip = memo(function TabStrip({
  group,
  instanceId,
  panes,
  agents,
  directory,
  host,
  wide,
  width,
  menuActions,
  onFocus,
  beforeAction,
  onOpen,
  bridge,
  theme,
  compact,
  active,
  maximized,
  onSelect,
  onRunningChange,
  onClose,
  onCloseGroup,
  onCloseRelated,
  onResourceChanged,
  onAdd,
  onMenu,
  onMaximize,
  onAnchor,
}: {
  group: TabGroup;
  instanceId: string;
  panes: Pane[];
  agents: Directory["agents"];
  directory?: Directory;
  host: PluginScreenProps["host"];
  wide: boolean;
  width: number;
  menuActions: PaneMenuAction[];
  onFocus(tabId: string): void;
  beforeAction(tabId: string): Promise<void>;
  onOpen(tabId: string, target: Target, workspaceId?: string): void;
  bridge: NativeBridge;
  theme: PluginScreenProps["theme"];
  compact: boolean;
  active: boolean;
  maximized: boolean;
  onSelect(id: string): void;
  onRunningChange(id: string, running: boolean): void;
  onClose(id: string): void;
  onCloseGroup?(groupId: string): void;
  onCloseRelated(id: string, scope: RelatedTabs): void;
  onResourceChanged(): Promise<unknown>;
  onAdd(groupId: string, anchor: View | null): void;
  onMenu(groupId: string, anchor: View | null): void;
  onMaximize(groupId: string): void;
  onAnchor(groupId: string, anchor: View | null): void;
}) {
  const plus = useRef<View>(null),
    menu = useRef<View>(null);
  useEffect(() => {
    onAnchor(group.id, plus.current);
    return () => onAnchor(group.id, null);
  }, [group.id, onAnchor]);
  useEffect(
    () => (active ? onTabKeys(group.id, group.tabIds, onSelect) : undefined),
    [active, group.id, group.tabIds, onSelect],
  );
  useEffect(
    () =>
      onTabScroll(
        group.id,
        theme.colors.foregroundMuted,
        theme.colors.surface1,
        theme.colors.foreground,
      ),
    [
      group.id,
      theme.colors.foregroundMuted,
      theme.colors.surface1,
      theme.colors.foreground,
    ],
  );
  useEffect(() => {
    if (active && group.activeTabId)
      revealControl(`split-tab-${group.activeTabId}`);
  }, [group.activeTabId, active]);
  return (
    <View
      testID="split-window-bar"
      style={{
        height: compact ? 36 : 32,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 4,
        gap: 2,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
        zIndex: 2,
      }}
    >
      <View
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <ScrollView
          testID={`split-tabs-${group.id}`}
          accessibilityRole="tablist"
          horizontal
          showsHorizontalScrollIndicator
          style={{ flexGrow: 0, flexShrink: 1, minWidth: 0 }}
          contentContainerStyle={{ alignItems: "center", gap: 2 }}
        >
          {panes.map((pane, index) => {
            const agent =
              pane.target.kind === "agent"
                ? agents.find(
                    (agent) =>
                      pane.target.kind === "agent" &&
                      agent.id === pane.target.agentId,
                  )
                : undefined;
            const terminal =
              pane.target.kind === "terminal"
                ? directory?.terminals.find(
                    (terminal) =>
                      pane.target.kind === "terminal" &&
                      terminal.id === pane.target.terminalId,
                  )
                : undefined;
            return (
              <Tab
                key={pane.id}
                pane={pane}
                nativeTabId={`${instanceId}:${pane.id}`}
                index={index}
                tabCount={panes.length}
                directory={directory}
                title={
                  agent?.title ??
                  (terminal?.title || terminal?.name) ??
                  pane.title
                }
                selected={group.activeTabId === pane.id}
                bridge={bridge}
                theme={theme}
                compact={compact}
                onSelect={onSelect}
                onRunningChange={onRunningChange}
                onClose={onClose}
                onCloseRelated={onCloseRelated}
                onResourceChanged={onResourceChanged}
              />
            );
          })}
        </ScrollView>
        <IconButton
          label="添加 Tab"
          icon="Plus"
          theme={theme}
          size={compact ? 30 : 26}
          onPress={() => onAdd(group.id, plus.current)}
          anchorRef={plus}
          testID={`split-add-${group.id}`}
        />
      </View>
      <WorkspaceActions
        bridge={bridge}
        pane={panes.find((pane) => pane.id === group.activeTabId)}
        directory={directory}
        host={host}
        theme={theme}
        compact={compact}
        wide={wide}
        width={width}
        groupId={group.id}
        menuActions={menuActions}
        maximized={maximized}
        onFocus={onFocus}
        beforeAction={beforeAction}
        onOpen={onOpen}
        onMenu={onMenu}
        onMaximize={onMaximize}
      />
      {!group.tabIds.length && onCloseGroup && (
        <IconButton
          label="关闭空分屏"
          icon="X"
          theme={theme}
          size={compact ? 30 : 26}
          onPress={() => onCloseGroup(group.id)}
          testID={`split-close-group-${group.id}`}
        />
      )}
    </View>
  );
});
type TabProps = {
  pane: Pane;
  nativeTabId: string;
  index: number;
  tabCount: number;
  directory?: Directory;
  title: string;
  selected: boolean;
  bridge: NativeBridge;
  theme: PluginScreenProps["theme"];
  compact: boolean;
  onSelect(id: string): void;
  onRunningChange(id: string, running: boolean): void;
  onClose(id: string): void;
  onCloseRelated(id: string, scope: RelatedTabs): void;
  onResourceChanged(): Promise<unknown>;
};

const statusLabels: Record<NativeStatusBucket, string> = {
  needs_input: "等待输入或审批",
  failed: "运行失败",
  running: "运行中",
  attention: "未读",
  done: "",
};

const Tab = memo(function Tab(props: TabProps) {
  const { pane, nativeTabId, bridge } = props;
  const tab = useMemo(
    () => ({
      tabId: nativeTabId,
      key: nativeTabId,
      kind: pane.target.kind,
      target: pane.target,
      state: pane.state,
    }),
    [nativeTabId, pane.target, pane.state],
  );
  if (pane.target.kind !== "agent" && pane.target.kind !== "draft")
    return <TabButton {...props} />;

  // Use the same descriptor as native tabs: it observes attention, permissions
  // and active turns even before this tab's conversation has been mounted.
  return (
    <QueryClientProvider client={bridge.queryClient}>
      <bridge.WorkspaceTabPresentationResolver
        tab={tab}
        serverId={pane.serverId}
        workspaceId={pane.workspaceId}
      >
        {(presentation) => (
          <TabButton
            {...props}
            title={
              presentation.titleState === "ready" && presentation.label
                ? presentation.label
                : props.title
            }
            statusBucket={presentation.statusBucket}
          />
        )}
      </bridge.WorkspaceTabPresentationResolver>
    </QueryClientProvider>
  );
});

const TabButton = memo(function TabButton({
  pane,
  nativeTabId,
  index,
  tabCount,
  directory,
  title,
  statusBucket = null,
  selected,
  bridge,
  theme,
  compact,
  onSelect,
  onRunningChange,
  onClose,
  onCloseRelated,
  onResourceChanged,
}: TabProps & { statusBucket?: NativeStatusBucket | null }) {
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false);
  const colors = theme.colors;
  const statusLabel = statusBucket ? statusLabels[statusBucket] : "";
  const label = `${title} · ${pane.workspaceName}${statusLabel ? ` · ${statusLabel}` : ""}`;
  useLayoutEffect(() => {
    onRunningChange(pane.id, statusBucket === "running");
    return () => onRunningChange(pane.id, false);
  }, [onRunningChange, pane.id, statusBucket]);
  useEffect(
    () => describeControl(`split-tab-${pane.id}`, label),
    [pane.id, label],
  );
  return (
    <TabContextMenu
      pane={pane}
      nativeTabId={nativeTabId}
      title={title}
      index={index}
      tabCount={tabCount}
      directory={directory}
      bridge={bridge}
      theme={theme}
      onClose={onClose}
      onCloseRelated={onCloseRelated}
      onResourceChanged={onResourceChanged}
    >
      <View
        testID={`split-tab-item-${pane.id}`}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: compact ? 30 : 26,
          borderRadius: 5,
          maxWidth: compact ? 190 : 230,
          backgroundColor: selected
            ? colors.surface2
            : hovered
              ? colors.surface1
              : "transparent",
        }}
      >
        <TabMenuTrigger
          bridge={bridge}
          tabId={pane.id}
          testID={`split-tab-${pane.id}`}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityHint="右键或 Shift+F10 打开 Tab 菜单；可拖动排序或移到其他分屏"
          accessibilityState={{ selected }}
          aria-selected={selected}
          tabIndex={selected ? 0 : -1}
          onPress={() => onSelect(pane.id)}
          onFocus={() => setFocused(keyboardFocusVisible())}
          onBlur={() => setFocused(false)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingLeft: 8,
            paddingRight: 3,
            height: "100%",
            flexShrink: 1,
            minWidth: 0,
            borderWidth: 1,
            borderRadius: 4,
            borderColor: focused ? colors.foregroundMuted : "transparent",
            ...(Platform.OS === "web"
              ? { cursor: "pointer", touchAction: "none" }
              : {}),
          }}
        >
          {pane.target.kind === "agent" || pane.target.kind === "draft" ? (
            <View
              testID={`split-tab-status-${pane.id}`}
              accessibilityLabel={statusLabel || undefined}
            >
              <bridge.StatusIcon
                statusBucket={statusBucket}
                size={14}
                backdrop={
                  selected ? "surface2" : hovered ? "surface1" : "surface0"
                }
              >
                <WorkspaceIcon
                  bridge={bridge}
                  workspaceId={pane.workspaceId}
                  label={pane.workspaceName}
                />
              </bridge.StatusIcon>
            </View>
          ) : (
            <Icon
              name={targetIcons[pane.target.kind]}
              size={13}
              color={colors.foregroundMuted}
            />
          )}
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              maxWidth: compact ? 116 : 155,
              flexShrink: 1,
              color: selected ? colors.foreground : colors.foregroundMuted,
            }}
          >
            {title}
          </Text>
        </TabMenuTrigger>
        <Pressable
          testID={`split-close-tab-${pane.id}`}
          accessibilityRole="button"
          accessibilityLabel={`关闭 Tab ${title}`}
          tabIndex={selected ? 0 : -1}
          onPress={() => onClose(pane.id)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: compact ? 24 : 20,
            height: compact ? 30 : 26,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
            opacity: selected || hovered || focused ? 1 : 0,
          }}
        >
          <Icon name="X" size={12} color={colors.foregroundMuted} />
        </Pressable>
      </View>
    </TabContextMenu>
  );
});

// All resource hosts are siblings in the board. Moving a Tab changes only its
// rectangle, preserving the same editor/terminal/Composer subtree and identity.
export const PaneFrame = memo(function PaneFrame({
  pane,
  nativeTabId,
  rect,
  bridge,
  theme,
  visible,
  focused,
  onFocus,
  onClose,
  onImport,
  onOpen,
  onOpenSide,
  onRetarget,
  onState,
}: {
  pane: Pane;
  nativeTabId: string;
  rect: Rect;
  bridge: NativeBridge;
  theme: PluginScreenProps["theme"];
  visible: boolean;
  focused: boolean;
  onFocus(id: string): void;
  onClose(id: string): void;
  onImport(id: string): void;
  onOpen(id: string, target: Target, workspaceId?: string): void;
  onOpenSide(id: string, target: Target): void;
  onRetarget(id: string, target: Target): void;
  onState(id: string, state: Pane["state"]): void;
}) {
  const visited = useRef(false);
  if (visible) visited.current = true;
  const focus = useCallback(() => onFocus(pane.id), [onFocus, pane.id]);
  const close = useCallback(() => onClose(pane.id), [onClose, pane.id]);
  const open = useCallback(
    (target: Target, workspaceId?: string) =>
      onOpen(pane.id, target, workspaceId),
    [onOpen, pane.id],
  );
  const side = useCallback(
    (target: Target) => onOpenSide(pane.id, target),
    [onOpenSide, pane.id],
  );
  const retarget = useCallback(
    (target: Target) => onRetarget(pane.id, target),
    [onRetarget, pane.id],
  );
  const state = useCallback(
    (value: Pane["state"]) => onState(pane.id, value),
    [onState, pane.id],
  );
  const importAgent = useCallback(() => onImport(pane.id), [onImport, pane.id]);
  return (
    <View
      onPointerDown={focus}
      testID={`split-pane-${pane.id}`}
      style={{
        position: "absolute",
        ...rect,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        ...(pane.presentation === "inspector"
          ? {
              zIndex: 2,
              backgroundColor: theme.colors.surface1,
              borderLeftWidth: 1,
              borderColor: theme.colors.border,
            }
          : {}),
        display: visible ? "flex" : "none",
      }}
    >
      {visited.current && (
        <NativePane
          tabId={nativeTabId}
          bridge={bridge}
          pane={pane}
          theme={theme}
          compact={rect.width < 600}
          visible={visible}
          focused={focused}
          onFocus={focus}
          onClose={close}
          onImport={importAgent}
          onOpen={open}
          onOpenSide={side}
          onRetarget={retarget}
          onState={state}
        />
      )}
    </View>
  );
});
