import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FlatList, Icon, TextInput } from "@getpaseo/plugin/client/ui";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type FlatList as NativeFlatList,
  type TextInput as NativeTextInput,
} from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { Target } from "../shared/model";
import type { NativeBridge } from "./native-types";
import { WorkspaceIcon } from "./workspace-icon";
import { isRunning, workspaceLabel, type Directory } from "./directory";
import { keyboardFocusVisible, onPickerKeys } from "./web";
import { IconButton } from "./compact-ui";

export type PickerMode =
  | "agent"
  | "new"
  | "terminal"
  | "new-terminal"
  | "file"
  | "menu";
export type PaneMenuAction = {
  label: string;
  icon: string;
  run(): void;
  disabled?: boolean;
  category?: "移动" | "排版" | "其它" | "关闭";
  selected?: boolean;
  destructive?: boolean;
};
const RESULT_HEIGHT = 56;
const HEADING_HEIGHT = 30;

type Row =
  | {
      key: string;
      kind: "heading";
      title: string;
      count: number;
      running?: boolean;
    }
  | {
      key: string;
      kind: "option";
      title: string;
      subtitle: string;
      workspaceId: string;
      badge?: string;
      running?: boolean;
      run(): void;
    };
export function ResourcePicker({
  bridge,
  theme,
  directory,
  initialMode,
  defaultWorkspaceId,
  openedAgentIds,
  newSplit,
  onDestination,
  onOpen,
  onTerminal,
  onClose,
  onRefresh,
  busy,
  error,
  menuActions,
  onHeightChange,
}: {
  bridge: NativeBridge;
  theme: PluginScreenProps["theme"];
  directory?: Directory;
  initialMode: PickerMode;
  defaultWorkspaceId?: string;
  openedAgentIds: Set<string>;
  newSplit: boolean;
  onDestination(next: boolean): void;
  onOpen(target: Target, workspaceId: string): void;
  onTerminal(workspaceId: string): void;
  onClose(): void;
  onRefresh(): void;
  busy: boolean;
  error: string | null;
  menuActions: PaneMenuAction[];
  onHeightChange(height: number): void;
}) {
  const [mode, setMode] = useState<PickerMode | "scope">(initialMode);
  const [returnMode, setReturnMode] = useState<PickerMode>("agent");
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [path, setPath] = useState("README.md");
  const [selected, setSelected] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const list = useRef<NativeFlatList<Row>>(null),
    search = useRef<NativeTextInput>(null);
  const colors = theme.colors;
  const workspaces = directory?.workspaces ?? [];
  const source = workspaces.find((workspace) => workspace.id === scope);
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const rows = useMemo<Row[]>(() => {
    const items: Row[] = [];
    if (mode === "new" || mode === "scope" || mode === "new-terminal") {
      if (mode === "scope" && returnMode !== "file")
        items.push({
          key: "all",
          kind: "option",
          title: "所有 workspace",
          subtitle: "跨 workspace 搜索",
          workspaceId: "",
          run: () => {
            setScope("all");
            setMode(returnMode);
            setQuery("");
            setSelected(0);
          },
        });
      const sorted = [...workspaces].sort(
        (a, b) =>
          Number(b.id === defaultWorkspaceId) -
          Number(a.id === defaultWorkspaceId),
      );
      for (const workspace of sorted.filter((workspace) =>
        matches(workspaceLabel(workspace)),
      ))
        items.push({
          key: workspace.id,
          kind: "option",
          title: workspace.projectCustomName ?? workspace.projectDisplayName,
          subtitle: workspace.title ?? workspace.name,
          workspaceId: workspace.id,
          badge: workspace.id === defaultWorkspaceId ? "当前来源" : undefined,
          run: () => {
            if (mode === "new")
              onOpen(
                {
                  kind: "draft",
                  draftId: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                },
                workspace.id,
              );
            else if (mode === "new-terminal") onTerminal(workspace.id);
            else {
              setScope(workspace.id);
              setMode(returnMode);
              setQuery("");
              setSelected(0);
            }
          },
        });
    } else if (mode === "agent") {
      const agents = (directory?.agents ?? []).filter(
        (agent) =>
          agent.workspaceId &&
          (scope === "all" || agent.workspaceId === scope) &&
          matches(
            `${agent.title ?? ""} ${agent.cwd} ${workspaces.find((workspace) => workspace.id === agent.workspaceId) ? workspaceLabel(workspaces.find((workspace) => workspace.id === agent.workspaceId)!) : ""}`,
          ),
      );
      const running = agents.filter(isRunning),
        recent = agents.filter((agent) => !isRunning(agent));
      const append = (
        agents: typeof running,
        title: string,
        active: boolean,
      ) => {
        if (!agents.length) return;
        items.push({
          key: `heading-${title}`,
          kind: "heading",
          title,
          count: agents.length,
          running: active,
        });
        for (const agent of agents) {
          const workspace = workspaces.find(
            (workspace) => workspace.id === agent.workspaceId,
          );
          items.push({
            key: agent.id,
            kind: "option",
            title: agent.title ?? "未命名 Agent",
            subtitle: workspace ? workspaceLabel(workspace) : agent.cwd,
            workspaceId: agent.workspaceId!,
            badge:
              agent.status === "running"
                ? "运行中"
                : agent.status === "initializing"
                  ? "启动中"
                  : openedAgentIds.has(agent.id)
                    ? "已打开"
                    : agent.status === "closed"
                      ? "已关闭"
                      : agent.status === "error"
                        ? "出错"
                        : undefined,
            running: isRunning(agent),
            run: () =>
              onOpen({ kind: "agent", agentId: agent.id }, agent.workspaceId!),
          });
        }
      };
      append(running, "正在运行", true);
      append(recent, "最近会话", false);
    } else if (mode === "terminal") {
      for (const terminal of directory?.terminals ?? []) {
        if (
          (scope === "all" || terminal.workspaceId === scope) &&
          matches(`${terminal.name ?? ""} ${terminal.cwd}`)
        )
          items.push({
            key: terminal.id,
            kind: "option",
            title: terminal.name ?? "终端",
            subtitle: terminal.cwd,
            workspaceId: terminal.workspaceId,
            run: () =>
              onOpen(
                { kind: "terminal", terminalId: terminal.id },
                terminal.workspaceId,
              ),
          });
      }
    }
    return items;
  }, [
    mode,
    scope,
    query,
    directory,
    openedAgentIds,
    defaultWorkspaceId,
    returnMode,
    onOpen,
    onTerminal,
  ]);
  const options = useMemo(
    () =>
      rows.filter(
        (row): row is Extract<Row, { kind: "option" }> => row.kind === "option",
      ),
    [rows],
  );
  const activeOption =
    options[Math.min(selected, Math.max(0, options.length - 1))];
  const layouts = useMemo(() => {
    let offset = 4;
    return rows.map((row, index) => {
      const length = row.kind === "heading" ? HEADING_HEIGHT : RESULT_HEIGHT;
      const value = { length, offset, index };
      offset += length;
      return value;
    });
  }, [rows]);
  const keyboard = useRef({ options, selected });
  keyboard.current = { options, selected };
  useEffect(() => {
    if (mode !== "menu") search.current?.focus();
  }, [mode]);
  useEffect(
    () =>
      onPickerKeys((key) => {
        const { options, selected } = keyboard.current;
        if (key === "Enter") {
          if (options.length)
            options[Math.min(selected, options.length - 1)]?.run();
          return mode !== "file";
        }
        if ((key === "ArrowDown" || key === "ArrowUp") && options.length) {
          setSelected(
            (current) =>
              (current + (key === "ArrowDown" ? 1 : -1) + options.length) %
              options.length,
          );
          return true;
        }
        return false;
      }, onClose),
    [onClose, mode],
  );
  useEffect(() => {
    const index = rows.findIndex((row) => row.key === activeOption?.key);
    if (index < 0) return;
    if (selected === 0)
      list.current?.scrollToOffset({ offset: 0, animated: false });
    else
      list.current?.scrollToIndex({
        index,
        animated: false,
        viewPosition: 0.5,
      });
  }, [selected, query, mode, scope]);
  useLayoutEffect(() => {
    const count =
      mode === "new" || mode === "scope" || mode === "new-terminal"
        ? workspaces.length
        : mode === "terminal"
          ? (directory?.terminals.length ?? 0)
          : (directory?.agents.length ?? 0);
    const height =
      mode === "menu"
        ? Math.min(350, menuActions.length * 36 + 10)
        : mode === "file"
          ? 290
          : Math.max(
              280,
              Math.min(
                520,
                60 +
                  40 +
                  48 +
                  8 +
                  count * RESULT_HEIGHT +
                  (mode === "agent" ? 104 : mode === "terminal" ? 44 : 0),
              ),
            );
    onHeightChange(height);
  }, [
    mode,
    workspaces.length,
    directory?.agents.length,
    directory?.terminals.length,
    menuActions.length,
    onHeightChange,
  ]);
  const changeMode = (next: PickerMode) => {
    setMode(next);
    setQuery("");
    setSelected(0);
    if (next === "file" && scope === "all" && defaultWorkspaceId)
      setScope(defaultWorkspaceId);
  };
  const choosingWorkspace =
    mode === "new" || mode === "scope" || mode === "new-terminal";
  const searchLabel = choosingWorkspace
    ? "搜索 workspace"
    : mode === "file"
      ? "输入相对文件路径"
      : mode === "terminal"
        ? "搜索终端或 workspace"
        : "搜索 Agent 或 workspace";
  const inputValue = mode === "file" ? path : query;
  const menuButton = (action: PaneMenuAction, index: number) => (
    <PickerRow
      key={action.label}
      theme={theme}
      disabled={action.disabled || busy}
      label={action.label}
      icon={action.icon}
      onPress={action.run}
      testID={`split-menu-action-${index}`}
    />
  );
  if (mode === "menu")
    return (
      <ScrollView
        testID="split-resource-picker"
        style={{ maxHeight: 350 }}
        contentContainerStyle={{ padding: 5, gap: 2 }}
      >
        {menuActions.map(menuButton)}
      </ScrollView>
    );
  return (
    <View testID="split-resource-picker" style={{ flex: 1, minHeight: 0 }}>
      <View style={{ padding: 10, paddingBottom: 6 }}>
        <View
          testID="split-search-field"
          style={{
            height: 40,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 10,
            borderWidth: 1,
            borderRadius: 8,
            borderColor: searchFocused ? colors.foregroundMuted : colors.border,
            backgroundColor: colors.surface0,
          }}
        >
          {choosingWorkspace ? (
            <IconButton
              theme={theme}
              label="返回资源列表"
              icon="ArrowLeft"
              size={24}
              tooltip={false}
              onPress={() =>
                changeMode(mode === "scope" ? returnMode : "agent")
              }
            />
          ) : (
            <Icon
              name={mode === "file" ? "FileCode2" : "Search"}
              size={15}
              color={colors.foregroundMuted}
            />
          )}
          <TextInput
            ref={search}
            testID="split-resource-search"
            accessibilityLabel={mode === "file" ? "文件路径" : searchLabel}
            accessibilityHint={
              mode === "file"
                ? "Enter 打开文件，Esc 关闭"
                : "使用上下方向键选择，Enter 打开，Esc 关闭"
            }
            placeholder={searchLabel}
            placeholderTextColor={colors.foregroundMuted}
            value={inputValue}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onSubmitEditing={() => {
              if (mode === "file" && scope !== "all" && path.trim())
                onOpen({ kind: "file", path: path.trim() }, scope);
            }}
            onChangeText={(value) => {
              if (mode === "file") setPath(value);
              else setQuery(value);
              setSelected(0);
            }}
            style={{
              flex: 1,
              minWidth: 0,
              color: colors.foreground,
              fontSize: 14,
              height: "100%",
              padding: 0,
              borderWidth: 0,
              backgroundColor: "transparent",
              // The surrounding field owns focus, including the icon and keycap.
              outlineWidth: 0,
            }}
          />
          {inputValue.length > 0 && (
            <IconButton
              theme={theme}
              icon="X"
              label="清空输入"
              testID="split-search-clear"
              size={24}
              tooltip={false}
              onPress={() => {
                if (mode === "file") setPath("");
                else setQuery("");
                setSelected(0);
                search.current?.focus();
              }}
            />
          )}
          <PickerChip
            theme={theme}
            label="关闭添加面板"
            text="esc"
            keycap
            onPress={onClose}
          />
        </View>
      </View>
      <View
        style={{
          height: 44,
          paddingHorizontal: 10,
          paddingBottom: 6,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        {choosingWorkspace ? (
          <Text
            style={{
              paddingHorizontal: 2,
              fontSize: 11,
              color: colors.foregroundMuted,
            }}
          >
            {mode === "new"
              ? "选择新 Agent 的 workspace"
              : mode === "new-terminal"
                ? "选择终端的 workspace"
                : "选择来源 workspace"}
          </Text>
        ) : (
          <>
            <PickerChip
              theme={theme}
              label={`来源：${source ? workspaceLabel(source) : "所有 workspace"}`}
              text={source ? (source.title ?? source.name) : "所有 workspace"}
              icon="Layers"
              trailingIcon="ChevronDown"
              grow
              onPress={() => {
                setReturnMode(mode as PickerMode);
                setMode("scope");
                setQuery("");
                setSelected(0);
              }}
            />
            <View
              accessibilityRole="tablist"
              accessibilityLabel="资源类型"
              style={{
                flexDirection: "row",
                padding: 3,
                gap: 2,
                borderRadius: 7,
                backgroundColor: colors.surface0,
              }}
            >
              {(["agent", "terminal", "file"] as const).map((value) => (
                <PickerChip
                  key={value}
                  theme={theme}
                  role="tab"
                  text={
                    value === "agent"
                      ? "Agent"
                      : value === "terminal"
                        ? "终端"
                        : "文件"
                  }
                  active={mode === value}
                  onPress={() => changeMode(value)}
                />
              ))}
            </View>
          </>
        )}
      </View>
      {error && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.statusDanger, fontSize: 12, padding: 10 }}
        >
          {error}
        </Text>
      )}
      {mode === "agent" && (
        <View
          style={{
            paddingHorizontal: 10,
            paddingBottom: 8,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <PickerRow
            theme={theme}
            label="新建 Agent"
            hint="选择 workspace"
            icon="SquarePen"
            featured
            onPress={() => changeMode("new")}
            disabled={busy}
          />
        </View>
      )}
      {mode === "terminal" && (
        <View
          style={{
            paddingHorizontal: 10,
            paddingBottom: 8,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <PickerRow
            theme={theme}
            label="新建终端"
            icon="Plus"
            hint="选择 workspace"
            featured
            onPress={() => {
              setMode("new-terminal");
              setQuery("");
              setSelected(0);
            }}
            disabled={busy}
          />
        </View>
      )}
      {mode === "file" ? (
        <View style={{ flex: 1, padding: 12, gap: 12 }}>
          <Text style={{ fontSize: 12, color: colors.foregroundMuted }}>
            相对来源 workspace 的文件路径
          </Text>
          <PickerRow
            theme={theme}
            label="打开文件"
            icon="FileCode2"
            onPress={() => onOpen({ kind: "file", path: path.trim() }, scope)}
            disabled={busy || scope === "all" || !path.trim()}
          />
          <PickerRow
            theme={theme}
            label="浏览 workspace 文件"
            icon="FolderTree"
            onPress={() => onOpen({ kind: "files" }, scope)}
            disabled={busy || scope === "all"}
          />
          {scope === "all" && (
            <Text style={{ fontSize: 12, color: colors.foregroundMuted }}>
              请先在上方选择来源 workspace。
            </Text>
          )}
        </View>
      ) : (
        <FlatList<Row>
          ref={list}
          data={rows}
          keyExtractor={(row) => row.key}
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ paddingVertical: 4 }}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
          getItemLayout={(_data, index) =>
            layouts[index] ?? {
              length: RESULT_HEIGHT,
              offset: index * RESULT_HEIGHT,
              index,
            }
          }
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={() => {}}
          ListEmptyComponent={
            <View style={{ padding: 22, gap: 10 }}>
              <Text style={{ fontSize: 12, color: colors.foregroundMuted }}>
                {directory
                  ? "没有匹配结果，可换个关键词或来源。"
                  : "正在读取资源…"}
              </Text>
            </View>
          }
          renderItem={({ item }) =>
            item.kind === "heading" ? (
              <View
                style={{
                  height: HEADING_HEIGHT,
                  paddingHorizontal: 16,
                  justifyContent: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {item.running && (
                  <Icon
                    name="Activity"
                    size={11}
                    color={colors.statusSuccess}
                  />
                )}
                <Text
                  testID={item.running ? "split-running-heading" : undefined}
                  accessibilityRole="header"
                  style={{
                    fontSize: 11,
                    color: colors.foregroundMuted,
                    fontWeight: "500",
                  }}
                >
                  {item.title}
                </Text>
                <Text style={{ fontSize: 10, color: colors.foregroundMuted }}>
                  {item.count}
                </Text>
              </View>
            ) : (
              <ResultRow
                bridge={bridge}
                row={item}
                selected={activeOption?.key === item.key}
                theme={theme}
                busy={busy}
              />
            )
          }
        />
      )}
      <View
        style={{
          height: 48,
          borderTopWidth: 1,
          borderColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 10,
          gap: 6,
          backgroundColor: colors.surface0,
        }}
      >
        <IconButton
          label="刷新资源"
          icon="RefreshCw"
          size={24}
          theme={theme}
          onPress={onRefresh}
          disabled={busy}
          tooltip={false}
        />
        <Text
          numberOfLines={1}
          style={{ fontSize: 11, color: colors.foregroundMuted, flexShrink: 1 }}
        >
          {mode === "file" ? "↵ 打开文件" : "↑↓ 选择 · ↵ 打开"}
        </Text>
        <View style={{ flex: 1 }} />
        <Text
          style={{
            fontSize: 10,
            color: colors.foregroundMuted,
            marginRight: 3,
          }}
        >
          添加到
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="添加到"
          style={{ flexDirection: "row", gap: 2 }}
        >
          {([false, true] as const).map((value) => (
            <PickerChip
              key={String(value)}
              theme={theme}
              role="radio"
              text={value ? "新分屏" : "当前分屏"}
              active={newSplit === value}
              onPress={() => onDestination(value)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
function ResultRow({
  bridge,
  row,
  selected,
  theme,
  busy,
}: {
  bridge: NativeBridge;
  row: Extract<Row, { kind: "option" }>;
  selected: boolean;
  theme: PluginScreenProps["theme"];
  busy: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const colors = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开 ${row.title} · ${row.subtitle}${row.badge ? " · " + row.badge : ""}`}
      disabled={busy}
      accessibilityState={{ disabled: busy }}
      onPress={row.run}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(keyboardFocusVisible())}
      onBlur={() => setFocused(false)}
      style={{
        height: RESULT_HEIGHT,
        paddingHorizontal: 9,
        gap: 10,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 7,
        borderWidth: 1,
        borderColor: focused ? colors.foregroundMuted : "transparent",
        marginHorizontal: 6,
        backgroundColor: hovered || selected ? colors.surface2 : "transparent",
        opacity: busy ? 0.5 : 1,
      }}
    >
      {row.workspaceId ? (
        <WorkspaceIcon
          bridge={bridge}
          workspaceId={row.workspaceId}
          label={row.subtitle}
          size={22}
        />
      ) : (
        <Icon name="Layers" size={16} color={colors.foregroundMuted} />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 12,
            color: colors.foreground,
            fontWeight: selected || row.running ? "500" : "400",
          }}
        >
          {row.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 11, color: colors.foregroundMuted }}
        >
          {row.subtitle}
        </Text>
      </View>
      {row.badge && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          {row.running && (
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: colors.statusSuccess,
              }}
            />
          )}
          <Text
            style={{
              fontSize: 10,
              fontWeight: row.running ? "600" : "400",
              color: row.running
                ? colors.statusSuccess
                : colors.foregroundMuted,
            }}
          >
            {row.badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
function PickerRow({
  theme,
  label,
  hint,
  icon,
  onPress,
  disabled = false,
  compact = false,
  featured = false,
  testID,
}: {
  theme: PluginScreenProps["theme"];
  label: string;
  hint?: string;
  icon: string;
  onPress(): void;
  disabled?: boolean;
  compact?: boolean;
  featured?: boolean;
  testID?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(keyboardFocusVisible())}
      onBlur={() => setFocused(false)}
      style={{
        height: compact ? 28 : 36,
        paddingHorizontal: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: focused
          ? theme.colors.foregroundMuted
          : featured
            ? theme.colors.border
            : "transparent",
        opacity: disabled ? 0.4 : 1,
        backgroundColor: hovered
          ? theme.colors.surface2
          : featured
            ? theme.colors.surface0
            : "transparent",
      }}
    >
      <Icon name={icon} size={13} color={theme.colors.foregroundMuted} />
      <Text
        numberOfLines={1}
        style={{
          fontSize: compact ? 11 : 12,
          color: compact
            ? theme.colors.foregroundMuted
            : theme.colors.foreground,
          flex: 1,
          fontWeight: featured ? "500" : "400",
        }}
      >
        {label}
      </Text>
      {hint && (
        <Text style={{ fontSize: 10, color: theme.colors.foregroundMuted }}>
          {hint}
        </Text>
      )}
      {featured && (
        <Icon
          name="ChevronRight"
          size={12}
          color={theme.colors.foregroundMuted}
        />
      )}
    </Pressable>
  );
}

function PickerChip({
  theme,
  text,
  label = text,
  role = "button",
  active = false,
  grow = false,
  keycap = false,
  icon,
  trailingIcon,
  onPress,
}: {
  theme: PluginScreenProps["theme"];
  text: string;
  label?: string;
  role?: "button" | "tab" | "radio";
  active?: boolean;
  grow?: boolean;
  keycap?: boolean;
  icon?: string;
  trailingIcon?: string;
  onPress(): void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const colors = theme.colors;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={
        role === "tab"
          ? { selected: active }
          : role === "radio"
            ? { checked: active }
            : undefined
      }
      aria-selected={role === "tab" ? active : undefined}
      aria-checked={role === "radio" ? active : undefined}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(keyboardFocusVisible())}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        height: keycap ? 24 : 26,
        paddingHorizontal: keycap ? 5 : 7,
        flex: grow ? 1 : undefined,
        minWidth: 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        borderRadius: keycap ? 4 : 5,
        borderWidth: 1,
        borderColor: focused
          ? colors.foregroundMuted
          : keycap || grow
            ? colors.border
            : "transparent",
        backgroundColor:
          active || hovered || pressed ? colors.surface2 : "transparent",
      })}
    >
      {icon && <Icon name={icon} size={12} color={colors.foregroundMuted} />}
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          flex: grow ? 1 : undefined,
          fontSize: keycap ? 10 : 11,
          fontWeight: active ? "500" : "400",
          color: active ? colors.foreground : colors.foregroundMuted,
        }}
      >
        {text}
      </Text>
      {trailingIcon && (
        <Icon name={trailingIcon} size={11} color={colors.foregroundMuted} />
      )}
    </Pressable>
  );
}
