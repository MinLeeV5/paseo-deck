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
import { onPickerKeys } from "./web";
import { IconButton } from "./compact-ui";

export type PickerMode = "agent" | "new" | "terminal" | "file" | "menu";
export type PaneMenuAction = {
  label: string;
  icon: string;
  run(): void;
  disabled?: boolean;
};
type Row =
  | { key: string; kind: "heading"; title: string; running?: boolean }
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
  const [mode, setMode] = useState<PickerMode | "scope" | "new-terminal">(
    initialMode,
  );
  const [returnMode, setReturnMode] = useState<PickerMode>("agent");
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [path, setPath] = useState("README.md");
  const [selected, setSelected] = useState(0);
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
          title: `${title} · ${agents.length}`,
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
    let offset = 0;
    return rows.map((row, index) => {
      const length = row.kind === "heading" ? 28 : 52;
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
          ? 270
          : Math.max(
              240,
              Math.min(
                500,
                42 +
                  38 +
                  37 +
                  10 +
                  count * 52 +
                  (mode === "agent" ? 97 : mode === "terminal" ? 41 : 0),
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
      <View
        style={{
          height: 42,
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          paddingHorizontal: 11,
          borderBottomWidth: 1,
          borderColor: colors.border,
        }}
      >
        {mode === "new" || mode === "new-terminal" || mode === "scope" ? (
          <IconButton
            theme={theme}
            label="返回资源列表"
            icon="ArrowLeft"
            size={24}
            tooltip={false}
            onPress={() => changeMode(mode === "scope" ? returnMode : "agent")}
          />
        ) : (
          <Icon
            name={mode === "file" ? "FileCode2" : "Search"}
            size={14}
            color={colors.foregroundMuted}
          />
        )}
        <TextInput
          ref={search}
          testID="split-resource-search"
          accessibilityLabel={
            mode === "file" ? "文件路径" : "搜索 Agent 或 workspace"
          }
          placeholder={
            mode === "new" || mode === "scope" || mode === "new-terminal"
              ? "搜索 workspace"
              : mode === "file"
                ? "输入相对文件路径"
                : "搜索 Agent 或 workspace"
          }
          placeholderTextColor={colors.foregroundMuted}
          value={mode === "file" ? path : query}
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
            fontSize: 13,
            paddingVertical: 8,
          }}
        />
        <IconButton
          theme={theme}
          icon="X"
          label="关闭添加面板"
          size={24}
          onPress={onClose}
          tooltip={false}
        />
      </View>
      <View
        style={{
          paddingHorizontal: 7,
          paddingVertical: 5,
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
        }}
      >
        {mode === "new" || mode === "scope" || mode === "new-terminal" ? (
          <Text
            style={{
              height: 28,
              paddingHorizontal: 6,
              paddingTop: 6,
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`来源：${source ? workspaceLabel(source) : "所有 workspace"}`}
              onPress={() => {
                setReturnMode(mode as PickerMode);
                setMode("scope");
                setQuery("");
                setSelected(0);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                flex: 1,
                paddingHorizontal: 6,
                height: 28,
                minWidth: 0,
                borderRadius: 4,
                backgroundColor: colors.surface1,
              }}
            >
              {source ? (
                <WorkspaceIcon
                  bridge={bridge}
                  workspaceId={source.id}
                  label={source.projectDisplayName}
                />
              ) : (
                <Icon name="Layers" size={12} color={colors.foregroundMuted} />
              )}
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 11,
                  color: colors.foregroundMuted,
                  flexShrink: 1,
                }}
              >
                {source ? (source.title ?? source.name) : "所有 workspace"}
              </Text>
              <Icon
                name="ChevronDown"
                size={11}
                color={colors.foregroundMuted}
              />
            </Pressable>
            {(["agent", "terminal", "file"] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityLabel={
                  value === "agent"
                    ? "Agent"
                    : value === "terminal"
                      ? "终端"
                      : "文件"
                }
                accessibilityState={{ selected: mode === value }}
                aria-selected={mode === value}
                onPress={() => changeMode(value)}
                style={{
                  paddingHorizontal: 8,
                  height: 28,
                  justifyContent: "center",
                  borderRadius: 4,
                  backgroundColor:
                    mode === value ? colors.surface2 : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color:
                      mode === value
                        ? colors.foreground
                        : colors.foregroundMuted,
                  }}
                >
                  {value === "agent"
                    ? "Agent"
                    : value === "terminal"
                      ? "终端"
                      : "文件"}
                </Text>
              </Pressable>
            ))}
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
            paddingHorizontal: 5,
            paddingBottom: 5,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <PickerRow
            theme={theme}
            label="新建 Agent"
            hint="选择 workspace"
            icon="SquarePen"
            onPress={() => changeMode("new")}
            disabled={busy}
          />
        </View>
      )}
      {mode === "terminal" && (
        <View
          style={{
            paddingHorizontal: 5,
            paddingBottom: 5,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <PickerRow
            theme={theme}
            label="新建终端"
            icon="Plus"
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
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
          getItemLayout={(_data, index) =>
            layouts[index] ?? { length: 52, offset: index * 52, index }
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
                  height: 28,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {item.running && (
                  <Icon
                    name="Activity"
                    size={12}
                    color={colors.statusSuccess}
                  />
                )}
                <Text
                  testID={item.running ? "split-running-heading" : undefined}
                  accessibilityRole="header"
                  style={{
                    fontSize: 11,
                    color: item.running
                      ? colors.statusSuccess
                      : colors.foregroundMuted,
                    flex: 1,
                    fontWeight: item.running ? "600" : "400",
                  }}
                >
                  {item.title}
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
          height: 37,
          borderTopWidth: 1,
          borderColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 7,
          gap: 3,
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
        {([false, true] as const).map((value) => (
          <Pressable
            key={String(value)}
            accessibilityRole="radio"
            accessibilityLabel={value ? "新分屏" : "当前分屏"}
            accessibilityState={{ checked: newSplit === value }}
            aria-checked={newSplit === value}
            onPress={() => onDestination(value)}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: 4,
              backgroundColor:
                newSplit === value ? colors.surface2 : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color:
                  newSplit === value
                    ? colors.foreground
                    : colors.foregroundMuted,
              }}
            >
              {value ? "新分屏" : "当前分屏"}
            </Text>
          </Pressable>
        ))}
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
  const colors = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开 ${row.title} · ${row.subtitle}${row.badge ? " · " + row.badge : ""}`}
      disabled={busy}
      onPress={row.run}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        height: 52,
        paddingHorizontal: 11,
        gap: 9,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 5,
        marginHorizontal: 5,
        backgroundColor: hovered || selected ? colors.surface2 : "transparent",
        opacity: busy ? 0.5 : 1,
      }}
    >
      {row.workspaceId ? (
        <WorkspaceIcon
          bridge={bridge}
          workspaceId={row.workspaceId}
          label={row.subtitle}
          size={18}
        />
      ) : (
        <Icon name="Layers" size={16} color={colors.foregroundMuted} />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 12,
            color: colors.foreground,
            fontWeight: row.running ? "500" : "400",
          }}
        >
          {row.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 10, color: colors.foregroundMuted }}
        >
          {row.subtitle}
        </Text>
      </View>
      {row.badge && (
        <View
          style={{
            paddingHorizontal: 6,
            paddingVertical: 3,
            borderRadius: 4,
            backgroundColor: colors.surface1,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          {row.running && (
            <Icon name="Activity" size={11} color={colors.statusSuccess} />
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
  testID,
}: {
  theme: PluginScreenProps["theme"];
  label: string;
  hint?: string;
  icon: string;
  onPress(): void;
  disabled?: boolean;
  compact?: boolean;
  testID?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        height: compact ? 28 : 36,
        paddingHorizontal: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        borderRadius: 5,
        opacity: disabled ? 0.4 : 1,
        backgroundColor: hovered ? theme.colors.surface2 : "transparent",
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
        }}
      >
        {label}
      </Text>
      {hint && (
        <Text style={{ fontSize: 10, color: theme.colors.foregroundMuted }}>
          {hint}
        </Text>
      )}
    </Pressable>
  );
}
