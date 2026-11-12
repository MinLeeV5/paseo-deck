import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import type { Pane, TabGroup, Target } from "../shared/model";
import type { NativeBridge } from "./native-types";
import type { Directory } from "./directory";
import { isRunning } from "./directory";
import { IconButton, targetIcons } from "./compact-ui";
import { WorkspaceIcon } from "./workspace-icon";
import { NativePane } from "./native-pane";
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
  panes,
  agents,
  bridge,
  theme,
  compact,
  active,
  maximized,
  onSelect,
  onClose,
  onAdd,
  onMenu,
  onMaximize,
  onAnchor,
}: {
  group: TabGroup;
  panes: Pane[];
  agents: Directory["agents"];
  bridge: NativeBridge;
  theme: PluginScreenProps["theme"];
  compact: boolean;
  active: boolean;
  maximized: boolean;
  onSelect(id: string): void;
  onClose(id: string): void;
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
      ),
    [group.id, theme.colors.foregroundMuted, theme.colors.surface1],
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
          {panes.map((pane) => {
            const agent =
              pane.target.kind === "agent"
                ? agents.find(
                    (agent) =>
                      pane.target.kind === "agent" &&
                      agent.id === pane.target.agentId,
                  )
                : undefined;
            return (
              <Tab
                key={pane.id}
                pane={pane}
                title={agent?.title ?? pane.title}
                running={Boolean(agent && isRunning(agent))}
                selected={group.activeTabId === pane.id}
                bridge={bridge}
                theme={theme}
                compact={compact}
                onSelect={onSelect}
                onClose={onClose}
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
      <IconButton
        label={maximized ? "还原分屏" : "放大分屏"}
        icon={maximized ? "Minimize2" : "Maximize2"}
        theme={theme}
        size={compact ? 30 : 24}
        onPress={() => onMaximize(group.id)}
      />
      <IconButton
        label="分屏操作"
        icon="Ellipsis"
        theme={theme}
        size={compact ? 30 : 24}
        onPress={() => onMenu(group.id, menu.current)}
        anchorRef={menu}
        testID={`split-menu-${group.id}`}
      />
    </View>
  );
});
const Tab = memo(function Tab({
  pane,
  title,
  running,
  selected,
  bridge,
  theme,
  compact,
  onSelect,
  onClose,
}: {
  pane: Pane;
  title: string;
  running: boolean;
  selected: boolean;
  bridge: NativeBridge;
  theme: PluginScreenProps["theme"];
  compact: boolean;
  onSelect(id: string): void;
  onClose(id: string): void;
}) {
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false);
  const colors = theme.colors;
  const label = `${title} · ${pane.workspaceName}${running ? " · 运行中" : ""}`;
  useEffect(
    () => describeControl(`split-tab-${pane.id}`, label),
    [pane.id, label],
  );
  return (
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
      <Pressable
        testID={`split-tab-${pane.id}`}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityHint="可拖动排序或移到其他分屏，也可使用分屏操作菜单移动"
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
            ? { cursor: "grab" as ViewStyle["cursor"], touchAction: "none" }
            : {}),
        }}
      >
        {pane.target.kind === "agent" || pane.target.kind === "draft" ? (
          <WorkspaceIcon
            bridge={bridge}
            workspaceId={pane.workspaceId}
            label={pane.workspaceName}
          />
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
        {running && (
          <View accessibilityLabel="运行中" style={{ paddingLeft: 2 }}>
            <Icon name="Activity" size={12} color={colors.statusSuccess} />
          </View>
        )}
      </Pressable>
      <Pressable
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
          opacity: selected || hovered || focused ? 1 : 0,
        }}
      >
        <Icon name="X" size={12} color={colors.foregroundMuted} />
      </Pressable>
    </View>
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
  onOpen(id: string, target: Target): void;
  onOpenSide(id: string, target: Target): void;
  onRetarget(id: string, target: Target): void;
  onState(id: string, state: Pane["state"]): void;
}) {
  const visited = useRef(false);
  if (visible) visited.current = true;
  const focus = useCallback(() => onFocus(pane.id), [onFocus, pane.id]);
  const close = useCallback(() => onClose(pane.id), [onClose, pane.id]);
  const open = useCallback(
    (target: Target) => onOpen(pane.id, target),
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
        display: visible ? "flex" : "none",
      }}
    >
      {visited.current && (
        <NativePane
          tabId={nativeTabId}
          bridge={bridge}
          pane={pane}
          theme={theme}
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
