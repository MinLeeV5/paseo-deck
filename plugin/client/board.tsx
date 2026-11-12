import {
  usePaseo,
  useRpc,
  type PluginScreenProps,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  activateTab,
  addPane,
  moveTab,
  removeEmptyGroup,
  removeTab,
  relatedTabIds,
  resourceKey,
  targetSchema,
  groupInspector,
  reconcileBoardLayout,
  type Board,
  type Pane,
  type RelatedTabs,
  type Target,
} from "../shared/model";
import { bridgeInfoRpc } from "../shared/bridge";
import type { ForkTabRequest } from "./fork-navigation";
import {
  focusControl,
  loadBoard,
  loadNativeBridge,
  onPageExit,
  saveBoard,
  scheduleFrame,
  focusConversation,
  installPluginPanelRouter,
  installForkTabRouter,
  installSplitMenuPlacement,
  type TabDropTarget,
} from "./web";
import { PaneFrame, TabStrip, type Rect } from "./pane-frame";
import { LayoutDivider } from "./split-divider";
import {
  applyLayoutPreset,
  boardGeometry,
  layoutTracks,
  canSplitTab,
  splitTab,
  type SplitEdge,
  type Axis,
  type LayoutPreset,
} from "../shared/layout";
import {
  equalizeSplitTree,
  resizeSplitTree,
  type SplitNode,
} from "../shared/split-tree";
import { TabDragLayer } from "./tab-drag-layer";
import { NativeKeyboard } from "./native-pane";
import {
  ResourcePicker,
  type PaneMenuAction,
  type PickerMode,
} from "./resource-picker";
import { WorkspaceIcons } from "./workspace-icon";
import { isRunning, useDirectory, workspaceLabel } from "./directory";
import type { NativeBridge } from "./native-types";
import type { PluginPanelRequest } from "./workspace-types";

const id = () =>
  `split-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
type Picker = {
  key: string;
  groupId: string;
  mode: PickerMode;
  newSplit: boolean;
  splitDirection?: Board["direction"];
  trigger: string;
  rect: Rect;
  bounds?: { top: number; bottom: number; height: number };
};
const RouteActivity = memo(function RouteActivity({
  bridge,
  onChange,
}: {
  bridge: NativeBridge;
  onChange(active: boolean): void;
}) {
  const active = bridge.useIsFocused();
  useLayoutEffect(() => onChange(active), [active, onChange]);
  return null;
});
export function SplitBoard(props: PluginScreenProps) {
  return <HostBoard key={props.host.id} {...props} />;
}
function HostBoard({ theme, host, layout, navigation }: PluginScreenProps) {
  const instanceId = useId(),
    paseo = usePaseo(),
    bridgeInfo = useRpc(bridgeInfoRpc);
  const [board, setBoardState] = useState<Board>(() => loadBoard(host.id));
  const boardRef = useRef(board),
    savedBoard = useRef(board);
  const actionOwner = useRef<string | null>(null);
  const routeActiveRef = useRef(true);
  const [focusedGroup, setFocusedGroup] = useState(board.groups[0].id);
  const [maximized, setMaximized] = useState<string | null>(null);
  const [routeActive, setRouteActive] = useState(true);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [notice, setNotice] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const archivingAgent = useRef(false);
  const [viewport, setViewport] = useState({ width: 1000, height: 700 });
  const root = useRef<View>(null),
    workarea = useRef<View>(null),
    anchors = useRef(new Map<string, View>());
  const pendingCloses = useRef(new Set<string>()),
    runningTabs = useRef(new Set<string>()),
    closingAll = useRef(false),
    terminalCreation = useRef(false),
    cancelFrame = useRef<(() => void) | null>(null),
    pendingResize = useRef<Partial<
      Pick<Board, "ratio" | "columnWeights" | "rowWeights" | "splitTree">
    > | null>(null),
    resizeStart = useRef<{
      axis: Axis;
      boundary: number;
      weights: number[];
      dimension: number;
      treePath?: string;
      tree?: SplitNode;
    } | null>(null);
  const setBoard = useCallback((update: Board | ((value: Board) => Board)) => {
    const next = reconcileBoardLayout(
      typeof update === "function" ? update(boardRef.current) : update,
    );
    if (next === boardRef.current) return;
    boardRef.current = next;
    setBoardState(next);
  }, []);
  const bridge = useQuery({
    queryKey: ["split-native-bridge"],
    queryFn: () => loadNativeBridge(() => bridgeInfo({})),
    retry: false,
    staleTime: Infinity,
  });
  const directory = useDirectory(
      host.id,
      routeActive,
      picker !== null,
      bridge.data,
    ),
    directoryRef = useRef(directory.data);
  directoryRef.current = directory.data;
  const pickerRef = useRef(picker);
  pickerRef.current = picker;
  const groupFocus = board.groups.some((group) => group.id === focusedGroup)
    ? focusedGroup
    : board.groups[0].id;
  routeActiveRef.current = routeActive;
  const visibleGroup = maximized ?? (layout.compact ? groupFocus : null);
  const barHeight = layout.compact ? 36 : 32;
  const persist = useCallback(() => {
    if (savedBoard.current === boardRef.current) return;
    try {
      saveBoard(host.id, boardRef.current);
      savedBoard.current = boardRef.current;
    } catch (error) {
      setNotice(`布局保存失败：${errorMessage(error)}`);
    }
  }, [host.id]);
  useEffect(() => {
    const timer = setTimeout(persist, 300);
    return () => clearTimeout(timer);
  }, [board, persist]);
  useEffect(() => {
    const remove = onPageExit(persist);
    return () => {
      remove();
      persist();
    };
  }, [persist]);
  useEffect(() => () => cancelFrame.current?.(), []);
  useEffect(() => {
    if (!routeActive) setPicker(null);
  }, [routeActive]);
  const groupOf = useCallback(
    (tabId: string) =>
      boardRef.current.groups.find((group) => group.tabIds.includes(tabId)),
    [],
  );
  const focusTab = useCallback(
    (tabId: string) => {
      actionOwner.current = tabId;
      const group = groupOf(tabId);
      if (group) setFocusedGroup(group.id);
    },
    [groupOf],
  );
  const selectTab = useCallback(
    (tabId: string) => {
      actionOwner.current = tabId;
      const group = groupOf(tabId);
      if (!group) return;
      setBoard((current) => activateTab(current, tabId));
      setFocusedGroup(group.id);
      setMaximized((current) => (current ? group.id : null));
    },
    [groupOf, setBoard],
  );
  const beforeWorkspaceAction = useCallback(
    async (tabId: string) => {
      focusTab(tabId);
      const pane = boardRef.current.panes.find((pane) => pane.id === tabId);
      const conversation =
        pane?.presentation === "inspector" ? pane.openerTabId : pane?.id;
      if (conversation) await focusConversation(conversation);
    },
    [focusTab],
  );
  const getGroups = useCallback(() => boardRef.current.groups, []);
  const dropTab = useCallback(
    (tabId: string, groupId: string, index: number) => {
      setBoard((current) =>
        activateTab(moveTab(current, tabId, groupId, false, index), tabId),
      );
      selectTab(tabId);
      scheduleFrame(() => focusControl(`split-tab-${tabId}`));
    },
    [setBoard, selectTab],
  );
  const splitDraggedTab = useCallback(
    (tabId: string, groupId: string, edge: SplitEdge) => {
      const current = boardRef.current;
      const next = splitTab(current, tabId, groupId, edge, `group-${id()}`);
      if (next === current) return;
      setBoard(next);
      selectTab(tabId);
      setMaximized(null);
      scheduleFrame(() => focusControl(`split-tab-${tabId}`));
    },
    [setBoard, selectTab],
  );
  const dropOnTarget = useCallback(
    (tabId: string, target: TabDropTarget) => {
      if (target.kind === "split")
        splitDraggedTab(tabId, target.groupId, target.edge);
      else
        dropTab(
          tabId,
          target.groupId,
          target.kind === "tabs"
            ? target.index
            : (boardRef.current.groups.find(
                (group) => group.id === target.groupId,
              )?.tabIds.length ?? 0),
        );
    },
    [dropTab, splitDraggedTab],
  );
  const registerAnchor = useCallback((groupId: string, anchor: View | null) => {
    if (anchor) anchors.current.set(groupId, anchor);
    else anchors.current.delete(groupId);
  }, []);
  const dismiss = useCallback(() => {
    const trigger = pickerRef.current?.trigger;
    setPicker(null);
    setNotice(null);
    if (trigger) scheduleFrame(() => focusControl(trigger));
  }, []);
  const showPicker = useCallback(
    (
      groupId: string,
      anchor: View | null = null,
      mode: PickerMode = "agent",
      newSplit = false,
      splitDirection?: Board["direction"],
    ) => {
      const key = id();
      setFocusedGroup(groupId);
      focusControl(`split-${mode === "menu" ? "menu" : "add"}-${groupId}`);
      const estimated = mode === "menu" ? 360 : 500;
      setNotice(null);
      setPicker({
        key,
        groupId,
        mode,
        newSplit,
        splitDirection,
        trigger: `split-${mode === "menu" ? "menu" : "add"}-${groupId}`,
        rect: { left: 8, top: 8, width: 360, height: estimated },
      });
      void directory.refetch();
      root.current?.measureInWindow((rx, ry, rw, rh) => {
        const position = (ax: number, ay: number, aw: number, ah: number) => {
          const width = Math.min(
              layout.compact ? 420 : 360,
              Math.max(0, rw - 16),
            ),
            below = rh - (ay - ry + ah) - 8,
            above = ay - ry - 8;
          setPicker((current) => {
            if (current?.key !== key) return current;
            const height = Math.min(
              current.rect.height,
              Math.max(180, rh - 16),
            );
            const top =
              below >= height || below >= above
                ? Math.min(ay - ry + ah + 4, rh - height - 8)
                : Math.max(8, ay - ry - height - 4);
            return {
              ...current,
              bounds: { top: ay - ry, bottom: ay - ry + ah, height: rh },
              rect: {
                left: Math.max(8, Math.min(ax - rx, rw - width - 8)),
                top: Math.max(8, top),
                width,
                height,
              },
            };
          });
        };
        const target = anchor ?? anchors.current.get(groupId);
        if (target) target.measureInWindow(position);
        else position(rx + 8, ry + 4, 24, barHeight);
      });
    },
    [directory.refetch, barHeight, layout.compact],
  );
  const openNewTab = useCallback(
    () => showPicker(visibleGroup ?? groupFocus),
    [showPicker, visibleGroup, groupFocus],
  );
  const openSplit = useCallback(
    (direction: Board["direction"]) =>
      showPicker(visibleGroup ?? groupFocus, null, "agent", true, direction),
    [showPicker, visibleGroup, groupFocus],
  );
  const jumpToTab = useCallback(
    (index: number) => {
      const group = boardRef.current.groups.find(
        (item) => item.id === (visibleGroup ?? groupFocus),
      );
      const tabId = group?.tabIds[index];
      if (!tabId) return;
      selectTab(tabId);
      scheduleFrame(() => focusControl(`split-tab-${tabId}`));
    },
    [groupFocus, visibleGroup, selectTab],
  );
  const cycleCurrentTab = useCallback(
    (direction: -1 | 1) => {
      const group = boardRef.current.groups.find(
        (item) => item.id === (visibleGroup ?? groupFocus),
      );
      if (!group?.tabIds.length) return;
      const index = group.tabIds.indexOf(group.activeTabId!);
      const next =
        group.tabIds[
          (index + direction + group.tabIds.length) % group.tabIds.length
        ];
      selectTab(next);
      scheduleFrame(() => focusControl(`split-tab-${next}`));
    },
    [groupFocus, visibleGroup, selectTab],
  );
  const showMenu = useCallback(
    (groupId: string, anchor: View | null) =>
      showPicker(groupId, anchor, "menu"),
    [showPicker],
  );
  const titleFor = useCallback((target: Target): string => {
    if (target.kind === "agent")
      return (
        directoryRef.current?.agents.find(
          (agent) => agent.id === target.agentId,
        )?.title ?? "Agent"
      );
    if (target.kind === "draft") return "新建 Agent";
    if (target.kind === "terminal")
      return (
        directoryRef.current?.terminals.find(
          (terminal) => terminal.id === target.terminalId,
        )?.name ?? "终端"
      );
    if (target.kind === "file")
      return target.path.split("/").filter(Boolean).pop() ?? target.path;
    return target.kind === "files"
      ? "文件"
      : target.kind === "working_diff"
        ? "更改"
        : "子 Agent";
  }, []);
  const openTarget = useCallback(
    (
      target: Target,
      workspaceId: string,
      groupId: string,
      newSplit = false,
      sourceName?: string,
      splitDirection?: Board["direction"],
    ) => {
      try {
        const parsed = targetSchema.parse(target);
        if (bridge.data && !bridge.data.hasPanel(parsed.kind))
          throw new Error(`当前 Paseo 尚未注册 ${parsed.kind} 面板。`);
        const workspace = directoryRef.current?.workspaces.find(
          (item) => item.id === workspaceId,
        );
        const pane: Pane = {
          id: id(),
          serverId: host.id,
          workspaceId,
          workspaceName:
            sourceName ?? (workspace ? workspaceLabel(workspace) : workspaceId),
          title: titleFor(parsed),
          target: parsed,
        };
        const duplicate = boardRef.current.panes.find(
          (item) => resourceKey(item) === resourceKey(pane),
        );
        const newGroupId = newSplit ? `group-${id()}` : undefined;
        setBoard((current) => {
          const next = addPane(current, pane, { groupId, newGroupId });
          return splitDirection && next.groups.length > current.groups.length
            ? {
                ...next,
                direction: splitDirection,
                splitTree:
                  next.splitTree?.type === "split"
                    ? {
                        ...next.splitTree,
                        axis: splitDirection === "row" ? "x" : "y",
                      }
                    : next.splitTree,
              }
            : next;
        });
        const targetGroup = groupOf(duplicate?.id ?? pane.id)!;
        setFocusedGroup(targetGroup.id);
        setMaximized((current) =>
          newSplit ? null : current ? targetGroup.id : null,
        );
        setPicker(null);
        setNotice(null);
      } catch (error) {
        setNotice(errorMessage(error));
      }
    },
    [bridge.data, host.id, titleFor, setBoard, groupOf],
  );
  const chooseTarget = useCallback(
    (target: Target, workspaceId: string) => {
      const current = pickerRef.current;
      if (current)
        openTarget(
          target,
          workspaceId,
          current.groupId,
          current.newSplit,
          undefined,
          current.splitDirection,
        );
    },
    [openTarget],
  );
  const createAgent = useCallback(() => {
    const groupId = visibleGroup ?? groupFocus;
    const group = boardRef.current.groups.find((item) => item.id === groupId);
    const pane = boardRef.current.panes.find(
      (item) => item.id === group?.activeTabId,
    );
    if (pane)
      openTarget(
        { kind: "draft", draftId: `draft-${id()}` },
        pane.workspaceId,
        groupId,
        false,
        pane.workspaceName,
      );
    else showPicker(groupId, null, "new");
  }, [visibleGroup, groupFocus, openTarget, showPicker]);

  const archiveAgent = useCallback(
    async (agentId: string) => {
      const agent = directoryRef.current?.agents.find(
        (item) => item.id === agentId,
      );
      if (!agent || !bridge.data || archivingAgent.current) return;
      archivingAgent.current = true;
      setBusy(true);
      setNotice(null);
      try {
        const confirmed = await bridge.data.confirmDialog({
          title: "归档 Agent",
          message: `确定归档「${agent.title ?? "未命名 Agent"}」吗？${isRunning(agent) ? "\n\n该 Agent 正在运行，归档会停止当前任务。" : ""}\n\n归档后将从资源列表移除，并关闭它在工作台中的标签页。`,
          confirmLabel: "归档",
          cancelLabel: "取消",
          destructive: true,
        });
        if (!confirmed) return;
        await paseo.agents.ref(agentId).archive();
        setBoard((current) =>
          current.panes
            .filter(
              (pane) =>
                pane.serverId === host.id &&
                pane.target.kind === "agent" &&
                pane.target.agentId === agentId,
            )
            .reduce((next, pane) => removeTab(next, pane.id), current),
        );
        void directory.refetch();
      } catch (error) {
        setNotice(`归档失败：${errorMessage(error)}`);
      } finally {
        archivingAgent.current = false;
        setBusy(false);
      }
    },
    [bridge.data, paseo, host.id, setBoard, directory.refetch],
  );
  const openPluginPanel = useCallback(
    (request: PluginPanelRequest): boolean => {
      if (!routeActiveRef.current || request.serverId !== host.id) return false;
      const current = boardRef.current;
      const source = current.panes.find(
        (pane) => pane.id === actionOwner.current,
      );
      const group = source ? groupOf(source.id) : undefined;
      if (!source || !group || source.workspaceId !== request.workspaceId)
        return false;
      try {
        const target: Target = {
          kind: "plugin",
          pluginId: request.pluginId,
          panelId: request.panelId,
          context: request.context,
          ...(request.agentId ? { agentId: request.agentId } : {}),
        };
        const installation = bridge.data?.pluginButtonStore
          .getSnapshot()
          .find(
            (entry) =>
              entry.installation.id === request.pluginId &&
              entry.installation.serverId === request.serverId,
          )?.installation;
        const panel = installation?.workspacePanels.find(
          (panel) =>
            panel.id === request.panelId && panel.context === request.context,
        );
        const openerTabId =
          source.presentation === "inspector" ? source.openerTabId : source.id;
        let title = request.panelId;
        if (panel) {
          try {
            title =
              typeof panel.title === "string"
                ? panel.title
                : (installation?.i18n?.resolve(panel.title) ?? title);
          } catch {
            // A failing translation must not prevent opening the panel.
          }
        }
        const pane: Pane = {
          id: id(),
          serverId: source.serverId,
          workspaceId: source.workspaceId,
          workspaceName: source.workspaceName,
          title,
          target,
          presentation: request.location === "explorer" ? "inspector" : "tab",
          openerTabId,
        };
        let openedId = pane.id;
        setBoard((value) => {
          const duplicate = value.panes.find(
            (item) => resourceKey(item) === resourceKey(pane),
          );
          openedId = duplicate?.id ?? pane.id;
          let next = addPane(value, pane, { groupId: group.id });
          if (duplicate && pane.presentation === "inspector")
            next = moveTab(next, duplicate.id, group.id);
          if (duplicate)
            next = {
              ...next,
              panes: next.panes.map((item) =>
                item.id === duplicate.id
                  ? {
                      ...item,
                      title,
                      presentation: pane.presentation,
                      openerTabId,
                    }
                  : item,
              ),
            };
          return next;
        });
        const destination = groupOf(openedId);
        if (destination) setFocusedGroup(destination.id);
        actionOwner.current = openedId;
        setPicker(null);
        setNotice(null);
      } catch (error) {
        setNotice(errorMessage(error));
      }
      return true;
    },
    [host.id, bridge.data, groupOf, setBoard],
  );
  useEffect(
    () =>
      bridge.data
        ? installPluginPanelRouter(bridge.data, openPluginPanel)
        : undefined,
    [bridge.data, openPluginPanel],
  );
  useEffect(
    () => (bridge.data ? installSplitMenuPlacement(bridge.data) : undefined),
    [bridge.data],
  );
  const openFromPane = useCallback(
    (tabId: string, target: Target, side = false) => {
      const pane = boardRef.current.panes.find((pane) => pane.id === tabId),
        group = groupOf(tabId);
      if (pane && group)
        openTarget(
          target,
          pane.workspaceId,
          group.id,
          side,
          pane.workspaceName,
        );
      if (target.kind === "terminal") void directory.refetch();
    },
    [groupOf, openTarget, directory.refetch],
  );
  const openInPlace = useCallback(
    (tabId: string, target: Target, workspaceId?: string) => {
      const source = boardRef.current.panes.find((pane) => pane.id === tabId);
      const group = groupOf(tabId);
      if (source && group && workspaceId && workspaceId !== source.workspaceId)
        openTarget(target, workspaceId, group.id);
      else openFromPane(tabId, target);
    },
    [openFromPane, openTarget, groupOf],
  );
  const openForkTab = useCallback(
    (request: ForkTabRequest): boolean => {
      if (!routeActiveRef.current || request.serverId !== host.id) return false;
      const source = boardRef.current.panes.find(
        (pane) =>
          pane.serverId === request.serverId &&
          pane.workspaceId === request.workspaceId &&
          pane.target.kind === "agent" &&
          pane.target.agentId === request.sourceAgentId,
      );
      if (!source) return false;
      openInPlace(source.id, request.target, request.workspaceId);
      return true;
    },
    [host.id, openInPlace],
  );
  useEffect(
    () =>
      bridge.data ? installForkTabRouter(bridge.data, openForkTab) : undefined,
    [bridge.data, openForkTab],
  );
  const openToSide = useCallback(
    (tabId: string, target: Target) => openFromPane(tabId, target, true),
    [openFromPane],
  );
  const importFromPane = useCallback(
    (tabId: string) => {
      const group = groupOf(tabId);
      if (group) showPicker(group.id);
    },
    [groupOf, showPicker],
  );
  const onRunningChange = useCallback((tabId: string, running: boolean) => {
    if (running) runningTabs.current.add(tabId);
    else runningTabs.current.delete(tabId);
  }, []);
  const confirmRunningTabs = useCallback(
    async (panes: Pane[]) => {
      const running = panes.filter((pane) => {
        if (runningTabs.current.has(pane.id)) return true;
        if (pane.target.kind !== "agent") return false;
        const agentId = pane.target.agentId;
        const agent = directoryRef.current?.agents.find(
          (item) => item.id === agentId,
        );
        return agent && isRunning(agent);
      });
      if (!running.length) return true;
      if (!bridge.data) return false;
      const titles = running.map((pane) => {
        const agentId =
          pane.target.kind === "agent" ? pane.target.agentId : null;
        const title = directoryRef.current?.agents.find(
          (item) => item.id === agentId,
        )?.title;
        return `「${title ?? pane.title}」`;
      });
      return bridge.data.confirmDialog({
        title: "关闭运行中的 Tab",
        message: `${titles.join("、")}仍在运行，确定${panes.length === 1 ? "关闭这个 Tab" : "关闭所选 Tab"}吗？\n\n关闭只会移除工作台中的标签页，Agent 会继续运行，可从添加面板重新打开。`,
        confirmLabel: "关闭 Tab",
        cancelLabel: "取消",
        destructive: false,
      });
    },
    [bridge.data],
  );
  const closeTab = useCallback(
    async (tabId: string) => {
      const pane = boardRef.current.panes.find((item) => item.id === tabId);
      if (!pane || pendingCloses.current.has(tabId)) return;
      pendingCloses.current.add(tabId);
      try {
        if (!(await confirmRunningTabs([pane]))) return;
        const attributes = bridge.data?.getPanelInstanceAttributes({
          serverId: pane.serverId,
          workspaceId: pane.workspaceId,
          tabId: `${instanceId}:${pane.id}`,
        });
        if (attributes?.modified && bridge.data) {
          const resume = attributes.suspendPendingSave?.();
          let discard = false;
          try {
            discard = await bridge.data.confirmDialog({
              title: "文件尚未保存",
              message: "关闭这个 Tab 并放弃未保存的更改？",
              confirmLabel: "放弃更改并关闭",
              cancelLabel: "继续编辑",
              destructive: true,
            });
          } finally {
            if (!discard) resume?.();
          }
          if (!discard) return;
        }
        setBoard((current) => {
          const next = removeTab(current, tabId);
          return pane.presentation === "inspector" &&
            pane.openerTabId &&
            next.panes.some((value) => value.id === pane.openerTabId)
            ? activateTab(next, pane.openerTabId)
            : next;
        });
      } catch (error) {
        setNotice(errorMessage(error));
      } finally {
        pendingCloses.current.delete(tabId);
      }
    },
    [bridge.data, confirmRunningTabs, instanceId, setBoard],
  );
  const closeEmptyGroup = useCallback(
    (groupId: string) => {
      const current = boardRef.current;
      const next = removeEmptyGroup(current, groupId);
      if (next === current) return;
      cancelFrame.current?.();
      cancelFrame.current = null;
      pendingResize.current = null;
      resizeStart.current = null;
      setBoard(next);
      const index = current.groups.findIndex((group) => group.id === groupId);
      const remaining = next.groups[Math.min(index, next.groups.length - 1)];
      setFocusedGroup(remaining.id);
      setMaximized((value) => (value === groupId ? null : value));
      setPicker((value) => (value?.groupId === groupId ? null : value));
      actionOwner.current = remaining.activeTabId;
      scheduleFrame(() =>
        focusControl(
          remaining.activeTabId
            ? `split-tab-${remaining.activeTabId}`
            : `split-add-${remaining.id}`,
        ),
      );
    },
    [setBoard],
  );
  const closeCurrentTab = useCallback(() => {
    const group = boardRef.current.groups.find(
      (item) => item.id === (visibleGroup ?? groupFocus),
    );
    const tabId = group?.activeTabId;
    if (!tabId) {
      if (group) closeEmptyGroup(group.id);
      return;
    }
    void closeTab(tabId).then(() => {
      if (boardRef.current.panes.some((pane) => pane.id === tabId)) return;
      const activeTabId = boardRef.current.groups.find(
        (item) => item.id === group.id,
      )?.activeTabId;
      scheduleFrame(() =>
        focusControl(
          activeTabId ? `split-tab-${activeTabId}` : `split-add-${group.id}`,
        ),
      );
    });
  }, [closeTab, closeEmptyGroup, groupFocus, visibleGroup]);
  const closeTabAndFocus = useCallback(
    async (tabId: string) => {
      const group = groupOf(tabId);
      if (!group) return;
      await closeTab(tabId);
      const remaining = boardRef.current.groups.find(
        (item) => item.id === group.id,
      );
      if (!remaining) return;
      setFocusedGroup(remaining.id);
      scheduleFrame(() =>
        focusControl(
          remaining.activeTabId
            ? `split-tab-${remaining.activeTabId}`
            : `split-add-${remaining.id}`,
        ),
      );
    },
    [closeTab, groupOf],
  );
  const closeTabs = useCallback(
    async (groupId: string, ids: string[], removeGroup = false) => {
      const group = boardRef.current.groups.find((item) => item.id === groupId);
      if (
        !group ||
        !ids.length ||
        (removeGroup && boardRef.current.groups.length <= 1) ||
        closingAll.current ||
        ids.some((id) => pendingCloses.current.has(id))
      )
        return;
      const closing = boardRef.current.panes.filter((pane) =>
        ids.includes(pane.id),
      );
      const resumes: (() => void)[] = [];
      let committed = false;
      closingAll.current = true;
      ids.forEach((id) => pendingCloses.current.add(id));
      try {
        if (!(await confirmRunningTabs(closing))) return;
        for (const pane of closing) {
          const attributes = bridge.data?.getPanelInstanceAttributes({
            serverId: pane.serverId,
            workspaceId: pane.workspaceId,
            tabId: `${instanceId}:${pane.id}`,
          });
          if (!attributes?.modified || !bridge.data) continue;
          const resume = attributes.suspendPendingSave?.();
          if (resume) resumes.push(resume);
          const discard = await bridge.data.confirmDialog({
            title: "文件尚未保存",
            message: `「${pane.title}」有未保存的更改。放弃这些更改并继续关闭所选 Tab？`,
            confirmLabel: "放弃更改并继续",
            cancelLabel: "取消关闭",
            destructive: true,
          });
          if (!discard) return;
        }
        if (removeGroup && boardRef.current.groups.length <= 1) return;
        setBoard((current) => ids.reduce(removeTab, current));
        committed = true;
        if (removeGroup) {
          closeEmptyGroup(group.id);
          return;
        }
        setFocusedGroup(group.id);
        const activeId = boardRef.current.groups.find(
          (item) => item.id === group.id,
        )?.activeTabId;
        scheduleFrame(() =>
          focusControl(
            activeId ? `split-tab-${activeId}` : `split-add-${group.id}`,
          ),
        );
      } catch (error) {
        setNotice(errorMessage(error));
      } finally {
        if (!committed) resumes.forEach((resume) => resume());
        ids.forEach((id) => pendingCloses.current.delete(id));
        closingAll.current = false;
      }
    },
    [bridge.data, confirmRunningTabs, closeEmptyGroup, instanceId, setBoard],
  );
  const closeRelatedTabs = useCallback(
    async (tabId: string, scope: RelatedTabs) => {
      const group = groupOf(tabId);
      if (group)
        await closeTabs(
          group.id,
          relatedTabIds(boardRef.current, tabId, scope),
        );
    },
    [closeTabs, groupOf],
  );
  const closeGroup = useCallback(
    (groupId: string) => {
      const group = boardRef.current.groups.find((item) => item.id === groupId);
      if (!group || boardRef.current.groups.length <= 1) return;
      if (!group.tabIds.length) closeEmptyGroup(groupId);
      else void closeTabs(groupId, group.tabIds, true);
    },
    [closeEmptyGroup, closeTabs],
  );
  const closeAllTabs = useCallback(async () => {
    if (closingAll.current || pendingCloses.current.size) return;
    closingAll.current = true;
    const closing = [...boardRef.current.panes];
    closing.forEach((pane) => pendingCloses.current.add(pane.id));
    const resumes: (() => void)[] = [];
    let committed = false;
    try {
      if (!(await confirmRunningTabs(closing))) return;
      for (const pane of closing) {
        const attributes = bridge.data?.getPanelInstanceAttributes({
          serverId: pane.serverId,
          workspaceId: pane.workspaceId,
          tabId: `${instanceId}:${pane.id}`,
        });
        if (!attributes?.modified || !bridge.data) continue;
        const resume = attributes.suspendPendingSave?.();
        if (resume) resumes.push(resume);
        const discard = await bridge.data.confirmDialog({
          title: "文件尚未保存",
          message: `「${pane.title}」有未保存的更改。放弃这些更改并继续关闭所有 Tab？`,
          confirmLabel: "放弃更改并继续",
          cancelLabel: "取消关闭所有 Tab",
          destructive: true,
        });
        if (!discard) return;
      }
      const ids = new Set(closing.map((pane) => pane.id));
      setBoard((current) => {
        const panes = current.panes.filter((pane) => !ids.has(pane.id));
        const groups = current.groups
          .map((group) => {
            const tabIds = group.tabIds.filter((id) => !ids.has(id));
            return {
              ...group,
              tabIds,
              activeTabId: tabIds.includes(group.activeTabId ?? "")
                ? group.activeTabId
                : (tabIds[0] ?? null),
            };
          })
          .filter((group) => group.tabIds.length);
        if (!groups.length)
          groups.push({
            id: current.groups[0].id,
            tabIds: [],
            activeTabId: null,
          });
        return {
          ...current,
          panes,
          groups,
          ...(panes.length
            ? {}
            : {
                layout: "auto" as const,
                ratio: 0.5,
                columnWeights: undefined,
                rowWeights: undefined,
              }),
        };
      });
      committed = true;
      setMaximized(null);
      setFocusedGroup(boardRef.current.groups[0].id);
      actionOwner.current = null;
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      if (!committed) resumes.forEach((resume) => resume());
      closing.forEach((pane) => pendingCloses.current.delete(pane.id));
      closingAll.current = false;
    }
  }, [bridge.data, confirmRunningTabs, instanceId, setBoard]);
  const retarget = useCallback(
    (tabId: string, target: Target) => {
      const parsed = targetSchema.safeParse(target);
      if (!parsed.success) return;
      setBoard((current) => ({
        ...current,
        panes: current.panes.map((pane) =>
          pane.id === tabId
            ? { ...pane, target: parsed.data, title: titleFor(parsed.data) }
            : pane,
        ),
      }));
      void directory.refetch();
    },
    [setBoard, titleFor, directory.refetch],
  );
  const setPaneState = useCallback(
    (tabId: string, state: Pane["state"]) =>
      setBoard((current) =>
        current.panes.find((pane) => pane.id === tabId)?.state === state
          ? current
          : {
              ...current,
              panes: current.panes.map((pane) =>
                pane.id === tabId ? { ...pane, state } : pane,
              ),
            },
      ),
    [setBoard],
  );
  const createTerminalAt = useCallback(
    async (
      workspaceId: string,
      selected: Pick<Picker, "groupId" | "newSplit" | "splitDirection">,
    ) => {
      if (terminalCreation.current) return;
      if (
        boardRef.current.panes.length >= 8 ||
        (selected.newSplit && boardRef.current.groups.length >= 8)
      ) {
        setNotice("最多打开 8 个资源 Tab / 分屏，请先关闭一个。");
        return;
      }
      terminalCreation.current = true;
      setBusy(true);
      try {
        const terminal = await paseo.workspaces
          .ref(workspaceId)
          .terminals.create({ name: "Deck terminal" });
        openTarget(
          { kind: "terminal", terminalId: terminal.id },
          workspaceId,
          selected.groupId,
          selected.newSplit,
          undefined,
          selected.splitDirection,
        );
        void directory.refetch();
      } catch (error) {
        setNotice(errorMessage(error));
      } finally {
        terminalCreation.current = false;
        setBusy(false);
      }
    },
    [paseo, openTarget, directory.refetch],
  );
  const createTerminal = useCallback(
    (workspaceId: string) => {
      const selected = pickerRef.current;
      if (selected) void createTerminalAt(workspaceId, selected);
    },
    [createTerminalAt],
  );
  const newTerminal = useCallback(() => {
    const groupId = visibleGroup ?? groupFocus;
    const group = boardRef.current.groups.find((item) => item.id === groupId);
    const pane = boardRef.current.panes.find(
      (item) => item.id === group?.activeTabId,
    );
    if (pane)
      void createTerminalAt(pane.workspaceId, { groupId, newSplit: false });
    else showPicker(groupId, null, "new-terminal");
  }, [visibleGroup, groupFocus, createTerminalAt, showPicker]);
  const maximize = useCallback((groupId: string) => {
    setFocusedGroup(groupId);
    setMaximized((current) => (current === groupId ? null : groupId));
  }, []);
  const flushResize = useCallback(() => {
    cancelFrame.current?.();
    cancelFrame.current = null;
    const next = pendingResize.current;
    pendingResize.current = null;
    if (next) setBoard((current) => ({ ...current, ...next }));
  }, [setBoard]);
  const startResize = useCallback(
    (axis: Axis, boundary: number, dividerId: string) => {
      flushResize();
      const current = boardRef.current;
      if (current.splitTree) {
        const divider = boardGeometry(
          current,
          viewport.width,
          viewport.height,
        ).dividers.find((value) => value.id === dividerId);
        if (!divider || divider.treePath === undefined) return;
        resizeStart.current = {
          axis,
          boundary,
          weights: [divider.ratio!, 1 - divider.ratio!],
          dimension: divider.dimension!,
          treePath: divider.treePath,
          tree: current.splitTree,
        };
        return;
      }
      const tracks = layoutTracks(boardRef.current);
      resizeStart.current = {
        axis,
        boundary,
        weights: axis === "x" ? tracks.columnWeights : tracks.rowWeights,
        dimension: axis === "x" ? viewport.width : viewport.height,
      };
    },
    [flushResize, viewport.width, viewport.height],
  );
  const moveResize = useCallback(
    (delta: number) => {
      const start = resizeStart.current;
      if (!start || start.dimension <= 0) return;
      const index = start.boundary - 1;
      const weights = [...start.weights];
      const pair = weights[index] + weights[index + 1];
      const minimum = Math.min(100 / start.dimension, pair / 3);
      const next = Math.max(
        minimum,
        Math.min(pair - minimum, weights[index] + delta / start.dimension),
      );
      weights[index] = next;
      weights[index + 1] = pair - next;
      pendingResize.current =
        start.tree && start.treePath !== undefined
          ? { splitTree: resizeSplitTree(start.tree, start.treePath, next) }
          : start.axis === "x"
            ? {
                columnWeights: weights,
                ...(weights.length === 2
                  ? { ratio: Math.max(0.2, Math.min(0.8, weights[0])) }
                  : {}),
              }
            : { rowWeights: weights };
      if (!cancelFrame.current)
        cancelFrame.current = scheduleFrame(() => {
          cancelFrame.current = null;
          const update = pendingResize.current;
          pendingResize.current = null;
          if (update) setBoard((current) => ({ ...current, ...update }));
        });
    },
    [setBoard],
  );
  const finishResize = useCallback(() => {
    flushResize();
    resizeStart.current = null;
  }, [flushResize]);
  const calculatedLayout = useMemo(
    () => boardGeometry(board, viewport.width, viewport.height),
    [
      board.groups,
      board.direction,
      board.ratio,
      board.layout,
      board.columnWeights,
      board.rowWeights,
      board.splitTree,
      viewport,
    ],
  );
  const geometry = useMemo(
    () =>
      visibleGroup
        ? new Map(
            board.groups.map((group) => [
              group.id,
              {
                left: 0,
                top: 0,
                width: viewport.width,
                height: viewport.height,
                insetX: 0,
                insetY: 0,
              },
            ]),
          )
        : calculatedLayout.rects,
    [visibleGroup, board.groups, viewport, calculatedLayout],
  );
  const groupPanes = useMemo(
    () =>
      new Map(
        board.groups.map((group) => [
          group.id,
          group.tabIds.map(
            (tabId) => board.panes.find((pane) => pane.id === tabId)!,
          ),
        ]),
      ),
    [board.groups, board.panes],
  );
  const tabRects = useMemo(
    () =>
      new Map(
        board.panes.map((pane) => {
          const group = board.groups.find((group) =>
              group.tabIds.includes(pane.id),
            )!,
            rect = geometry.get(group.id)!;
          const inspector = groupInspector(board, group);
          const sideWidth = Math.min(
            320,
            Math.max(0, rect.width - 16),
            Math.max(240, rect.width * 0.45),
          );
          const isSide = inspector?.panel.id === pane.id;
          const isOpener = inspector?.opener.id === pane.id;
          const insetX = rect.insetX,
            insetY = rect.insetY;
          return [
            pane.id,
            {
              left: rect.left + insetX + (isSide ? rect.width - sideWidth : 0),
              top: rect.top + barHeight + insetY,
              width: Math.max(
                0,
                (isSide
                  ? sideWidth
                  : isOpener && rect.width >= 560
                    ? rect.width - sideWidth
                    : rect.width) - insetX,
              ),
              height: Math.max(0, rect.height - barHeight - insetY),
            },
          ];
        }),
      ),
    [board.panes, board.groups, board.direction, geometry, barHeight],
  );
  const openedAgentIds = useMemo(
    () =>
      new Set(
        board.panes.flatMap((pane) =>
          pane.target.kind === "agent" ? [pane.target.agentId] : [],
        ),
      ),
    [board.panes],
  );
  const menuActionsFor = useCallback(
    (groupId: string): PaneMenuAction[] => {
      const group = board.groups.find((group) => group.id === groupId);
      if (!group) return [];
      const pane = board.panes.find((pane) => pane.id === group.activeTabId);
      const run = (callback: () => void) => () => {
        setPicker(null);
        setNotice(null);
        try {
          callback();
        } catch (error) {
          setNotice(errorMessage(error));
        }
      };
      const actions: PaneMenuAction[] = [];
      if (pane) {
        const index = group.tabIds.indexOf(pane.id);
        if (index > 0)
          actions.push({
            label: "将当前 Tab 向左移动",
            icon: "ArrowLeft",
            category: "移动",
            run: run(() => dropTab(pane.id, group.id, index - 1)),
          });
        if (index < group.tabIds.length - 1)
          actions.push({
            label: "将当前 Tab 向右移动",
            icon: "ArrowRight",
            category: "移动",
            run: run(() => dropTab(pane.id, group.id, index + 1)),
          });
        actions.push({
          label: "将当前 Tab 移到新分屏",
          icon: "PanelRightOpen",
          category: "移动",
          disabled: !canSplitTab(board.groups, pane.id, group.id),
          run: run(() => splitDraggedTab(pane.id, group.id, "right")),
        });
        for (const [edge, label, icon] of [
          ["left", "左侧", "PanelLeftOpen"],
          ["top", "上方", "ArrowUp"],
          ["bottom", "下方", "ArrowDown"],
        ] as const) {
          actions.push({
            label: `将当前 Tab 移到${label}分屏`,
            icon,
            category: "移动",
            disabled: !canSplitTab(board.groups, pane.id, group.id),
            run: run(() => splitDraggedTab(pane.id, group.id, edge)),
          });
        }
        for (const destination of board.groups.filter(
          (item) => item.id !== group.id,
        )) {
          const active = board.panes.find(
            (pane) => pane.id === destination.activeTabId,
          );
          actions.push({
            label: `移到「${active ? titleFor(active.target) : "空分屏"}」`,
            icon: "ArrowRightToLine",
            category: "移动",
            run: run(() => {
              setBoard((current) => moveTab(current, pane.id, destination.id));
              setFocusedGroup(destination.id);
              setMaximized((current) => (current ? destination.id : null));
            }),
          });
        }
      }
      const presets: [LayoutPreset, string, string][] = [
        ["two", "两分屏", "Columns2"],
        ["three", "三分屏（横向）", "Columns3"],
        ["four", "四分屏（横向）", "PanelsTopLeft"],
        ["grid", "四宫格", "Grid2x2"],
      ];
      for (const [preset, label, icon] of presets)
        actions.push({
          label,
          icon,
          category: "排版",
          selected: board.layout === preset,
          run: run(() => {
            cancelFrame.current?.();
            cancelFrame.current = null;
            pendingResize.current = null;
            resizeStart.current = null;
            setBoard((current) => applyLayoutPreset(current, preset, pane?.id));
            const nextGroup = pane
              ? groupOf(pane.id)
              : boardRef.current.groups[0];
            if (nextGroup) setFocusedGroup(nextGroup.id);
            setMaximized(null);
          }),
        });
      actions.push({
        label: "上下排列",
        icon: "Rows2",
        category: "排版",
        selected:
          board.direction === "column" &&
          !board.splitTree &&
          (!board.layout || board.layout === "auto"),
        run: run(() =>
          setBoard((current) => ({
            ...current,
            direction: "column",
            layout: "auto",
            splitTree: undefined,
            columnWeights: undefined,
            rowWeights: undefined,
          })),
        ),
      });
      actions.push({
        label: "均分",
        icon: "Equal",
        category: "排版",
        run: run(() =>
          setBoard((current) => ({
            ...current,
            ratio: 0.5,
            splitTree: current.splitTree
              ? equalizeSplitTree(current.splitTree)
              : undefined,
            columnWeights: undefined,
            rowWeights: undefined,
          })),
        ),
      });
      if (pane) {
        actions.push({
          label: "在原 workspace 打开",
          icon: "ExternalLink",
          category: "其它",
          run: run(() => {
            if (pane.target.kind === "agent")
              navigation?.openAgent({
                serverId: pane.serverId,
                agentId: pane.target.agentId,
              });
            else
              navigation?.openWorkspace({
                serverId: pane.serverId,
                workspaceId: pane.workspaceId,
              });
          }),
        });
        actions.push({
          label: "关闭当前 Tab",
          icon: "X",
          category: "关闭",
          run: run(() => void closeTab(pane.id)),
        });
      } else if (board.groups.length > 1)
        actions.push({
          label: "关闭空分屏",
          icon: "X",
          category: "其它",
          run: run(() => {
            setBoard((current) => ({
              ...current,
              groups: current.groups.filter((item) => item.id !== group.id),
            }));
            setMaximized(null);
          }),
        });
      actions.push({
        label: "关闭所有 Tab",
        icon: "X",
        category: "关闭",
        destructive: true,
        disabled: board.panes.length === 0,
        run: run(() => void closeAllTabs()),
      });
      return actions;
    },
    [
      board.layout,
      groupOf,
      closeAllTabs,
      board.groups,
      board.panes,
      board.direction,
      showPicker,
      titleFor,
      setBoard,
      navigation,
      closeTab,
      dropTab,
      splitDraggedTab,
      board.splitTree,
    ],
  );
  const menuActionsByGroup = useMemo(
    () =>
      new Map(
        board.groups.map((group) => [group.id, menuActionsFor(group.id)]),
      ),
    [board.groups, menuActionsFor],
  );
  const menuActions = picker
    ? (menuActionsByGroup.get(picker.groupId) ?? [])
    : [];
  const updateDestination = useCallback(
    (newSplit: boolean) =>
      setPicker((current) => (current ? { ...current, newSplit } : current)),
    [],
  );
  const iconScope = routeActive
    ? (picker && picker.mode !== "menu"
        ? (directory.data?.workspaces.map((workspace) => workspace.id) ?? [])
        : board.panes.map((pane) => pane.workspaceId)
      ).join("\0")
    : "";
  const iconWorkspaceIds = useMemo(
    () => new Set(iconScope ? iconScope.split("\0") : []),
    [iconScope],
  );
  const resizePicker = useCallback(
    (requested: number) =>
      setPicker((current) => {
        if (!current) return current;
        const bounds = current.bounds;
        const height = Math.min(
          requested,
          bounds ? Math.max(180, bounds.height - 16) : requested,
        );
        if (Math.abs(height - current.rect.height) < 1) return current;
        const below = bounds ? bounds.height - bounds.bottom - 8 : 0;
        const top = bounds
          ? below >= height || below >= bounds.top
            ? Math.min(bounds.bottom + 4, bounds.height - height - 8)
            : Math.max(8, bounds.top - height - 4)
          : current.rect.top;
        return {
          ...current,
          rect: { ...current.rect, top: Math.max(8, top), height },
        };
      }),
    [],
  );
  const groupTitle = (tabId: string | null) => {
    const pane = board.panes.find((pane) => pane.id === tabId);
    return pane
      ? pane.target.kind === "agent"
        ? titleFor(pane.target)
        : pane.title
      : "空分屏";
  };
  const colors = theme.colors;
  if (Platform.OS !== "web")
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: colors.foreground }}>
          Paseo Deck 需要 Paseo 0.13.0 以上的桌面版或 Web 版。
        </Text>
      </View>
    );
  const content = bridge.data ? (
    <>
      <RouteActivity bridge={bridge.data} onChange={setRouteActive} />
      <NativeKeyboard
        bridge={bridge.data}
        enabled={routeActive && picker === null}
        onNewTab={openNewTab}
        onCloseTab={closeCurrentTab}
        onCycleTab={cycleCurrentTab}
        onJumpTab={jumpToTab}
        onNewAgent={createAgent}
        onNewTerminal={newTerminal}
        onSplit={openSplit}
      />
      {layout.compact && board.groups.length > 1 && (
        <View
          style={{
            height: 28,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              alignItems: "center",
              gap: 2,
              paddingHorizontal: 4,
            }}
          >
            {board.groups.map((group, index) => (
              <Pressable
                key={group.id}
                accessibilityRole="button"
                accessibilityLabel={`切换分屏 ${index + 1} · ${groupTitle(group.activeTabId)}`}
                accessibilityState={{ selected: groupFocus === group.id }}
                aria-pressed={groupFocus === group.id}
                onPress={() => {
                  setFocusedGroup(group.id);
                  setMaximized(null);
                }}
                style={{
                  paddingHorizontal: 8,
                  height: 25,
                  justifyContent: "center",
                  borderRadius: 4,
                  backgroundColor:
                    groupFocus === group.id ? colors.surface2 : "transparent",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    maxWidth: 120,
                    fontSize: 11,
                    color: colors.foregroundMuted,
                  }}
                >
                  {groupTitle(group.activeTabId)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      <View
        ref={workarea}
        testID="split-workarea"
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
        }}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setViewport((current) =>
            current.width === width && current.height === height
              ? current
              : { width, height },
          );
        }}
      >
        {board.groups.map((group) => {
          const rect = geometry.get(group.id)!,
            hidden = Boolean(visibleGroup && visibleGroup !== group.id),
            insetX = rect.insetX,
            insetY = rect.insetY;
          return (
            <View
              key={group.id}
              testID={`split-group-${group.id}`}
              style={{
                position: "absolute",
                left: rect.left + insetX,
                top: rect.top + insetY,
                width: Math.max(0, rect.width - insetX),
                height: Math.max(0, rect.height - insetY),
                display: hidden ? "none" : "flex",
              }}
            >
              <TabStrip
                group={group}
                instanceId={instanceId}
                panes={groupPanes.get(group.id)!}
                agents={directory.data?.agents ?? []}
                directory={directory.data}
                host={host}
                wide={!layout.compact && rect.width >= 560}
                width={rect.width}
                menuActions={menuActionsByGroup.get(group.id) ?? []}
                onFocus={focusTab}
                beforeAction={beforeWorkspaceAction}
                onOpen={openInPlace}
                bridge={bridge.data!}
                theme={theme}
                compact={layout.compact}
                active={routeActive && !hidden}
                maximized={maximized === group.id}
                onSelect={selectTab}
                onRunningChange={onRunningChange}
                onClose={closeTabAndFocus}
                onArchive={archiveAgent}
                onCloseGroup={board.groups.length > 1 ? closeGroup : undefined}
                onCloseRelated={closeRelatedTabs}
                onResourceChanged={directory.refetch}
                onAdd={showPicker}
                onMenu={showMenu}
                onMaximize={maximize}
                onAnchor={registerAnchor}
              />
              {!group.tabIds.length && (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                  }}
                >
                  <Icon
                    name="PanelsTopLeft"
                    size={22}
                    color={colors.foregroundMuted}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="添加 Agent、终端或文件"
                    onPress={() => showPicker(group.id)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 5,
                      backgroundColor: colors.surface1,
                    }}
                  >
                    <Text
                      style={{ fontSize: 12, color: colors.foregroundMuted }}
                    >
                      添加 Agent、终端或文件
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
        {board.panes.map((pane) => {
          const group = board.groups.find((group) =>
            group.tabIds.includes(pane.id),
          )!;
          const inspector = groupInspector(board, group);
          const visible =
            (group.activeTabId === pane.id ||
              inspector?.opener.id === pane.id) &&
            (!visibleGroup || visibleGroup === group.id);
          return (
            <PaneFrame
              key={pane.id}
              pane={pane}
              nativeTabId={`${instanceId}:${pane.id}`}
              rect={tabRects.get(pane.id)!}
              bridge={bridge.data!}
              theme={theme}
              visible={visible}
              focused={groupFocus === group.id && visible}
              onFocus={focusTab}
              onClose={closeTab}
              onImport={importFromPane}
              onOpen={openInPlace}
              onOpenSide={openToSide}
              onRetarget={retarget}
              onState={setPaneState}
            />
          );
        })}
        {!visibleGroup &&
          calculatedLayout.dividers.map((divider) => (
            <LayoutDivider
              key={divider.id}
              id={divider.id}
              rect={divider.rect}
              axis={divider.axis}
              boundary={divider.boundary}
              theme={theme}
              onStart={startResize}
              onMove={moveResize}
              onEnd={finishResize}
            />
          ))}
        <TabDragLayer
          area={workarea}
          enabled={routeActive && !picker}
          getGroups={getGroups}
          onDrop={dropOnTarget}
          theme={theme}
        />
      </View>
      {picker && (
        <View style={{ position: "absolute", inset: 0, zIndex: 100 }}>
          <Pressable
            accessibilityLabel="关闭资源选择器"
            onPress={dismiss}
            style={{ position: "absolute", inset: 0 }}
          />
          <View
            role="dialog"
            accessibilityLabel={
              picker.mode === "menu" ? "分屏操作" : "添加资源"
            }
            pointerEvents={picker.bounds ? "auto" : "none"}
            style={{
              // Keep sizing and Escape handling active without painting at the fallback position.
              opacity: picker.bounds ? 1 : 0,
              position: "absolute",
              left: picker.rect.left,
              top: picker.rect.top,
              width: picker.rect.width,
              height: picker.mode === "menu" ? undefined : picker.rect.height,
              maxHeight: picker.rect.height,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface1,
              overflow: "hidden",
            }}
          >
            {pickerContent()}
          </View>
        </View>
      )}
    </>
  ) : (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.foregroundMuted }}>
        {bridge.error ? errorMessage(bridge.error) : "正在接入原生面板…"}
      </Text>
    </View>
  );
  function pickerContent() {
    const selected = board.groups.find((group) => group.id === picker!.groupId),
      active = board.panes.find((pane) => pane.id === selected?.activeTabId);
    return (
      <ResourcePicker
        key={picker!.key}
        bridge={bridge.data!}
        theme={theme}
        directory={directory.data}
        initialMode={picker!.mode}
        defaultWorkspaceId={active?.workspaceId}
        openedAgentIds={openedAgentIds}
        newSplit={picker!.newSplit}
        onDestination={updateDestination}
        onOpen={chooseTarget}
        onTerminal={createTerminal}
        onArchive={archiveAgent}
        onClose={dismiss}
        onRefresh={() => void directory.refetch()}
        busy={busy}
        error={
          notice ?? (directory.error ? errorMessage(directory.error) : null)
        }
        onHeightChange={resizePicker}
        menuActions={menuActions}
      />
    );
  }
  return (
    <View ref={root} testID="split-board" style={{ flex: 1, minHeight: 0 }}>
      {((notice && !picker) ||
        bridge.error ||
        (directory.error && !picker)) && (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
          <Text style={{ color: colors.foreground, fontSize: 12 }}>
            {notice ?? errorMessage(bridge.error ?? directory.error)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重试"
            onPress={() => {
              setNotice(null);
              void bridge.refetch();
              void directory.refetch();
            }}
          >
            <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
              重试
            </Text>
          </Pressable>
        </View>
      )}
      {bridge.data ? (
        <WorkspaceIcons
          bridge={bridge.data}
          hostId={host.id}
          directory={directory.data}
          workspaceIds={iconWorkspaceIds}
        >
          {content}
        </WorkspaceIcons>
      ) : (
        content
      )}
    </View>
  );
}
