import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { FlatList, Icon } from "@getpaseo/plugin/client/ui";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Text, View, type TextInput as NativeTextInput } from "react-native";
import type { NativeBridge } from "./native-types";
import type { PaseoProject, PaseoWorkspace } from "./paseo-types";
import { DialogInput } from "./add-dialog-ui";
import { IconButton } from "./compact-ui";
import {
  PickerRowMenu,
  pickerRowActionSize,
  type PickerRowAction,
} from "./picker-row-menu";
import { ProjectIcon } from "./workspace-icon";
import { collapsedProjectStatus } from "./project-picker";
import {
  describeControl,
  installPickerTreeRowStyles,
  keyboardFocusVisible,
} from "./web";

type Theme = PluginScreenProps["theme"];
type TreeStatus =
  | { label: string; color: keyof Theme["colors"] }
  | { label: string; running: true };
const statuses = {
  needs_input: { label: "等待输入或审批", color: "statusWarning" },
  failed: { label: "运行失败", color: "statusDanger" },
  running: { label: "运行中", running: true },
  attention: { label: "未读", color: "statusSuccess" },
} satisfies Record<Exclude<PaseoWorkspace["status"], "done">, TreeStatus>;
const rowStatus = (
  status?: PaseoWorkspace["status"],
): TreeStatus | undefined =>
  status && status !== "done" ? statuses[status] : undefined;
type RowStatus = ReturnType<typeof rowStatus>;
type TreeEntry =
  | {
      kind: "project";
      project: PaseoProject;
      expanded: boolean;
      status: RowStatus;
    }
  | { kind: "workspace"; workspace: PaseoWorkspace };

export function ResourcePickerTree({
  bridge,
  theme,
  projects,
  workspaces,
  selected,
  creatingProjectId,
  expansion,
  compact,
  disabled,
  searchRef,
  onExpand,
  onWorkspace,
  onCreateWorkspace,
  onArchiveWorkspace,
  workspaceActions,
}: {
  bridge: NativeBridge;
  theme: Theme;
  projects: readonly PaseoProject[];
  workspaces: readonly PaseoWorkspace[];
  selected?: PaseoWorkspace;
  creatingProjectId?: string;
  expansion: ReadonlyMap<string, boolean>;
  compact: boolean;
  disabled: boolean;
  searchRef: RefObject<NativeTextInput | null>;
  onExpand(projectId: string, expanded: boolean): void;
  onWorkspace(workspaceId: string): void;
  onCreateWorkspace(projectId: string): void;
  onArchiveWorkspace(workspaceId: string): void;
  workspaceActions(workspaceId: string): PickerRowAction[];
}) {
  const [query, setQuery] = useState("");
  const c = theme.colors;
  const actionSize = pickerRowActionSize(compact);
  useLayoutEffect(
    () => installPickerTreeRowStyles(c.surface1, c.surface2, actionSize),
    [c.surface1, c.surface2, actionSize],
  );
  const rows = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    const grouped = new Map<string, PaseoWorkspace[]>();
    for (const workspace of workspaces) {
      const siblings = grouped.get(workspace.projectId) ?? [];
      siblings.push(workspace);
      grouped.set(workspace.projectId, siblings);
    }
    return projects.flatMap<TreeEntry>((project) => {
      const label = project.projectCustomName ?? project.projectDisplayName;
      const matchesProject = `${label} ${project.projectRootPath}`
        .toLocaleLowerCase()
        .includes(value);
      const siblings = grouped.get(project.projectId) ?? [];
      const matches = siblings.filter(
        (workspace) =>
          matchesProject ||
          `${workspace.title ?? workspace.name} ${workspace.workspaceDirectory}`
            .toLocaleLowerCase()
            .includes(value),
      );
      if (!matchesProject && !matches.length) return [];
      const expanded =
        expansion.get(project.projectId) ??
        (Boolean(value && matches.length) ||
          project.projectId === selected?.projectId);
      return [
        {
          kind: "project",
          project,
          expanded,
          status: expanded
            ? undefined
            : rowStatus(collapsedProjectStatus(siblings)),
        },
        ...(expanded
          ? matches.map((workspace) => ({
              kind: "workspace" as const,
              workspace,
            }))
          : []),
      ];
    });
  }, [projects, workspaces, query, expansion, selected?.projectId]);
  const listRef = useRef<import("react-native").FlatList<TreeEntry>>(null);
  const currentIndex = rows.findIndex(
    (row) => row.kind === "workspace" && row.workspace.id === selected?.id,
  );
  const rowHeight = compact ? 42 : 36;

  return (
    <View
      testID="split-picker-project-tree"
      style={{
        width: compact ? undefined : 246,
        minHeight: 0,
        height: compact ? 206 : undefined,
        paddingTop: 10,
        backgroundColor: c.surface1,
        borderRightWidth: compact ? 0 : 1,
        borderBottomWidth: compact ? 1 : 0,
        borderColor: c.border,
      }}
    >
      <View
        style={{
          paddingHorizontal: 12,
          gap: 7,
          flexDirection: compact ? "row" : "column",
          alignItems: compact ? "center" : undefined,
        }}
      >
        <Text
          style={{ color: c.foregroundMuted, fontSize: 11, fontWeight: "500" }}
        >
          PROJECTS
        </Text>
        <View style={{ flex: compact ? 1 : undefined }}>
          <DialogInput
            ref={searchRef}
            theme={theme}
            icon="Search"
            label="搜索 Project 或 Workspace"
            placeholder="搜索 Project 或 Workspace…"
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              listRef.current?.scrollToOffset({ offset: 0, animated: false });
            }}
            onSubmit={() => {
              const firstWorkspace = rows.find(
                (item) => item.kind === "workspace",
              );
              if (firstWorkspace?.kind === "workspace")
                onWorkspace(firstWorkspace.workspace.id);
            }}
            disabled={disabled}
            testID="split-project-search"
          />
        </View>
      </View>
      <FlatList<TreeEntry>
        ref={listRef}
        data={rows}
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ padding: 7 }}
        initialNumToRender={12}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        initialScrollIndex={currentIndex > 7 ? currentIndex : undefined}
        getItemLayout={(_, index) => ({
          index,
          offset: 7 + index * rowHeight,
          length: rowHeight,
        })}
        keyExtractor={(entry) =>
          entry.kind === "project"
            ? `project-${entry.project.projectId}`
            : `workspace-${entry.workspace.id}`
        }
        ListEmptyComponent={
          <Text style={{ padding: 10, color: c.foregroundMuted, fontSize: 12 }}>
            {query.trim() ? "没有匹配的 Project 或 Workspace" : "暂无 Project"}
          </Text>
        }
        renderItem={({ item: entry }) =>
          entry.kind === "project" ? (
            <ProjectRow
              bridge={bridge}
              theme={theme}
              project={entry.project}
              expanded={entry.expanded}
              status={entry.status}
              creating={creatingProjectId === entry.project.projectId}
              compact={compact}
              disabled={disabled}
              onExpand={() =>
                onExpand(entry.project.projectId, !entry.expanded)
              }
              onCreate={() => onCreateWorkspace(entry.project.projectId)}
            />
          ) : (
            <WorkspaceRow
              bridge={bridge}
              theme={theme}
              workspace={entry.workspace}
              selected={
                selected?.id === entry.workspace.id && !creatingProjectId
              }
              compact={compact}
              disabled={disabled}
              onSelect={() => onWorkspace(entry.workspace.id)}
              onArchive={() => onArchiveWorkspace(entry.workspace.id)}
              actions={workspaceActions(entry.workspace.id)}
            />
          )
        }
      />
    </View>
  );
}

function ProjectRow({
  bridge,
  theme,
  project,
  expanded,
  status,
  creating,
  compact,
  disabled,
  onExpand,
  onCreate,
}: {
  bridge: NativeBridge;
  theme: Theme;
  project: PaseoProject;
  expanded: boolean;
  status: RowStatus;
  creating: boolean;
  compact: boolean;
  disabled: boolean;
  onExpand(): void;
  onCreate(): void;
}) {
  const [focused, setFocused] = useState(false);
  const c = theme.colors;
  const title = project.projectCustomName ?? project.projectDisplayName;
  return (
    <PickerRowMenu
      theme={theme}
      id={`project-${project.projectId}`}
      title={title}
      compact={compact}
      style={{
        height: compact ? 42 : 36,
        paddingVertical: 2,
        flexDirection: "row",
        alignItems: "center",
      }}
      trigger={{
        testID: `split-project-${project.projectId}`,
        accessibilityRole: "button",
        accessibilityLabel: status ? `${title} · ${status.label}` : title,
        accessibilityState: { expanded, disabled },
        "aria-expanded": expanded,
        disabled,
        onPress: onExpand,
        onFocus: () => setFocused(keyboardFocusVisible()),
        onBlur: () => setFocused(false),
        style: {
          flex: 1,
          minWidth: 0,
          height: "100%",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 4,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: focused ? c.foregroundMuted : "transparent",
          backgroundColor: creating ? c.surface2 : undefined,
        },
      }}
      actions={[
        { label: "新建 workspace", icon: "Plus", run: onCreate, disabled },
        {
          label: expanded ? "收起 Workspace" : "展开 Workspace",
          icon: expanded ? "ChevronDown" : "ChevronRight",
          run: onExpand,
          disabled,
        },
      ]}
      shortcuts={
        <IconButton
          theme={theme}
          label={`在 ${title} 新建 workspace`}
          icon="Plus"
          size={pickerRowActionSize(compact)}
          disabled={disabled}
          testID={`split-new-workspace-${project.projectId}`}
          onPress={onCreate}
        />
      }
    >
      <Icon
        name={expanded ? "ChevronDown" : "ChevronRight"}
        size={12}
        color={c.foregroundMuted}
      />
      <ProjectIcon
        bridge={bridge}
        projectId={project.projectId}
        label={title}
        size={17}
      />
      <TreeRowName
        bridge={bridge}
        theme={theme}
        title={title}
        emphasized
        status={status}
      />
    </PickerRowMenu>
  );
}

function WorkspaceRow({
  bridge,
  theme,
  workspace,
  selected,
  compact,
  disabled,
  onSelect,
  onArchive,
  actions,
}: {
  bridge: NativeBridge;
  theme: Theme;
  workspace: PaseoWorkspace;
  selected: boolean;
  compact: boolean;
  disabled: boolean;
  onSelect(): void;
  onArchive(): void;
  actions: PickerRowAction[];
}) {
  const [focused, setFocused] = useState(false);
  const c = theme.colors;
  const title = workspace.title ?? workspace.name;
  const status = rowStatus(workspace.status);
  return (
    <PickerRowMenu
      theme={theme}
      id={`workspace-${workspace.id}`}
      title={title}
      showMenuTitle={false}
      compact={compact}
      style={{
        height: compact ? 42 : 36,
        marginLeft: 14,
        paddingLeft: 6,
        paddingVertical: 2,
        borderLeftWidth: 1,
        borderColor: c.border,
        flexDirection: "row",
        alignItems: "center",
      }}
      trigger={{
        testID: `split-workspace-${workspace.id}`,
        accessibilityRole: "button",
        accessibilityLabel: status ? `${title} · ${status.label}` : title,
        accessibilityState: { selected, disabled },
        "aria-pressed": selected,
        disabled,
        onPress: onSelect,
        onFocus: () => setFocused(keyboardFocusVisible()),
        onBlur: () => setFocused(false),
        style: {
          flex: 1,
          minWidth: 0,
          height: "100%",
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          paddingHorizontal: 5,
          borderWidth: 1,
          borderRadius: 6,
          borderColor: focused ? c.foregroundMuted : "transparent",
          backgroundColor: selected ? c.surface2 : undefined,
        },
      }}
      actions={actions}
      shortcuts={
        <IconButton
          theme={theme}
          label={`归档 workspace · ${title}`}
          icon="Archive"
          size={pickerRowActionSize(compact)}
          disabled={disabled}
          testID={`split-archive-workspace-${workspace.id}`}
          onPress={onArchive}
        />
      }
    >
      <Icon
        name={workspace.workspaceKind === "worktree" ? "GitBranch" : "Folder"}
        size={14}
        color={c.foregroundMuted}
      />
      <TreeRowName
        bridge={bridge}
        theme={theme}
        title={title}
        emphasized={selected}
        status={status}
      />
    </PickerRowMenu>
  );
}

function TreeRowName({
  bridge,
  theme,
  title,
  emphasized,
  status,
}: {
  bridge: NativeBridge;
  theme: Theme;
  title: string;
  emphasized: boolean;
  status: RowStatus;
}) {
  const id = useId();
  const dotID = `split-picker-tree-status-${id}`;
  useEffect(() => {
    if (status) describeControl(dotID, status.label);
  }, [dotID, status]);
  return (
    <View
      testID="split-picker-row-name"
      style={{
        flex: 1,
        minWidth: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          color: emphasized
            ? theme.colors.foreground
            : theme.colors.foregroundMuted,
          fontSize: 13,
          fontWeight: emphasized ? "500" : "400",
        }}
      >
        {title}
      </Text>
      {status && (
        <View
          testID={dotID}
          aria-hidden
          style={{
            width: 14,
            height: 14,
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {"running" in status ? (
            <bridge.StatusRing />
          ) : (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors[status.color],
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}
