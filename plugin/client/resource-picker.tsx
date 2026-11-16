import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FlatList, Icon } from "@getpaseo/plugin/client/ui";
import { QueryClientProvider, useMutation } from "@tanstack/react-query";
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
import type { NativeBridge, NativeStatusBucket } from "./native-types";
import { ProjectIcon, WorkspaceIcon } from "./workspace-icon";
import { workspaceLabel, type Directory } from "./directory";
import { keyboardFocusVisible, onPickerKeys } from "./web";
import { IconButton } from "./compact-ui";
import { WorkspaceFields } from "./workspace-creator";
import { DialogButton, DialogChoice, DialogInput } from "./add-dialog-ui";
import type { WorkspaceCreation } from "./workspace-creation";
import { sortPickerProjects } from "./project-picker";
import {
  groupPickerAgents,
  pickerAgentActivity,
  type AgentFilter,
} from "./agent-picker";

export type PickerMode =
  | "agent"
  | "new"
  | "new-workspace"
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
const RESULT_HEIGHT = 58,
  HEADING_HEIGHT = 32;
type Row =
  | {
      key: string;
      kind: "heading";
      title: string;
      count: number;
      running?: boolean;
      unread?: boolean;
    }
  | {
      key: string;
      kind: "option";
      title: string;
      subtitle: string;
      workspaceId: string;
      icon?: string;
      action?: string;
      agentId?: string;
      badge?: string;
      badgeIcon?: string;
      running?: boolean;
      spinner?: boolean;
      status?: NativeStatusBucket | null;
      backgroundCount?: number;
      select?(): void;
      run(): void;
    };
const tabs = [
  { mode: "agent", label: "已有 Agent", icon: "MessagesSquare" },
  { mode: "terminal", label: "终端", icon: "Terminal" },
  { mode: "file", label: "文件", icon: "FileCode2" },
  { mode: "new", label: "新建 Agent", icon: "Plus" },
] as const;

export function ResourcePicker({
  bridge,
  serverId,
  theme,
  directory,
  initialMode,
  defaultWorkspaceId,
  openedAgentIds,
  newSplit,
  onDestination,
  onOpen,
  onTerminal,
  onCreateWorkspace,
  onArchive,
  onClose,
  onRefresh,
  busy,
  error,
  menuActions,
  onHeightChange,
}: {
  bridge: NativeBridge;
  serverId: string;
  theme: PluginScreenProps["theme"];
  directory?: Directory;
  initialMode: PickerMode;
  defaultWorkspaceId?: string;
  openedAgentIds: Set<string>;
  newSplit: boolean;
  onDestination(next: boolean): void;
  onOpen(target: Target, workspaceId: string): void;
  onTerminal(workspaceId: string): void;
  onCreateWorkspace(input: WorkspaceCreation): Promise<void>;
  onArchive(agentId: string): Promise<void>;
  onClose(): void;
  onRefresh(): void;
  busy: boolean;
  error: string | null;
  menuActions: PaneMenuAction[];
  onHeightChange(height: number): void;
}) {
  const c = theme.colors;
  const [mode, setMode] = useState<PickerMode>(
    initialMode === "new-workspace" ? "new" : initialMode,
  );
  const [compact, setCompact] = useState(false);
  const [projectId, setProjectId] = useState(
    initialMode === "new" || initialMode === "new-terminal" ? "default" : "all",
  );
  const [projectQuery, setProjectQuery] = useState("");
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("all");
  const [workspaceChoice, setWorkspaceChoice] = useState<string | null>(
    initialMode === "new-workspace" ? "create" : null,
  );
  const [title, setTitle] = useState("");
  const [isolationChoice, setIsolationChoice] = useState<
    WorkspaceCreation["isolation"] | null
  >(null);
  const [path, setPath] = useState("README.md"),
    [browseFiles, setBrowseFiles] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<
    Record<string, NativeStatusBucket | null>
  >({});
  const projectSearch = useRef<NativeTextInput>(null),
    search = useRef<NativeTextInput>(null),
    list = useRef<NativeFlatList<Row>>(null);
  const attempt = useRef({ input: "", key: "" });
  const defaultProjectId = directory?.workspaces.find(
    (w) => w.id === defaultWorkspaceId,
  )?.projectId;
  const needsWorkspace =
    mode === "new" || mode === "new-terminal" || mode === "file";
  const effectiveProjectId =
    projectId === "default" || (projectId === "all" && mode === "new")
      ? (defaultProjectId ?? directory?.projects[0]?.projectId)
      : projectId;
  const project = directory?.projects.find(
    (p) => p.projectId === effectiveProjectId,
  );
  const projects = useMemo(
    () =>
      sortPickerProjects(
        directory?.projects ?? [],
        directory?.workspaces ?? [],
      ).filter((p) =>
        `${p.projectCustomName ?? p.projectDisplayName} ${p.projectRootPath}`
          .toLocaleLowerCase()
          .includes(projectQuery.trim().toLocaleLowerCase()),
      ),
    [directory?.projects, directory?.workspaces, projectQuery],
  );
  const workspaces = (directory?.workspaces ?? []).filter(
    (w) => effectiveProjectId === "all" || w.projectId === effectiveProjectId,
  );
  const workspace =
    workspaces.find((w) => w.id === workspaceChoice) ??
    workspaces.find((w) => w.id === defaultWorkspaceId) ??
    workspaces[0];
  const creating =
    mode === "new" &&
    Boolean(project) &&
    (workspaceChoice === "create" || !workspaces.length);
  const isolation =
    isolationChoice ??
    (project?.projectKind === "git" ? "worktree" : "directory");
  const creation = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!project) throw new Error("请先选择 project。");
      const input = JSON.stringify([
        project.projectId,
        title.trim(),
        isolation,
      ]);
      if (attempt.current.input !== input)
        attempt.current = {
          input,
          key: `deck-workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        };
      await onCreateWorkspace({
        project,
        title,
        isolation,
        idempotencyKey: attempt.current.key,
      });
    },
  });
  const pending = busy || creation.isPending;
  const matches = (text: string) =>
    text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const reportAgentStatus = useCallback(
    (id: string, status: NativeStatusBucket | null) =>
      setAgentStatuses((previous) => {
        if ((previous[id] ?? null) === status) return previous;
        const next = { ...previous };
        if (status) next[id] = status;
        else delete next[id];
        return next;
      }),
    [],
  );
  const matchingAgents = useMemo(
    () =>
      (directory?.agents ?? []).filter((agent) => {
        const source = workspaces.find((w) => w.id === agent.workspaceId);
        return (
          source &&
          matches(`${agent.title ?? ""} ${agent.cwd} ${workspaceLabel(source)}`)
        );
      }),
    [directory, effectiveProjectId, query],
  );
  const agentSections = useMemo(
    () => groupPickerAgents(matchingAgents, agentStatuses),
    [matchingAgents, agentStatuses],
  );
  const agentCounts = Object.fromEntries(
    agentSections.map((section) => [section.key, section.agents.length]),
  );
  const agentFilters: { key: AgentFilter; label: string; count: number }[] = [
    {
      key: "all",
      label: "全部",
      count: agentSections.reduce(
        (sum, section) => sum + section.agents.length,
        0,
      ),
    },
    { key: "attention", label: "未读", count: agentCounts.attention },
    { key: "running", label: "运行中", count: agentCounts.running },
    { key: "needs_input", label: "待处理", count: agentCounts.needs_input },
    ...(agentCounts.background
      ? [
          {
            key: "background" as const,
            label: "后台",
            count: agentCounts.background,
          },
        ]
      : []),
  ];
  const rows = useMemo<Row[]>(() => {
    if (needsWorkspace)
      return workspaces.map((w) => ({
        key: w.id,
        kind: "option",
        title: w.title ?? w.name,
        subtitle:
          effectiveProjectId === "all"
            ? (w.projectCustomName ?? w.projectDisplayName)
            : w.workspaceKind === "worktree"
              ? "独立 worktree"
              : "项目原目录",
        workspaceId: w.id,
        badge: w.id === defaultWorkspaceId ? "当前来源" : undefined,
        run: () => setWorkspaceChoice(w.id),
      }));
    if (mode === "terminal")
      return (directory?.terminals ?? [])
        .filter(
          (t) =>
            workspaces.some((w) => w.id === t.workspaceId) &&
            matches(`${t.title ?? t.name ?? ""} ${t.cwd}`),
        )
        .map((t) => ({
          key: t.id,
          kind: "option",
          title: t.title || t.name || "终端",
          subtitle: t.cwd,
          workspaceId: t.workspaceId,
          run: () => setSelectedKey(t.id),
        }));
    if (mode !== "agent") return [];
    const result: Row[] = [];
    for (const section of agentSections) {
      if (
        !section.agents.length ||
        (agentFilter !== "all" && section.key !== agentFilter)
      )
        continue;
      result.push({
        key: `heading-${section.key}`,
        kind: "heading",
        title: section.label,
        count: section.agents.length,
        running: section.key === "running",
        unread: section.key === "attention",
      });
      for (const a of section.agents) {
        const w = workspaces.find((w) => w.id === a.workspaceId);
        const activity = pickerAgentActivity(a, agentStatuses[a.id]);
        const badge =
          activity.badge ??
          (openedAgentIds.has(a.id)
            ? "已打开"
            : a.status === "closed"
              ? "已关闭"
              : undefined);
        result.push({
          key: a.id,
          kind: "option",
          title: a.title ?? "未命名 Agent",
          subtitle: w ? workspaceLabel(w) : a.cwd,
          workspaceId: a.workspaceId!,
          agentId: a.id,
          action: "添加",
          badge,
          badgeIcon:
            badge === "已打开"
              ? "Check"
              : badge === "已关闭"
                ? "CircleStop"
                : undefined,
          running: activity.running,
          spinner: activity.status === "running" && a.status === "running",
          status: activity.status,
          backgroundCount:
            section.key === "background" ? 0 : activity.backgroundCount,
          select: () => setSelectedKey(a.id),
          run: () => onOpen({ kind: "agent", agentId: a.id }, a.workspaceId!),
        });
      }
    }
    return result;
  }, [
    mode,
    directory,
    effectiveProjectId,
    query,
    defaultWorkspaceId,
    agentStatuses,
    openedAgentIds,
    agentFilter,
    agentSections,
    onOpen,
  ]);
  const options = rows.filter(
    (row): row is Extract<Row, { kind: "option" }> => row.kind === "option",
  );
  const selected = needsWorkspace
    ? Math.max(
        0,
        options.findIndex((o) => o.key === workspace?.id),
      )
    : Math.max(
        0,
        options.findIndex((o) => o.key === selectedKey),
      );
  const active = options[selected];
  const confirm = () => {
    if (pending) return;
    if (creating) {
      creation.mutate();
      return;
    }
    if (mode === "new" && workspace)
      onOpen(
        {
          kind: "draft",
          draftId: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        },
        workspace.id,
      );
    else if (mode === "new-terminal" && workspace) onTerminal(workspace.id);
    else if (mode === "file" && workspace && (browseFiles || path.trim()))
      onOpen(
        browseFiles ? { kind: "files" } : { kind: "file", path: path.trim() },
        workspace.id,
      );
    else if (mode === "agent" && active?.agentId)
      onOpen({ kind: "agent", agentId: active.agentId }, active.workspaceId);
    else if (mode === "terminal" && active)
      onOpen({ kind: "terminal", terminalId: active.key }, active.workspaceId);
  };
  const keyboard = useRef({ options, rows, selected, confirm, pending });
  keyboard.current = { options, rows, selected, confirm, pending };
  useEffect(() => {
    if (mode === "new" || mode === "new-terminal" || mode === "file")
      projectSearch.current?.focus();
    else search.current?.focus();
  }, [mode]);
  useEffect(
    () =>
      onPickerKeys((key) => {
        const state = keyboard.current;
        if (state.pending) return true;
        if (key === "Enter") {
          state.confirm();
          return true;
        }
        if (
          (key === "ArrowDown" || key === "ArrowUp") &&
          state.options.length
        ) {
          const index =
            (state.selected +
              (key === "ArrowDown" ? 1 : -1) +
              state.options.length) %
            state.options.length;
          (state.options[index].select ?? state.options[index].run)();
          if (index === 0)
            list.current?.scrollToOffset({ offset: 0, animated: false });
          else {
            const rowIndex = state.rows.findIndex(
              (row) => row.key === state.options[index].key,
            );
            if (rowIndex >= 0)
              list.current?.scrollToIndex({
                index: rowIndex,
                animated: false,
                viewPosition: 0.5,
              });
          }
          return true;
        }
        return false;
      }, onClose),
    [onClose],
  );
  useEffect(() => {
    // A selected/default row is not a scroll request. In particular, centering
    // before FlatList has measured its viewport hides the first group heading.
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [mode, effectiveProjectId, query, agentFilter]);
  useLayoutEffect(
    () =>
      onHeightChange(
        mode === "menu" ? Math.min(350, menuActions.length * 36 + 10) : 640,
      ),
    [mode, menuActions.length, onHeightChange],
  );
  const switchMode = (next: PickerMode) => {
    if (pending) return;
    setMode(next);
    setQuery("");
    setAgentFilter("all");
    setSelectedKey(null);
    setWorkspaceChoice(null);
    creation.reset();
  };
  const chooseProject = (id: string) => {
    if (pending) return;
    setProjectId(id);
    setWorkspaceChoice(null);
    setTitle("");
    setIsolationChoice(null);
    setQuery("");
    setSelectedKey(null);
    creation.reset();
  };
  const errorText = creation.error
    ? creation.error instanceof Error
      ? creation.error.message
      : String(creation.error)
    : error;
  const canConfirm =
    !pending &&
    Boolean(
      creating
        ? project
        : needsWorkspace
          ? workspace && (mode !== "file" || browseFiles || path.trim())
          : active,
    );
  const actionLabel =
    pending && creating
      ? "正在创建…"
      : creating
        ? "创建并添加 Agent"
        : mode === "new"
          ? "新建 Agent"
          : mode === "agent"
            ? "添加 Agent"
            : mode === "new-terminal"
              ? "新建终端"
              : mode === "terminal"
                ? "添加终端"
                : browseFiles
                  ? "浏览文件"
                  : "打开文件";
  if (mode === "menu")
    return (
      <ScrollView
        testID="split-resource-picker"
        style={{ maxHeight: 350 }}
        contentContainerStyle={{ padding: 5, gap: 2 }}
      >
        {menuActions.map((action, index) => (
          <PickerRow
            key={action.label}
            theme={theme}
            disabled={action.disabled || busy}
            label={action.label}
            icon={action.icon}
            onPress={action.run}
            testID={`split-menu-action-${index}`}
          />
        ))}
      </ScrollView>
    );

  const listContent = (
    <FlatList<Row>
      ref={list}
      testID="split-resource-results"
      data={rows}
      keyExtractor={(row) => row.key}
      style={{ flex: 1, minHeight: 0 }}
      contentContainerStyle={{ paddingVertical: 4 }}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={5}
      keyboardShouldPersistTaps="handled"
      getItemLayout={(_data, index) => ({
        index,
        length:
          rows[index]?.kind === "heading" ? HEADING_HEIGHT : RESULT_HEIGHT,
        offset:
          4 +
          rows
            .slice(0, index)
            .reduce(
              (total, row) =>
                total +
                (row.kind === "heading" ? HEADING_HEIGHT : RESULT_HEIGHT),
              0,
            ),
      })}
      onScrollToIndexFailed={() => {}}
      ListEmptyComponent={
        <View style={{ padding: 24, gap: 8, alignItems: "center" }}>
          <Icon
            name={mode === "agent" ? "MessagesSquare" : "Layers"}
            size={24}
            color={c.foregroundMuted}
          />
          <Text
            style={{
              fontSize: 13,
              color: c.foregroundMuted,
              textAlign: "center",
            }}
          >
            {!directory
              ? "正在读取资源…"
              : query.trim()
                ? "没有匹配的资源"
                : mode === "agent"
                  ? "此 project 暂无 Agent"
                  : mode === "terminal"
                    ? "此 project 暂无终端"
                    : "此 project 暂无 workspace"}
          </Text>
        </View>
      }
      renderItem={({ item }) =>
        item.kind === "heading" ? (
          <View
            style={{
              height: HEADING_HEIGHT,
              paddingHorizontal: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text
              testID={
                item.unread
                  ? "split-unread-heading"
                  : item.running
                    ? "split-running-heading"
                    : undefined
              }
              style={{
                color: c.foregroundMuted,
                fontSize: 12,
                fontWeight: "500",
              }}
            >
              {item.title}
            </Text>
            <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>
              {item.count}
            </Text>
          </View>
        ) : (
          <ResultRow
            bridge={bridge}
            row={item}
            selected={item.key === active?.key}
            theme={theme}
            busy={pending}
            onArchive={onArchive}
          />
        )
      }
    />
  );
  return (
    <View
      testID="split-resource-picker"
      style={{ flex: 1, minHeight: 0 }}
      onLayout={(event) => setCompact(event.nativeEvent.layout.width < 620)}
    >
      {mode === "agent" && directory && (
        <QueryClientProvider client={bridge.queryClient}>
          {directory.agents
            .filter(
              (a) =>
                !a.archivedAt &&
                a.workspaceId &&
                workspaces.some((w) => w.id === a.workspaceId),
            )
            .map((a) => (
              <ObservePickerAgent
                key={a.id}
                agentId={a.id}
                serverId={serverId}
                workspaceId={a.workspaceId!}
                bridge={bridge}
                report={reportAgentStatus}
              />
            ))}
        </QueryClientProvider>
      )}
      <View
        style={{
          paddingHorizontal: compact ? 20 : 24,
          paddingTop: 16,
          paddingBottom: 8,
          flexDirection: "row",
          gap: 16,
          alignItems: "center",
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            flex: 1,
            color: c.foreground,
            fontSize: 20,
            fontWeight: "600",
            letterSpacing: -0.4,
          }}
        >
          添加到 Deck
        </Text>
        <IconButton
          theme={theme}
          label="关闭添加面板"
          icon="X"
          size={32}
          tooltip={false}
          disabled={pending}
          onPress={onClose}
        />
      </View>
      <View
        accessibilityRole="tablist"
        accessibilityLabel="资源类型"
        style={{
          flexDirection: "row",
          paddingHorizontal: compact ? 12 : 24,
          gap: compact ? 0 : 20,
          borderBottomWidth: 1,
          borderColor: c.border,
        }}
      >
        {tabs.map((tab) => (
          <Pressable
            key={tab.mode}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            aria-selected={
              mode === tab.mode ||
              (tab.mode === "terminal" && mode === "new-terminal")
            }
            accessibilityState={{
              selected: mode === tab.mode,
              disabled: pending,
            }}
            disabled={pending}
            onPress={() => switchMode(tab.mode)}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: compact ? 8 : 3,
              flex: compact ? 1 : undefined,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              marginLeft: tab.mode === "new" && !compact ? "auto" : undefined,
              borderBottomWidth: 2,
              borderColor:
                mode === tab.mode ||
                (tab.mode === "terminal" && mode === "new-terminal")
                  ? c.foreground
                  : "transparent",
              opacity: pressed ? 0.65 : 1,
            })}
          >
            {!compact && (
              <Icon
                name={tab.icon}
                size={15}
                color={mode === tab.mode ? c.foreground : c.foregroundMuted}
              />
            )}
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13,
                fontWeight: mode === tab.mode ? "500" : "400",
                color: mode === tab.mode ? c.foreground : c.foregroundMuted,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View
        style={{
          flex: 1,
          minHeight: 0,
          flexDirection: compact ? "column" : "row",
        }}
      >
        <View
          style={{
            width: compact ? undefined : 208,
            height: compact ? 104 : undefined,
            paddingTop: 14,
            backgroundColor: c.surface1,
            borderRightWidth: compact ? 0 : 1,
            borderBottomWidth: compact ? 1 : 0,
            borderColor: c.border,
          }}
        >
          <View
            style={{
              paddingHorizontal: 12,
              gap: 10,
              flexDirection: compact ? "row" : "column",
              alignItems: compact ? "center" : undefined,
            }}
          >
            <Text
              style={{
                color: c.foregroundMuted,
                fontSize: 11,
                fontWeight: "500",
                letterSpacing: 0.3,
              }}
            >
              PROJECT
            </Text>
            <View style={{ flex: compact ? 1 : undefined }}>
              <DialogInput
                ref={projectSearch}
                theme={theme}
                icon="Search"
                label="搜索 project"
                value={projectQuery}
                onChangeText={setProjectQuery}
                onSubmit={() => {
                  if (projects[0]) chooseProject(projects[0].projectId);
                }}
                disabled={pending}
                testID="split-project-search"
              />
            </View>
          </View>
          <FlatList
            data={[
              ...(mode !== "new"
                ? [
                    {
                      projectId: "all",
                      projectDisplayName: "所有 project",
                      projectKind: "directory" as const,
                      projectRootPath: "",
                    },
                  ]
                : []),
              ...projects,
            ]}
            horizontal={compact}
            keyExtractor={(p) => p.projectId}
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ padding: 8, gap: 3 }}
            initialNumToRender={12}
            windowSize={5}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text
                style={{ padding: 12, fontSize: 12, color: c.foregroundMuted }}
              >
                {directory ? "没有匹配的 project" : "正在读取…"}
              </Text>
            }
            renderItem={({ item: p }) => (
              <View style={{ width: compact ? 174 : undefined }}>
                <DialogChoice
                  theme={theme}
                  compact
                  title={p.projectCustomName ?? p.projectDisplayName}
                  leadingIcon={
                    <View
                      aria-hidden
                      pointerEvents="none"
                      style={{
                        width: 20,
                        height: 20,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {p.projectId === "all" ? (
                        <Icon
                          name="Layers"
                          size={18}
                          color={c.foregroundMuted}
                        />
                      ) : (
                        <ProjectIcon
                          bridge={bridge}
                          projectId={p.projectId}
                          label={p.projectCustomName ?? p.projectDisplayName}
                          size={20}
                        />
                      )}
                    </View>
                  }
                  selected={p.projectId === effectiveProjectId}
                  onPress={() => chooseProject(p.projectId)}
                  disabled={pending}
                  testID={`split-project-${p.projectId}`}
                />
              </View>
            )}
          />
        </View>
        <View
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            padding: compact ? 16 : 20,
            gap: 16,
          }}
        >
          {mode !== "agent" && (
            <View style={{ gap: 5 }}>
              <Text
                numberOfLines={1}
                style={{ color: c.foreground, fontSize: 14, fontWeight: "500" }}
              >
                {project
                  ? (project.projectCustomName ?? project.projectDisplayName)
                  : "所有 project"}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: c.foregroundMuted,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
              >
                {project?.projectRootPath ?? "跨 project 选择已有资源"}
              </Text>
            </View>
          )}
          {mode === "new" ? (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    color: c.foreground,
                    fontSize: 12,
                    fontWeight: "500",
                  }}
                >
                  {creating ? "新建 workspace" : "选择 workspace"}
                </Text>
                {project && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      creating ? "选择已有 workspace" : "新建 workspace"
                    }
                    disabled={pending || (creating && !workspaces.length)}
                    onPress={() => {
                      setWorkspaceChoice(creating ? null : "create");
                      creation.reset();
                    }}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 2,
                      opacity: creating && !workspaces.length ? 0 : 1,
                    }}
                  >
                    <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                      {creating ? "选择已有 workspace" : "＋ 新建 workspace"}
                    </Text>
                  </Pressable>
                )}
              </View>
              {creating && project ? (
                <ScrollView
                  style={{ flex: 1, minHeight: 0 }}
                  contentContainerStyle={{ paddingBottom: 8 }}
                  keyboardShouldPersistTaps="handled"
                >
                  <WorkspaceFields
                    theme={theme}
                    project={project}
                    title={title}
                    isolation={isolation}
                    busy={pending}
                    onTitle={(value) => {
                      setTitle(value);
                      creation.reset();
                    }}
                    onIsolation={(value) => {
                      setIsolationChoice(value);
                      creation.reset();
                    }}
                  />
                </ScrollView>
              ) : (
                listContent
              )}
            </>
          ) : mode === "file" ? (
            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ gap: 14 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text
                style={{ color: c.foreground, fontSize: 12, fontWeight: "500" }}
              >
                选择 workspace
              </Text>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Workspace"
              >
                {workspaces.map((w) => (
                  <DialogChoice
                    key={w.id}
                    theme={theme}
                    title={w.title ?? w.name}
                    icon="Layers"
                    selected={w.id === workspace?.id}
                    onPress={() => setWorkspaceChoice(w.id)}
                    disabled={pending}
                    compact
                  />
                ))}
              </View>
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    color: c.foreground,
                    fontSize: 12,
                    fontWeight: "500",
                  }}
                >
                  文件路径
                </Text>
                <DialogInput
                  theme={theme}
                  label="文件路径"
                  placeholder="相对 workspace 的文件路径"
                  value={path}
                  onChangeText={(value) => {
                    setPath(value);
                    setBrowseFiles(false);
                  }}
                  onSubmit={confirm}
                  disabled={pending}
                  testID="split-file-path"
                />
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel="浏览 workspace 文件"
                  accessibilityState={{ checked: browseFiles }}
                  aria-checked={browseFiles}
                  onPress={() => setBrowseFiles((v) => !v)}
                  style={{
                    paddingVertical: 6,
                    flexDirection: "row",
                    gap: 7,
                    alignItems: "center",
                  }}
                >
                  <Icon
                    name={browseFiles ? "SquareCheck" : "Square"}
                    size={14}
                    color={c.foregroundMuted}
                  />
                  <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                    浏览 workspace 文件
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : (
            <>
              <View
                testID={mode === "agent" ? "split-agent-toolbar" : undefined}
                style={{
                  flexDirection: "row",
                  gap: 8,
                  alignItems: "center",
                  minHeight: 38,
                }}
              >
                <View
                  style={
                    mode === "agent"
                      ? { width: compact ? 130 : 180, flexShrink: 0 }
                      : { flex: 1 }
                  }
                >
                  <DialogInput
                    ref={search}
                    theme={theme}
                    icon="Search"
                    label={
                      mode === "agent"
                        ? "搜索 Agent、workspace 或 project"
                        : mode === "terminal"
                          ? "搜索终端"
                          : "选择 workspace"
                    }
                    placeholder={mode === "agent" ? "搜索 Agent…" : undefined}
                    value={query}
                    onChangeText={(value) => {
                      setQuery(value);
                      setSelectedKey(null);
                    }}
                    disabled={pending}
                    testID="split-resource-search"
                  />
                </View>
                {mode === "agent" && (
                  <ScrollView
                    testID="split-agent-filters"
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ flex: 1, minWidth: 0, maxHeight: 38 }}
                    contentContainerStyle={{ alignItems: "center", gap: 5 }}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View
                      accessibilityRole="radiogroup"
                      accessibilityLabel="Agent 状态"
                      style={{ flexDirection: "row", gap: 5 }}
                    >
                      {agentFilters.map((filter) => (
                        <PickerChip
                          key={filter.key}
                          theme={theme}
                          role="radio"
                          text={`${filter.label} ${filter.count}`}
                          label={`${filter.label} Agent ${filter.count}`}
                          active={agentFilter === filter.key}
                          disabled={pending}
                          onPress={() => {
                            setAgentFilter(filter.key);
                            setSelectedKey(null);
                          }}
                        />
                      ))}
                    </View>
                  </ScrollView>
                )}
                {mode !== "agent" && (
                  <DialogButton
                    theme={theme}
                    label={mode === "new-terminal" ? "已有终端" : "新建终端"}
                    onPress={() =>
                      switchMode(
                        mode === "new-terminal" ? "terminal" : "new-terminal",
                      )
                    }
                    disabled={pending}
                  />
                )}
              </View>
              {listContent}
            </>
          )}
          {errorText && (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{ color: c.statusDanger, fontSize: 12, lineHeight: 18 }}
            >
              {errorText}
            </Text>
          )}
        </View>
      </View>
      <View
        style={{
          paddingHorizontal: compact ? 16 : 24,
          paddingVertical: 14,
          gap: 12,
          borderTopWidth: 1,
          borderColor: c.border,
          flexDirection: compact ? "column" : "row",
          alignItems: compact ? "stretch" : "center",
          backgroundColor: c.surface1,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flex: compact ? undefined : 1,
          }}
        >
          <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>添加到</Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="添加到"
            style={{ flexDirection: "row", gap: 3 }}
          >
            {[false, true].map((value) => (
              <PickerChip
                key={String(value)}
                theme={theme}
                text={value ? "新分屏" : "当前分屏"}
                role="radio"
                active={newSplit === value}
                disabled={pending}
                onPress={() => {
                  if (!pending) onDestination(value);
                }}
              />
            ))}
          </View>
          <IconButton
            theme={theme}
            label="刷新资源"
            icon="RefreshCw"
            size={28}
            tooltip={false}
            disabled={pending}
            onPress={onRefresh}
          />
        </View>
        <View
          style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}
        >
          <DialogButton
            theme={theme}
            label="取消"
            onPress={onClose}
            disabled={pending}
          />
          <DialogButton
            theme={theme}
            label={actionLabel}
            primary
            onPress={confirm}
            disabled={!canConfirm}
            busy={pending}
            testID={
              creating ? "split-create-workspace" : "split-confirm-resource"
            }
          />
        </View>
      </View>
    </View>
  );
}

function ObservePickerAgent({
  agentId,
  serverId,
  workspaceId,
  bridge,
  report,
}: {
  agentId: string;
  serverId: string;
  workspaceId: string;
  bridge: NativeBridge;
  report(agentId: string, status: NativeStatusBucket | null): void;
}) {
  const tab = useMemo(
    () => ({
      tabId: `deck-picker:${agentId}`,
      key: agentId,
      kind: "agent",
      target: { kind: "agent" as const, agentId },
    }),
    [agentId],
  );
  return (
    <bridge.WorkspaceTabPresentationResolver
      tab={tab}
      serverId={serverId}
      workspaceId={workspaceId}
    >
      {(presentation) => (
        <ReportPickerAgentStatus
          agentId={agentId}
          status={presentation.statusBucket}
          report={report}
        />
      )}
    </bridge.WorkspaceTabPresentationResolver>
  );
}

function ReportPickerAgentStatus({
  agentId,
  status,
  report,
}: {
  agentId: string;
  status: NativeStatusBucket | null;
  report(agentId: string, status: NativeStatusBucket | null): void;
}) {
  useLayoutEffect(() => {
    report(agentId, status);
  }, [agentId, status, report]);
  useEffect(() => () => report(agentId, null), [agentId, report]);
  return null;
}

function ResultRow({
  bridge,
  row,
  selected,
  theme,
  busy,
  onArchive,
}: {
  bridge: NativeBridge;
  row: Extract<Row, { kind: "option" }>;
  selected: boolean;
  theme: PluginScreenProps["theme"];
  busy: boolean;
  onArchive(agentId: string): Promise<void>;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const colors = theme.colors;
  return (
    <View
      style={{
        height: RESULT_HEIGHT,
        paddingRight: row.agentId ? 4 : 0,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 7,
        marginHorizontal: 6,
        backgroundColor: hovered || selected ? colors.surface2 : "transparent",
        opacity: busy ? 0.5 : 1,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${row.action ?? "选择"} ${row.title} · ${row.subtitle}${row.badge ? " · " + row.badge : ""}`}
        disabled={busy}
        accessibilityState={{ disabled: busy, selected }}
        aria-pressed={selected}
        onPress={row.run}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setFocused(keyboardFocusVisible())}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          paddingHorizontal: 9,
          gap: 10,
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 7,
          borderWidth: 1,
          borderColor: focused ? colors.foregroundMuted : "transparent",
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
          <Icon
            name={row.icon ?? "Layers"}
            size={16}
            color={colors.foregroundMuted}
          />
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13,
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
        {selected && <Icon name="Check" size={14} color={colors.accent} />}
        {row.badge && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
            }}
          >
            {row.spinner ? (
              <View
                testID={`split-agent-running-indicator-${row.agentId}`}
                pointerEvents="none"
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <bridge.StatusRing />
              </View>
            ) : row.status ? (
              <bridge.StatusIcon
                statusBucket={row.status}
                size={13}
                backdrop="surface0"
              />
            ) : row.badgeIcon ? (
              <Icon
                name={row.badgeIcon}
                size={13}
                color={colors.foregroundMuted}
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11,
                lineHeight: 16,
                fontWeight: row.status ? "500" : "400",
                color:
                  row.status === "needs_input"
                    ? colors.statusWarning
                    : row.status === "failed"
                      ? colors.statusDanger
                      : row.status === "attention" || row.status === "running"
                        ? colors.statusSuccess
                        : colors.foregroundMuted,
              }}
            >
              {row.badge}
            </Text>
          </View>
        )}
        {Boolean(row.backgroundCount) && (
          <View
            style={{
              flexDirection: "row",
              gap: 4,
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="Layers" size={12} color={colors.foregroundMuted} />
            <Text
              numberOfLines={1}
              style={{ color: colors.foregroundMuted, fontSize: 11 }}
            >
              后台 {row.backgroundCount}
            </Text>
          </View>
        )}
      </Pressable>
      {row.agentId && (
        <IconButton
          theme={theme}
          label={`归档 ${row.title}`}
          icon="Archive"
          size={24}
          disabled={busy}
          tooltip={false}
          testID={`split-archive-agent-${row.agentId}`}
          onPress={() => void onArchive(row.agentId!)}
        />
      )}
    </View>
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
  disabled = false,
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
  disabled?: boolean;
  onPress(): void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const colors = theme.colors;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityState={
        role === "tab"
          ? { selected: active, disabled }
          : role === "radio"
            ? { checked: active, disabled }
            : { disabled }
      }
      aria-disabled={disabled}
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
