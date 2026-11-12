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
import {
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  activateTab,
  addPane,
  moveTab,
  removeTab,
  resourceKey,
  targetSchema,
  type Board,
  type Pane,
  type Target,
} from "../shared/model";
import { bridgeInfoRpc } from "../shared/bridge";
import {
  focusControl,
  loadBoard,
  loadNativeBridge,
  onPageExit,
  saveBoard,
  scheduleFrame,
} from "./web";
import { PaneFrame, TabStrip, type Rect } from "./pane-frame";
import { SplitDivider } from "./split-divider";
import { TabDragLayer } from "./tab-drag-layer";
import { NativeKeyboard } from "./native-pane";
import {
  ResourcePicker,
  type PaneMenuAction,
  type PickerMode,
} from "./resource-picker";
import { WorkspaceIcons } from "./workspace-icon";
import { useDirectory, workspaceLabel } from "./directory";
import type { NativeBridge } from "./native-types";

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
  const [focusedGroup, setFocusedGroup] = useState(board.groups[0].id);
  const [maximized, setMaximized] = useState<string | null>(null);
  const [routeActive, setRouteActive] = useState(true);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [notice, setNotice] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [viewport, setViewport] = useState({ width: 1000, height: 700 });
  const root = useRef<View>(null),
    workarea = useRef<View>(null),
    anchors = useRef(new Map<string, View>());
  const pendingCloses = useRef(new Set<string>()),
    terminalCreation = useRef(false),
    cancelFrame = useRef<(() => void) | null>(null),
    pendingRatio = useRef<number | null>(null),
    startRatio = useRef(0.5);
  const setBoard = useCallback((update: Board | ((value: Board) => Board)) => {
    const next =
      typeof update === "function" ? update(boardRef.current) : update;
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
  const directory = useDirectory(host.id, routeActive, picker !== null),
    directoryRef = useRef(directory.data);
  directoryRef.current = directory.data;
  const pickerRef = useRef(picker);
  pickerRef.current = picker;
  const groupFocus = board.groups.some((group) => group.id === focusedGroup)
    ? focusedGroup
    : board.groups[0].id;
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
      const group = groupOf(tabId);
      if (group) setFocusedGroup(group.id);
    },
    [groupOf],
  );
  const selectTab = useCallback(
    (tabId: string) => {
      const group = groupOf(tabId);
      if (!group) return;
      setBoard((current) => activateTab(current, tabId));
      setFocusedGroup(group.id);
      setMaximized((current) => (current ? group.id : null));
    },
    [groupOf, setBoard],
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
            ? { ...next, direction: splitDirection }
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
    },
    [groupOf, openTarget],
  );
  const openInPlace = useCallback(
    (tabId: string, target: Target) => openFromPane(tabId, target),
    [openFromPane],
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
  const closeTab = useCallback(
    async (tabId: string) => {
      const pane = boardRef.current.panes.find((item) => item.id === tabId);
      if (!pane || pendingCloses.current.has(tabId)) return;
      pendingCloses.current.add(tabId);
      try {
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
        setBoard((current) => removeTab(current, tabId));
      } catch (error) {
        setNotice(errorMessage(error));
      } finally {
        pendingCloses.current.delete(tabId);
      }
    },
    [bridge.data, instanceId, setBoard],
  );
  const closeCurrentTab = useCallback(() => {
    const group = boardRef.current.groups.find(
      (item) => item.id === (visibleGroup ?? groupFocus),
    );
    const tabId = group?.activeTabId;
    if (!tabId) return;
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
  }, [closeTab, groupFocus, visibleGroup]);
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
          .terminals.create({ name: "Split terminal" });
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
  const finishDrag = useCallback(() => {
    cancelFrame.current?.();
    cancelFrame.current = null;
    const ratio = pendingRatio.current;
    pendingRatio.current = null;
    if (ratio !== null)
      setBoard((current) =>
        current.ratio === ratio ? current : { ...current, ratio },
      );
  }, [setBoard]);
  const drag = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          cancelFrame.current?.();
          cancelFrame.current = null;
          pendingRatio.current = null;
          startRatio.current = boardRef.current.ratio;
        },
        onPanResponderMove: (_event, gesture) => {
          const current = boardRef.current;
          const delta =
            current.direction === "row"
              ? gesture.dx / viewport.width
              : gesture.dy /
                (viewport.height / Math.ceil(current.groups.length / 2));
          pendingRatio.current = Math.max(
            0.2,
            Math.min(0.8, startRatio.current + delta),
          );
          if (!cancelFrame.current)
            cancelFrame.current = scheduleFrame(() => {
              cancelFrame.current = null;
              const ratio = pendingRatio.current;
              if (ratio !== null)
                setBoard((value) =>
                  value.ratio === ratio ? value : { ...value, ratio },
                );
            });
        },
        onPanResponderRelease: finishDrag,
        onPanResponderTerminate: finishDrag,
      }),
    [viewport, finishDrag, setBoard],
  );
  const geometry = useMemo(
    () =>
      new Map(
        board.groups.map((group, index) => {
          if (visibleGroup)
            return [
              group.id,
              {
                left: 0,
                top: 0,
                width: viewport.width,
                height: viewport.height,
                separator: false,
              },
            ];
          const rows = Math.ceil(board.groups.length / 2),
            odd = index % 2 === 1,
            unpaired = index === board.groups.length - 1 && !odd;
          const share = unpaired ? 1 : odd ? 1 - board.ratio : board.ratio;
          const rect =
            board.direction === "row"
              ? {
                  left: odd ? viewport.width * board.ratio : 0,
                  top: (Math.floor(index / 2) * viewport.height) / rows,
                  width: viewport.width * share,
                  height: viewport.height / rows,
                }
              : {
                  left: 0,
                  top:
                    ((Math.floor(index / 2) + (odd ? board.ratio : 0)) *
                      viewport.height) /
                    rows,
                  width: viewport.width,
                  height: (viewport.height * share) / rows,
                };
          return [group.id, { ...rect, separator: odd }];
        }),
      ),
    [board.groups, board.direction, board.ratio, viewport, visibleGroup],
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
          const horizontal = board.direction === "row",
            offset = rect.separator ? 4 : 0;
          return [
            pane.id,
            {
              left: rect.left + (horizontal ? offset : 0),
              top: rect.top + barHeight + (horizontal ? 0 : offset),
              width: Math.max(0, rect.width - (horizontal ? offset : 0)),
              height: Math.max(
                0,
                rect.height - barHeight - (horizontal ? 0 : offset),
              ),
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
  const menuActions = useMemo<PaneMenuAction[]>(() => {
    if (!picker) return [];
    const group = board.groups.find((group) => group.id === picker.groupId);
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
    const actions: PaneMenuAction[] = [
      {
        label: "新增分屏…",
        icon: "Columns2",
        run: () => showPicker(group.id, null, "agent", true),
      },
    ];
    if (pane) {
      const index = group.tabIds.indexOf(pane.id);
      if (index > 0)
        actions.push({
          label: "将当前 Tab 向左移动",
          icon: "ArrowLeft",
          run: run(() => dropTab(pane.id, group.id, index - 1)),
        });
      if (index < group.tabIds.length - 1)
        actions.push({
          label: "将当前 Tab 向右移动",
          icon: "ArrowRight",
          run: run(() => dropTab(pane.id, group.id, index + 1)),
        });
      actions.push({
        label: "将当前 Tab 移到新分屏",
        icon: "PanelRightOpen",
        run: run(() => {
          const next = `group-${id()}`;
          setBoard((current) => moveTab(current, pane.id, next, true));
          setFocusedGroup(next);
          setMaximized(null);
        }),
      });
      for (const destination of board.groups.filter(
        (item) => item.id !== group.id,
      )) {
        const active = board.panes.find(
          (pane) => pane.id === destination.activeTabId,
        );
        actions.push({
          label: `移到「${active ? titleFor(active.target) : "空分屏"}」`,
          icon: "ArrowRightToLine",
          run: run(() => {
            setBoard((current) => moveTab(current, pane.id, destination.id));
            setFocusedGroup(destination.id);
            setMaximized((current) => (current ? destination.id : null));
          }),
        });
      }
    }
    actions.push({
      label: board.direction === "row" ? "切换为上下排列" : "切换为左右排列",
      icon: board.direction === "row" ? "Rows2" : "Columns2",
      run: run(() =>
        setBoard((current) => ({
          ...current,
          direction: current.direction === "row" ? "column" : "row",
        })),
      ),
    });
    actions.push({
      label: "均分",
      icon: "Equal",
      run: run(() =>
        setBoard((current) =>
          current.ratio === 0.5 ? current : { ...current, ratio: 0.5 },
        ),
      ),
    });
    if (pane) {
      actions.push({
        label: "在原 workspace 打开",
        icon: "ExternalLink",
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
        run: run(() => void closeTab(pane.id)),
      });
    } else if (board.groups.length > 1)
      actions.push({
        label: "关闭空分屏",
        icon: "X",
        run: run(() => {
          setBoard((current) => ({
            ...current,
            groups: current.groups.filter((item) => item.id !== group.id),
          }));
          setMaximized(null);
        }),
      });
    return actions;
  }, [
    picker?.groupId,
    board.groups,
    board.panes,
    board.direction,
    showPicker,
    titleFor,
    setBoard,
    navigation,
    closeTab,
    dropTab,
  ]);
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
          此分屏需要 Paseo 0.13.0 以上的桌面版或 Web 版。
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
            horizontal = board.direction === "row",
            offset = rect.separator ? 4 : 0;
          return (
            <View
              key={group.id}
              testID={`split-group-${group.id}`}
              style={{
                position: "absolute",
                left: rect.left + (horizontal ? offset : 0),
                top: rect.top + (horizontal ? 0 : offset),
                width: Math.max(0, rect.width - (horizontal ? offset : 0)),
                height: Math.max(0, rect.height - (horizontal ? 0 : offset)),
                display: hidden ? "none" : "flex",
              }}
            >
              <TabStrip
                group={group}
                panes={groupPanes.get(group.id)!}
                agents={directory.data?.agents ?? []}
                bridge={bridge.data!}
                theme={theme}
                compact={layout.compact}
                active={routeActive && !hidden}
                maximized={maximized === group.id}
                onSelect={selectTab}
                onClose={closeTab}
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
          const visible =
            group.activeTabId === pane.id &&
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
          board.groups.map((group) => {
            const rect = geometry.get(group.id)!;
            return rect.separator ? (
              <SplitDivider
                key={`divider-${group.id}`}
                id={group.id}
                rect={rect}
                direction={board.direction}
                theme={theme}
                handlers={drag.panHandlers}
              />
            ) : null;
          })}
        <TabDragLayer
          area={workarea}
          enabled={routeActive && picker === null}
          getGroups={getGroups}
          onDrop={dropTab}
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
            style={{
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
