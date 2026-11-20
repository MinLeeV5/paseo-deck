import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FlatList, Icon } from "@getpaseo/plugin/client/ui";
import {
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type FlatList as NativeFlatList,
  type TextInput as NativeTextInput,
} from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { resourceKey, type Target } from "../shared/model";
import type { NativeBridge, NativeStatusBucket } from "./native-types";
import { ProjectIcon } from "./workspace-icon";
import { DeckIcon } from "./deck-icon";
import type { Directory } from "./directory";
import {
  focusControl,
  keyboardFocusVisible,
  onPickerKeys,
  readWorkspaceBaseBranch,
  writeWorkspaceBaseBranch,
} from "./web";
import { IconButton } from "./compact-ui";
import { WorkspaceFields } from "./workspace-creator";
import { useWorkspaceBranchPicker } from "./workspace-branch-picker";
import { DialogButton, DialogInput } from "./add-dialog-ui";
import type { WorkspaceCreation } from "./workspace-creation";
import { sortPickerProjects } from "./project-picker";
import {
  groupPickerAgents,
  pickerAgentActivity,
  type AgentFilter,
} from "./agent-picker";
import { ResourcePickerTree } from "./resource-picker-tree";
import {
  PickerMenus,
  PickerRowMenu,
  usePickerRowMenus,
  type PickerRowAction,
} from "./picker-row-menu";
import { workspaceFilePath } from "./workspace-file";
import { usePickerConfirmation } from "./picker-confirmation";

const tabs = [
  {
    mode: "agent",
    label: "Agent",
    icon: "MessagesSquare",
    create: "新建 Agent",
    add: "添加已有 Agent",
    existing: "搜索已有 Agent",
  },
  {
    mode: "terminal",
    label: "终端",
    icon: "Terminal",
    create: "新建终端",
    add: "添加终端",
    existing: "搜索已有终端",
  },
  {
    mode: "file",
    label: "文件",
    icon: "FileCode2",
    create: "新建文件",
    add: "添加文件",
    existing: "搜索已有文件",
  },
] as const;
type ResourceMode = (typeof tabs)[number]["mode"];
export type PickerMode = ResourceMode | "new" | "new-terminal" | "menu";
export type PaneMenuAction = {
  label: string;
  icon: string;
  run(): void;
  disabled?: boolean;
  category?: "移动" | "排版" | "其它" | "关闭";
  selected?: boolean;
  destructive?: boolean;
};
type Theme = PluginScreenProps["theme"];
const RESULT_HEIGHT = 54;
const HEADING_HEIGHT = 29;
type Row =
  | {
      key: string;
      kind: "heading";
      title: string;
      count: number;
      running?: boolean;
      unread?: boolean;
    }
  | Result;
type Result = {
  key: string;
  kind: "option";
  title: string;
  subtitle?: string;
  icon: string;
  target?: Target;
  folder?: string;
  agentId?: string;
  badge?: string;
  badgeIcon?: string;
  deckNumber?: number;
  running?: boolean;
  status?: NativeStatusBucket | null;
  backgroundCount?: number;
};
type PickerForm =
  | { kind: "workspace"; projectId: string }
  | { kind: "file"; create: boolean };
type ResourcePickerProps = {
  bridge: NativeBridge;
  serverId: string;
  theme: Theme;
  directory?: Directory;
  initialMode: PickerMode;
  defaultWorkspaceId?: string;
  openedAgentDecks: ReadonlyMap<string, number>;
  openedResources: ReadonlyMap<string, number>;
  newSplit: boolean;
  onDestination(next: boolean): void;
  onOpen(target: Target, workspaceId: string, destination?: boolean): void;
  onTerminal(workspaceId: string): void;
  onCreateWorkspace(input: WorkspaceCreation): Promise<void>;
  onCreateFile(workspaceId: string, path: string): Promise<void>;
  onArchive(
    agentId: string,
    confirm: NativeBridge["confirmDialog"],
  ): Promise<void>;
  onArchiveWorkspace(
    workspaceId: string,
    confirm: NativeBridge["confirmDialog"],
  ): Promise<boolean>;
  onClose(): void;
  onRefresh(): void;
  busy: boolean;
  error: string | null;
  menuActions: PaneMenuAction[];
  onHeightChange(height: number): void;
};

export function ResourcePicker(props: ResourcePickerProps) {
  const { initialMode, onHeightChange, menuActions, onClose, theme, busy } =
    props;
  const menu = initialMode === "menu";
  useLayoutEffect(
    () =>
      onHeightChange(menu ? Math.min(350, menuActions.length * 36 + 10) : 640),
    [menu, menuActions.length, onHeightChange],
  );
  useEffect(
    () => (menu ? onPickerKeys(() => false, onClose) : undefined),
    [menu, onClose],
  );
  if (menu)
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
  return <WorkspaceResourcePicker {...props} />;
}

function WorkspaceResourcePicker({
  bridge,
  serverId,
  theme,
  directory,
  initialMode,
  defaultWorkspaceId,
  openedAgentDecks,
  openedResources,
  newSplit,
  onDestination,
  onOpen,
  onTerminal,
  onCreateWorkspace,
  onCreateFile,
  onArchive,
  onArchiveWorkspace,
  onClose,
  onRefresh,
  busy,
  error,
}: ResourcePickerProps) {
  const c = theme.colors;
  const [mode, setMode] = useState<ResourceMode>(
    initialMode === "new-terminal"
      ? "terminal"
      : initialMode === "file" || initialMode === "terminal"
        ? initialMode
        : "agent",
  );
  const [compact, setCompact] = useState(false);
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [expansion, setExpansion] = useState(() => new Map<string, boolean>());
  const [form, setForm] = useState<PickerForm | null>(null);
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [folder, setFolder] = useState(".");
  const [filePath, setFilePath] = useState("");
  const [pathError, setPathError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [baseBranchChoice, setBaseBranchChoice] = useState<string | null>(null);
  const [isolationChoice, setIsolationChoice] = useState<
    WorkspaceCreation["isolation"] | null
  >(null);
  const [agentStatuses, setAgentStatuses] = useState<
    Record<string, NativeStatusBucket | null>
  >({});
  const projectSearch = useRef<NativeTextInput>(null);
  const fileInput = useRef<NativeTextInput>(null);
  const focusCreation = useRef(
    initialMode === "new" || initialMode === "new-terminal",
  );
  const search = useRef<NativeTextInput>(null);
  const list = useRef<NativeFlatList<Row>>(null);
  const pickerRoot = useRef<View>(null);
  const rowMenus = usePickerRowMenus(pickerRoot, theme, compact);
  const confirmation = usePickerConfirmation(theme);
  const attempt = useRef({ input: "", key: "" });
  const projects = useMemo(
    () =>
      sortPickerProjects(
        directory?.projects ?? [],
        directory?.workspaces ?? [],
      ),
    [directory?.projects, directory?.workspaces],
  );
  const workspaces = useMemo(
    () =>
      (directory?.workspaces ?? []).filter(
        (workspace) =>
          !workspace.internal &&
          !workspace.background &&
          !workspace.archivingAt,
      ),
    [directory?.workspaces],
  );
  const workspace =
    workspaces.find((entry) => entry.id === workspaceId) ??
    workspaces.find((entry) => entry.projectId === projects[0]?.projectId) ??
    workspaces[0];
  const selectedProjectId = workspace?.projectId;
  useLayoutEffect(() => {
    if (!selectedProjectId) return;
    setExpansion((current) =>
      current.has(selectedProjectId)
        ? current
        : new Map(current).set(selectedProjectId, true),
    );
  }, [selectedProjectId]);
  const project =
    form?.kind === "workspace"
      ? projects.find((entry) => entry.projectId === form.projectId)
      : undefined;
  const selectedTab = tabs.find((tab) => tab.mode === mode)!;
  const isolation =
    isolationChoice ??
    (project?.projectKind === "git" ? "worktree" : "directory");
  const baseBranch =
    project && isolation === "worktree"
      ? (baseBranchChoice ??
        readWorkspaceBaseBranch(serverId, project.projectId))
      : undefined;
  const client = bridge.getHostRuntimeStore().getClient(serverId);
  const fileDirectory = useQuery({
    queryKey: [
      "deck-picker-files",
      serverId,
      workspace?.id,
      workspace?.workspaceDirectory,
      folder,
    ],
    queryFn: () =>
      client!.listDirectory!(workspace!.workspaceDirectory, folder),
    enabled:
      mode === "file" &&
      !form &&
      Boolean(workspace?.workspaceDirectory && client?.listDirectory),
    retry: false,
  });
  const creation = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!project) throw new Error("请选择 Project。");
      const input = JSON.stringify([
        project.projectId,
        title.trim(),
        isolation,
        baseBranch ?? "",
      ]);
      if (attempt.current.input !== input)
        attempt.current = {
          input,
          key: `deck-workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        };
      return onCreateWorkspace({
        project,
        title,
        isolation,
        baseBranch,
        idempotencyKey: attempt.current.key,
      });
    },
  });
  const fileCreation = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!workspace) throw new Error("请选择 Workspace。");
      await onCreateFile(workspace.id, filePath);
    },
  });
  const pending = busy || creation.isPending || fileCreation.isPending;
  const branchPicker = useWorkspaceBranchPicker({
    bridge,
    serverId,
    rootRef: pickerRoot,
    theme,
    cwd: project?.projectRootPath ?? "",
    enabled: project?.projectKind === "git" && isolation === "worktree",
    value: baseBranch ?? "",
    disabled: pending,
    onChange: (branch) => {
      if (!project) return;
      writeWorkspaceBaseBranch(serverId, project.projectId, branch);
      setBaseBranchChoice(branch);
      creation.reset();
    },
  });

  function setExpanded(projectId: string, expanded: boolean) {
    setExpansion((current) => new Map(current).set(projectId, expanded));
  }
  function selectWorkspace(id: string, nextMode = mode) {
    setWorkspaceId(id);
    setMode(nextMode);
    setForm(null);
    setQuery("");
    setSelectedKey(null);
    setAgentFilter("all");
    setFolder(".");
  }
  function switchMode(next: ResourceMode) {
    if (next === mode && !form) return;
    if (workspace) selectWorkspace(workspace.id, next);
    else {
      setForm(null);
      setMode(next);
    }
  }
  function startWorkspace(projectId: string) {
    setExpanded(projectId, true);
    setTitle("");
    setIsolationChoice(null);
    setBaseBranchChoice(null);
    creation.reset();
    attempt.current = { input: "", key: "" };
    setForm({ kind: "workspace", projectId });
  }
  function fileForm(create: boolean, parent = folder) {
    setFilePath(parent === "." ? "" : `${parent}/`);
    setPathError(null);
    fileCreation.reset();
    setForm({ kind: "file", create });
  }
  function newResource(kind: ResourceMode, id: string, parent?: string) {
    if (kind === "agent")
      onOpen(
        {
          kind: "draft",
          draftId: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        },
        id,
      );
    else if (kind === "terminal") onTerminal(id);
    else fileForm(true, parent);
  }
  async function archiveWorkspace(id: string) {
    if (!(await onArchiveWorkspace(id, confirmation.confirm))) {
      focusControl(`split-archive-workspace-${id}`);
      return;
    }
    if (workspace?.id !== id) return;
    const next =
      workspaces.find(
        (entry) => entry.id !== id && entry.projectId === workspace.projectId,
      ) ?? workspaces.find((entry) => entry.id !== id);
    if (next) {
      setExpanded(next.projectId, true);
      selectWorkspace(next.id);
    } else {
      setWorkspaceId(undefined);
      setSelectedKey(null);
    }
  }
  function workspaceActions(id: string): PickerRowAction[] {
    return [
      ...tabs.map((tab) => ({
        label: tab.create,
        icon: tab.mode === "agent" ? "SquarePen" : tab.icon,
        disabled: tab.mode === "file" && !client?.createFileEntry,
        run: () => {
          selectWorkspace(id, tab.mode);
          newResource(tab.mode, id, ".");
        },
      })),
      ...tabs.map((tab, index) => ({
        label: `添加已有${tab.mode === "agent" ? " " : ""}${tab.label}`,
        icon: tab.icon,
        separator: index === 0,
        run: () => {
          selectWorkspace(id, tab.mode);
          search.current?.focus();
        },
      })),
      {
        label: "归档 workspace",
        icon: "Archive",
        destructive: true,
        separator: true,
        run: () => void archiveWorkspace(id),
      },
    ];
  }

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
  const workspaceAgents = useMemo(
    () =>
      directory?.agents.filter(
        (agent) => agent.workspaceId === workspace?.id && !agent.archivedAt,
      ) ?? [],
    [directory?.agents, workspace?.id],
  );
  const needle = query.trim().toLocaleLowerCase();
  const matches = (text: string) => text.toLocaleLowerCase().includes(needle);
  const agentSections = useMemo(
    () =>
      groupPickerAgents(
        workspaceAgents.filter((agent) =>
          `${agent.title ?? ""} ${agent.cwd}`
            .toLocaleLowerCase()
            .includes(needle),
        ),
        agentStatuses,
        "all",
        openedAgentDecks,
      ),
    [workspaceAgents, needle, agentStatuses, openedAgentDecks],
  );
  const counts = Object.fromEntries(
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
    { key: "attention", label: "未读", count: counts.attention },
    { key: "running", label: "运行中", count: counts.running },
    { key: "needs_input", label: "待处理", count: counts.needs_input },
    ...(counts.background
      ? [
          {
            key: "background" as const,
            label: "后台",
            count: counts.background,
          },
        ]
      : []),
  ];
  const deckOf = (target: Target) =>
    workspace &&
    openedResources.get(
      resourceKey({ serverId, workspaceId: workspace.id, target }),
    );
  const rows: Row[] = !workspace
    ? []
    : mode === "agent"
      ? agentSections.flatMap<Row>((section) => {
          if (
            !section.agents.length ||
            (agentFilter !== "all" && agentFilter !== section.key)
          )
            return [];
          return [
            {
              key: `heading-${section.key}`,
              kind: "heading",
              title: section.label,
              count: section.agents.length,
              running: section.key === "running",
              unread: section.key === "attention",
            },
            ...section.agents.map((agent): Result => {
              const activity = pickerAgentActivity(
                agent,
                agentStatuses[agent.id],
              );
              const badge =
                activity.badge ??
                (agent.status === "closed" ? "已关闭" : undefined);
              return {
                key: agent.id,
                kind: "option",
                title: agent.title ?? "未命名 Agent",
                subtitle: agent.provider,
                icon: "MessagesSquare",
                target: { kind: "agent", agentId: agent.id },
                agentId: agent.id,
                badge,
                badgeIcon: badge === "已关闭" ? "CircleStop" : undefined,
                deckNumber: openedAgentDecks.get(agent.id),
                running: activity.running,
                status: activity.status,
                backgroundCount:
                  section.key === "background" ? 0 : activity.backgroundCount,
              };
            }),
          ];
        })
      : mode === "terminal"
        ? (directory?.terminals ?? [])
            .filter(
              (terminal) =>
                terminal.workspaceId === workspace.id &&
                matches(
                  `${terminal.title ?? ""} ${terminal.name ?? ""} ${terminal.cwd}`,
                ),
            )
            .map((terminal): Result => {
              const target = {
                kind: "terminal",
                terminalId: terminal.id,
              } as const;
              return {
                key: terminal.id,
                kind: "option",
                icon: "Terminal",
                target,
                title: terminal.title || terminal.name || "终端",
                subtitle: terminal.cwd,
                deckNumber: deckOf(target),
              };
            })
        : (fileDirectory.data?.entries ?? [])
            .filter((entry) => matches(`${entry.name} ${entry.path}`))
            .map((entry): Result => {
              const target = { kind: "file", path: entry.path } as const;
              return {
                key: entry.path,
                kind: "option",
                title: entry.name,
                subtitle: entry.path,
                icon: entry.kind === "directory" ? "Folder" : "FileCode2",
                ...(entry.kind === "directory"
                  ? { folder: entry.path }
                  : { target, deckNumber: deckOf(target) }),
              };
            });
  const options = rows.filter((row): row is Result => row.kind === "option");
  const active = options.find((option) => option.key === selectedKey);
  function enterFolder(path: string) {
    setQuery("");
    setSelectedKey(null);
    setFolder(path);
  }
  function openRow(row: Result, destination?: boolean) {
    if (!workspace || pending) return;
    if (row.folder !== undefined) enterFolder(row.folder);
    else if (row.target) onOpen(row.target, workspace.id, destination);
  }
  function resourceActions(row: Result): PickerRowAction[] {
    const actions: PickerRowAction[] =
      row.folder !== undefined
        ? [{ label: "打开目录", icon: "FolderOpen", run: () => openRow(row) }]
        : row.deckNumber !== undefined
          ? [
              {
                label: `切换到 Deck ${row.deckNumber}`,
                icon: "PanelsTopLeft",
                run: () => openRow(row),
              },
            ]
          : [
              {
                label: "添加到当前分屏",
                icon: "PanelLeft",
                run: () => openRow(row, false),
              },
              {
                label: "添加到新分屏",
                icon: "Columns2",
                run: () => openRow(row, true),
              },
            ];
    if (row.agentId)
      actions.push({
        label: "归档 Agent",
        icon: "Archive",
        separator: true,
        destructive: true,
        run: () => void onArchive(row.agentId!, confirmation.confirm),
      });
    return actions;
  }
  function confirm() {
    if (pending) return;
    if (form?.kind === "workspace") {
      if (project) creation.mutate();
    } else if (form?.kind === "file" && workspace) {
      try {
        const { path } = workspaceFilePath(filePath);
        if (form.create) fileCreation.mutate();
        else onOpen({ kind: "file", path }, workspace.id);
      } catch (error) {
        setPathError(error instanceof Error ? error.message : String(error));
      }
    } else if (active) openRow(active);
    else if (options.length === 1) openRow(options[0]);
  }
  const cancel = () => {
    if (pending) return;
    if (form) {
      branchPicker.close();
      setForm(null);
    } else onClose();
  };
  const keyboard = useRef({
    options,
    rows,
    selectedKey,
    confirm,
    cancel,
    pending,
  });
  keyboard.current = { options, rows, selectedKey, confirm, cancel, pending };
  useEffect(
    () =>
      onPickerKeys(
        (key) => {
          const state = keyboard.current;
          if (key === "Enter") {
            state.confirm();
            return true;
          }
          if (
            (key === "ArrowDown" || key === "ArrowUp") &&
            state.options.length
          ) {
            const selected = state.options.findIndex(
              (row) => row.key === state.selectedKey,
            );
            const next =
              selected < 0
                ? key === "ArrowDown"
                  ? 0
                  : state.options.length - 1
                : (selected +
                    (key === "ArrowDown" ? 1 : -1) +
                    state.options.length) %
                  state.options.length;
            const nextRow = state.options[next];
            setSelectedKey(nextRow.key);
            const rowIndex = state.rows.findIndex(
              (row) => row.key === nextRow.key,
            );
            if (next === 0)
              list.current?.scrollToOffset({ offset: 0, animated: false });
            else
              list.current?.scrollToIndex({
                index: rowIndex,
                animated: false,
                viewPosition: 0.5,
              });
            return true;
          }
          return false;
        },
        () => keyboard.current.cancel(),
        () => keyboard.current.pending,
      ),
    [],
  );
  useEffect(() => {
    if (form?.kind === "workspace") focusControl("split-workspace-title");
    else if (form?.kind === "file") fileInput.current?.focus();
    else if (workspace && focusCreation.current) {
      focusCreation.current = false;
      focusControl("split-new-resource");
    } else if (workspace) search.current?.focus();
    else projectSearch.current?.focus();
  }, [mode, form, workspace?.id]);
  useEffect(
    () => list.current?.scrollToOffset({ offset: 0, animated: false }),
    [mode, workspace?.id, folder, query, agentFilter],
  );
  const operationError =
    form?.kind === "workspace"
      ? creation.error
      : form?.kind === "file"
        ? fileCreation.error
        : mode === "file"
          ? fileDirectory.error
          : null;
  const errorText =
    (form?.kind === "file" ? pathError : null) ??
    (operationError
      ? operationError instanceof Error
        ? operationError.message
        : String(operationError)
      : error);
  const actionLabel =
    form?.kind === "workspace"
      ? "创建并打开"
      : form?.kind === "file"
        ? form.create
          ? "创建并打开"
          : "添加文件"
        : active?.folder !== undefined
          ? "打开目录"
          : active?.deckNumber !== undefined
            ? "切换到 Tab"
            : selectedTab.add;
  const canConfirm =
    !pending &&
    Boolean(
      form?.kind === "workspace"
        ? project
        : form?.kind === "file"
          ? workspace && filePath.trim()
          : active,
    );

  return (
    <PickerMenus.Provider value={rowMenus.context}>
      <View
        testID="split-resource-picker"
        ref={pickerRoot}
        style={{ flex: 1, minHeight: 0 }}
        onLayout={(event) => {
          setCompact(event.nativeEvent.layout.width < 620);
          branchPicker.close();
          rowMenus.close(false);
        }}
      >
        {mode === "agent" && !form && (
          <QueryClientProvider client={bridge.queryClient}>
            {workspaceAgents.map((agent) => (
              <ObservePickerAgent
                key={agent.id}
                agentId={agent.id}
                serverId={serverId}
                workspaceId={agent.workspaceId!}
                bridge={bridge}
                report={reportAgentStatus}
              />
            ))}
          </QueryClientProvider>
        )}
        <View
          style={{
            minHeight: 56,
            paddingHorizontal: compact ? 14 : 18,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderColor: c.border,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ color: c.foreground, fontSize: 19, fontWeight: "600" }}
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
          style={{
            flex: 1,
            minHeight: 0,
            flexDirection: compact ? "column" : "row",
          }}
        >
          <ResourcePickerTree
            bridge={bridge}
            theme={theme}
            projects={projects}
            workspaces={workspaces}
            selected={workspace}
            creatingProjectId={project?.projectId}
            expansion={expansion}
            compact={compact}
            disabled={pending}
            searchRef={projectSearch}
            onExpand={setExpanded}
            onWorkspace={(id) => {
              if (workspace?.id !== id || form) selectWorkspace(id);
            }}
            onCreateWorkspace={startWorkspace}
            onArchiveWorkspace={(id) => void archiveWorkspace(id)}
            workspaceActions={workspaceActions}
          />
          <View style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
            {form ? (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16, gap: 14 }}
                keyboardShouldPersistTaps="handled"
              >
                {project && (
                  <>
                    <View
                      testID="split-project-summary"
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <ProjectIcon
                        bridge={bridge}
                        projectId={project.projectId}
                        label={project.projectDisplayName}
                        size={18}
                      />
                      <Text
                        testID="split-project-heading"
                        style={{
                          color: c.foreground,
                          fontSize: 13,
                          fontWeight: "500",
                        }}
                      >
                        {project.projectCustomName ??
                          project.projectDisplayName}
                      </Text>
                      <Text
                        testID="split-project-path"
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          color: c.foregroundMuted,
                          fontSize: 12,
                        }}
                      >
                        {project.projectRootPath}
                      </Text>
                    </View>
                    <Text
                      accessibilityRole="header"
                      style={{
                        color: c.foreground,
                        fontSize: 17,
                        fontWeight: "600",
                      }}
                    >
                      新建 workspace
                    </Text>
                    <WorkspaceFields
                      key={project.projectId}
                      theme={theme}
                      project={project}
                      title={title}
                      isolation={isolation}
                      busy={pending}
                      branchPicker={branchPicker.field}
                      onTitle={(value) => {
                        setTitle(value);
                        creation.reset();
                      }}
                      onIsolation={(value) => {
                        setIsolationChoice(value);
                        creation.reset();
                      }}
                    />
                  </>
                )}
                {form.kind === "file" && workspace && (
                  <>
                    {workspaceHeading(workspace)}
                    <Text
                      accessibilityRole="header"
                      style={{
                        color: c.foreground,
                        fontSize: 17,
                        fontWeight: "600",
                      }}
                    >
                      {form.create ? "新建文件" : "按路径添加文件"}
                    </Text>
                    <Text style={{ color: c.foreground, fontSize: 13 }}>
                      文件路径
                    </Text>
                    <DialogInput
                      ref={fileInput}
                      theme={theme}
                      label="文件路径"
                      placeholder="例如 docs/notes.md"
                      value={filePath}
                      disabled={pending}
                      onSubmit={confirm}
                      testID="split-file-path"
                      onChangeText={(value) => {
                        setFilePath(value);
                        setPathError(null);
                        fileCreation.reset();
                      }}
                    />
                    <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                      相对于当前 Workspace 的路径。
                    </Text>
                  </>
                )}
              </ScrollView>
            ) : workspace ? (
              <>
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  {workspaceHeading(workspace)}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                    paddingHorizontal: compact ? 10 : 16,
                    borderBottomWidth: 1,
                    borderColor: c.border,
                  }}
                >
                  <View
                    accessibilityRole="tablist"
                    accessibilityLabel="Workspace 资源类型"
                    style={{
                      flexDirection: "row",
                      gap: compact ? 3 : 12,
                      minWidth: 0,
                    }}
                  >
                    {tabs.map((tab) => (
                      <Pressable
                        key={tab.mode}
                        accessibilityRole="tab"
                        accessibilityLabel={tab.label}
                        aria-selected={mode === tab.mode}
                        accessibilityState={{
                          selected: mode === tab.mode,
                          disabled: pending,
                        }}
                        disabled={pending}
                        onPress={() => switchMode(tab.mode)}
                        style={{
                          minHeight: 42,
                          paddingHorizontal: compact ? 4 : 6,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          borderBottomWidth: 2,
                          borderColor:
                            mode === tab.mode ? c.foreground : "transparent",
                        }}
                      >
                        {!compact && (
                          <Icon
                            name={tab.icon}
                            size={14}
                            color={
                              mode === tab.mode
                                ? c.foreground
                                : c.foregroundMuted
                            }
                          />
                        )}
                        <Text
                          style={{
                            fontSize: 13,
                            color:
                              mode === tab.mode
                                ? c.foreground
                                : c.foregroundMuted,
                          }}
                        >
                          {tab.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <PickerRow
                    theme={theme}
                    icon="Plus"
                    label={selectedTab.create}
                    compact
                    disabled={
                      pending || (mode === "file" && !client?.createFileEntry)
                    }
                    onPress={() => newResource(mode, workspace.id)}
                    testID="split-new-resource"
                  />
                </View>
                <View
                  style={{
                    flex: 1,
                    minHeight: 0,
                    paddingHorizontal: compact ? 10 : 13,
                    paddingTop: 10,
                    gap: 5,
                  }}
                >
                  <View
                    testID={
                      mode === "agent" ? "split-agent-toolbar" : undefined
                    }
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        flex: mode === "agent" ? undefined : 1,
                        width:
                          mode === "agent" ? (compact ? 128 : 171) : undefined,
                        minWidth: 0,
                      }}
                    >
                      <DialogInput
                        ref={search}
                        theme={theme}
                        icon="Search"
                        label={selectedTab.existing}
                        placeholder={`${selectedTab.existing}…`}
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
                        contentContainerStyle={{ alignItems: "center", gap: 4 }}
                        keyboardShouldPersistTaps="handled"
                      >
                        <View
                          accessibilityRole="radiogroup"
                          accessibilityLabel="Agent 状态"
                          style={{ flexDirection: "row", gap: 4 }}
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
                  </View>
                  {mode === "file" && (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {folder !== "." && (
                        <PickerRow
                          theme={theme}
                          label="上一级"
                          icon="ArrowUp"
                          compact
                          disabled={pending}
                          onPress={() =>
                            enterFolder(
                              folder.split("/").slice(0, -1).join("/") || ".",
                            )
                          }
                        />
                      )}
                      {folder !== "." && (
                        <Text
                          numberOfLines={1}
                          style={{
                            color: c.foregroundMuted,
                            fontSize: 11,
                            flex: 1,
                          }}
                        >
                          {folder}
                        </Text>
                      )}
                      <PickerRow
                        theme={theme}
                        label="按路径添加"
                        icon="FileSearch"
                        compact
                        disabled={pending}
                        onPress={() => fileForm(false)}
                      />
                      <PickerRow
                        theme={theme}
                        label="浏览文件"
                        icon="FolderTree"
                        compact
                        disabled={pending}
                        onPress={() => onOpen({ kind: "files" }, workspace.id)}
                      />
                    </View>
                  )}
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
                        rows[index]?.kind === "heading"
                          ? HEADING_HEIGHT
                          : RESULT_HEIGHT,
                      offset:
                        4 +
                        rows
                          .slice(0, index)
                          .reduce(
                            (total, row) =>
                              total +
                              (row.kind === "heading"
                                ? HEADING_HEIGHT
                                : RESULT_HEIGHT),
                            0,
                          ),
                    })}
                    onScrollToIndexFailed={() => {}}
                    ListEmptyComponent={
                      <Text
                        style={{
                          color: c.foregroundMuted,
                          textAlign: "center",
                          padding: 18,
                          fontSize: 13,
                        }}
                      >
                        {mode === "file" && fileDirectory.isFetching
                          ? "正在读取文件…"
                          : needle
                            ? "没有匹配的资源"
                            : `此 Workspace 暂无${mode === "agent" ? " Agent" : selectedTab.label}`}
                      </Text>
                    }
                    renderItem={({ item }) =>
                      item.kind === "heading" ? (
                        <View
                          style={{
                            height: HEADING_HEIGHT,
                            paddingHorizontal: 8,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 7,
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
                          <Text
                            style={{ color: c.foregroundMuted, fontSize: 11 }}
                          >
                            {item.count}
                          </Text>
                        </View>
                      ) : (
                        <ResultRow
                          bridge={bridge}
                          row={item}
                          selected={item.key === selectedKey}
                          theme={theme}
                          busy={pending}
                          compact={compact}
                          actions={resourceActions(item)}
                          onSelect={() =>
                            item.folder === undefined
                              ? setSelectedKey(item.key)
                              : enterFolder(item.folder)
                          }
                          onActivate={() => openRow(item)}
                        />
                      )
                    }
                  />
                </View>
              </>
            ) : (
              <Text
                style={{ color: c.foregroundMuted, fontSize: 13, padding: 18 }}
              >
                {!directory
                  ? "正在读取资源…"
                  : "展开 Project，选择或新建 Workspace。"}
              </Text>
            )}
            {errorText && (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={{
                  color: c.statusDanger,
                  fontSize: 12,
                  lineHeight: 18,
                  paddingHorizontal: 16,
                  paddingVertical: 5,
                }}
              >
                {errorText}
              </Text>
            )}
          </View>
        </View>
        <View
          style={{
            paddingHorizontal: compact ? 12 : 16,
            paddingVertical: 9,
            gap: 8,
            borderTopWidth: 1,
            borderColor: c.border,
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: c.surface1,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {(workspace || form?.kind === "workspace") && (
              <>
                <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                  打开到
                </Text>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="目标分屏"
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
                      onPress={() => onDestination(value)}
                    />
                  ))}
                </View>
              </>
            )}
            {!form && (
              <IconButton
                theme={theme}
                label="刷新资源"
                icon="RefreshCw"
                size={27}
                disabled={pending}
                onPress={() => {
                  onRefresh();
                  if (mode === "file" && client?.listDirectory && workspace)
                    void fileDirectory.refetch();
                }}
              />
            )}
          </View>
          <View
            style={{
              flexDirection: "row",
              gap: 7,
              marginLeft: "auto",
              justifyContent: "flex-end",
            }}
          >
            <DialogButton
              theme={theme}
              label="取消"
              onPress={cancel}
              disabled={pending}
            />
            {(workspace || form?.kind === "workspace") && (
              <DialogButton
                theme={theme}
                label={actionLabel}
                primary
                onPress={confirm}
                disabled={!canConfirm}
                busy={pending}
                testID={
                  form?.kind === "workspace"
                    ? "split-create-workspace"
                    : "split-confirm-resource"
                }
              />
            )}
          </View>
        </View>
        {branchPicker.popup}
        {rowMenus.popup}
        {confirmation.popup}
      </View>
    </PickerMenus.Provider>
  );

  function workspaceHeading(entry: NonNullable<typeof workspace>): ReactNode {
    return (
      <View
        testID="split-picker-workspace-heading"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          minWidth: 0,
        }}
      >
        <ProjectIcon
          bridge={bridge}
          projectId={entry.projectId}
          label={entry.projectCustomName ?? entry.projectDisplayName}
          size={20}
        />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={{
            color: c.foreground,
            fontSize: 17,
            fontWeight: "600",
            flexShrink: 1,
          }}
        >
          {entry.title ?? entry.name}
        </Text>
      </View>
    );
  }
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
  compact,
  actions,
  onSelect,
  onActivate,
}: {
  bridge: NativeBridge;
  row: Result;
  selected: boolean;
  theme: PluginScreenProps["theme"];
  busy: boolean;
  compact: boolean;
  actions: PickerRowAction[];
  onSelect(): void;
  onActivate(): void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const colors = theme.colors;
  const statusColor =
    row.status === "needs_input"
      ? colors.statusWarning
      : row.status === "failed"
        ? colors.statusDanger
        : row.status === "attention" || row.status === "running"
          ? colors.statusSuccess
          : colors.foregroundMuted;
  return (
    <PickerRowMenu
      theme={theme}
      id={`resource-${row.key}`}
      title={row.title}
      actions={actions}
      compact={compact}
      style={{
        height: RESULT_HEIGHT,
        paddingRight: 3,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 7,
        marginHorizontal: 6,
        backgroundColor: hovered || selected ? colors.surface2 : "transparent",
        opacity: busy ? 0.5 : 1,
      }}
      trigger={{
        testID: `split-picker-result-${row.key}`,
        accessibilityRole: "button",
        accessibilityLabel: `选择 ${row.title}${row.subtitle ? " · " + row.subtitle : ""}${row.deckNumber ? " · 已在 Deck " + row.deckNumber : ""}${row.badge ? " · " + row.badge : ""}`,
        disabled: busy,
        accessibilityState: { disabled: busy, selected },
        "aria-pressed": selected,
        onPress: (event) => {
          const { detail } = event.nativeEvent as { detail?: number };
          if (selected && detail === 2) onActivate();
          else onSelect();
        },
        onHoverIn: () => setHovered(true),
        onHoverOut: () => setHovered(false),
        onFocus: () => setFocused(keyboardFocusVisible()),
        onBlur: () => setFocused(false),
        style: {
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
        },
      }}
    >
      <Icon name={row.icon} size={16} color={colors.foregroundMuted} />
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
      <View style={{ alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        {row.deckNumber !== undefined && (
          <View
            testID={row.agentId ? `split-agent-deck-${row.agentId}` : undefined}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: colors.surface1,
              borderRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <DeckIcon size={12} color={colors.foregroundMuted} />
            <Text
              numberOfLines={1}
              style={{
                color: colors.foregroundMuted,
                fontSize: 11,
                lineHeight: 14,
              }}
            >
              Deck {row.deckNumber}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {row.badge && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                flexShrink: 0,
              }}
            >
              {row.status ? (
                <View
                  testID={`split-agent-status-indicator-${row.agentId}`}
                  pointerEvents="none"
                  aria-hidden
                  style={{
                    width: 14,
                    height: 16,
                    flexShrink: 0,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {row.status === "running" ? (
                    <View
                      testID={`split-agent-running-indicator-${row.agentId}`}
                    >
                      <bridge.StatusRing />
                    </View>
                  ) : row.status === "needs_input" ? (
                    <Icon name="CircleAlert" size={12} color={statusColor} />
                  ) : (
                    // StatusIcon places its dot at an icon's bottom-right corner.
                    // A text badge needs a centered inline dot instead.
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: statusColor,
                      }}
                    />
                  )}
                </View>
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
                  color: statusColor,
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
        </View>
      </View>
    </PickerRowMenu>
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
