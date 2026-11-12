import { Platform, type ScrollView } from "react-native";
import {
  restoreBoard,
  emptyBoard,
  type Board,
  type TabGroup,
} from "../shared/model";
import type { NativeBridge } from "./native-types";
import {
  syncNativeComposer,
  type NativeComposerProps,
} from "./composer-draft-sync";
import type { ComponentType } from "react";
import type { PluginPanelRequest } from "./workspace-types";
import {
  installForkTabNavigation,
  type ForkTabRequest,
} from "./fork-navigation";
import {
  restoreToolbarPreferences,
  chooseFlyoutSide,
  type FlyoutPositionInput,
  type ToolbarPreferences,
} from "../shared/toolbar";
import {
  canSplitTab,
  splitDropPosition,
  type SplitEdge,
} from "../shared/layout";
import { matchesShortcutStroke, type ShortcutEvent } from "../shared/shortcuts";
import {
  nativeExports,
  optionalNativeExports,
  resolveNativeModules,
} from "../shared/bridge";

// Desktop/Web experiment. DOM globals are used only after the platform gate.
declare const window: {
  __r?: (id: number) => Record<string, unknown>;
  localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(id: number): void;
  addEventListener(event: string, callback: () => void): void;
  removeEventListener(event: string, callback: () => void): void;
  addEventListener(
    event: "keydown",
    callback: (event: ShortcutInput) => void,
    capture: boolean,
  ): void;
  removeEventListener(
    event: "keydown",
    callback: (event: ShortcutInput) => void,
    capture: boolean,
  ): void;
};
declare const navigator: { platform: string };
interface WebElement {
  parentElement?: WebElement | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  matches(selector: string): boolean;
  closest(selector: string): WebElement | null;
  focus(options?: { preventScroll?: boolean }): void;
  scrollIntoView(options: { block: string; inline: string }): void;
  querySelectorAll(selector: string): ArrayLike<WebElement>;
  getBoundingClientRect(): {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
}
interface ShortcutInput extends ShortcutEvent {
  defaultPrevented: boolean;
  target?: WebElement;
  preventDefault(): void;
  stopPropagation(): void;
}
declare const document: {
  head: { appendChild(element: CursorSheet): void };
  createElement(tag: "style"): CursorSheet;
  scripts: ArrayLike<{ src: string }>;
  activeElement?: WebElement;
  querySelector(selector: string): WebElement | null;
  querySelectorAll(selector: string): ArrayLike<WebElement>;
  addEventListener(
    type: string,
    listener: (event: TabPointerEvent) => void,
    capture: boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: TabPointerEvent) => void,
    capture: boolean,
  ): void;
};
interface CursorSheet {
  textContent: string;
  remove(): void;
}
declare function fetch(
  url: string,
): Promise<{ ok: boolean; text(): Promise<string> }>;
type BridgeInfo = { bundleName: string; moduleIds: Record<string, number> };
let bridgePromise: Promise<NativeBridge> | undefined;
let composerPatch:
  | {
      module: Record<string, unknown>;
      original: ComponentType<NativeComposerProps>;
      wrapped: ComponentType<NativeComposerProps>;
      dispose(): void;
    }
  | undefined;

export function disposeNativeComposerSync(): void {
  const patch = composerPatch;
  if (patch) {
    if (patch.module.Composer === patch.wrapped)
      patch.module.Composer = patch.original;
    patch.dispose();
  }
  composerPatch = undefined;
  bridgePromise = undefined;
}

export async function loadNativeBridge(
  fallback: () => Promise<BridgeInfo>,
): Promise<NativeBridge> {
  if (Platform.OS !== "web")
    throw new Error("此原生面板嵌入 Demo 目前支持桌面版和 Web 版。");
  if (bridgePromise) return bridgePromise;
  bridgePromise = (async () => {
    if (typeof window.__r !== "function")
      throw new Error("此客户端未提供实验所需的运行时入口。");
    const url = Array.from(document.scripts)
      .map((script) => script.src)
      .find((value) => /\/_expo\/static\/js\/web\/index-[^/]+\.js/.test(value));
    if (!url) throw new Error("无法识别当前 Paseo 构建，已停止加载原生面板。");
    const bundleName = url.split("/").pop()!.split("?")[0];
    let info: BridgeInfo;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Cannot read current bundle");
      const source = await response.text();
      info = { bundleName, moduleIds: resolveNativeModules(source) };
    } catch {
      info = await fallback();
      if (info.bundleName !== bundleName)
        throw new Error("客户端与本机原生桥接构建不匹配，已停止加载。");
    }
    const exports = Object.fromEntries(
      [
        ...nativeExports,
        ...optionalNativeExports.filter(
          (name) => info.moduleIds[name] !== undefined,
        ),
      ].map((name) => {
        const value = window.__r!(info.moduleIds[name])[name];
        if (
          typeof value !== "function" &&
          !(value && typeof value === "object" && "$$typeof" in value)
        )
          throw new Error(`原生入口 ${name} 已变化，已停止加载。`);
        return [name, value];
      }),
    );
    (exports.ensurePanelsRegistered as () => void)();
    const queryClient = window.__r(info.moduleIds.queryClient).queryClient;
    if (
      !queryClient ||
      typeof (queryClient as { getQueryCache?: unknown }).getQueryCache !==
        "function"
    )
      throw new Error("原生查询缓存入口已变化，已停止加载。");
    const pluginButtonStore = window.__r(
      info.moduleIds.pluginButtonStore,
    ).pluginButtonStore;
    if (
      !pluginButtonStore ||
      typeof (pluginButtonStore as { getSnapshot?: unknown }).getSnapshot !==
        "function"
    )
      throw new Error("原生扩展按钮入口已变化，已停止加载。");
    const pane = window.__r(info.moduleIds.WorkspacePaneContent);
    if (typeof pane.buildWorkspacePaneContentModel !== "function")
      throw new Error("原生面板构建入口已变化。");
    const getPanel = exports.getPanelRegistration as (kind: string) => unknown;
    // Both Deck and retained workspace panes render this native export. Keep
    // their editors in sync through the existing draft source, without writing
    // back to the store or adding hooks to an already mounted host component.
    if (!composerPatch && info.moduleIds.Composer !== undefined) {
      const module = window.__r(info.moduleIds.Composer);
      const original = module.Composer as ComponentType<NativeComposerProps>;
      const { Component: wrapped, dispose } = syncNativeComposer(original);
      module.Composer = wrapped;
      composerPatch = { module, original, wrapped, dispose };
    }
    return {
      ...info,
      ...exports,
      queryClient,
      pluginButtonStore,
      buildWorkspacePaneContentModel: pane.buildWorkspacePaneContentModel,
      hasPanel: (kind: string) => Boolean(getPanel(kind)),
    } as unknown as NativeBridge;
  })().catch((error) => {
    bridgePromise = undefined;
    throw error;
  });
  return bridgePromise;
}
export function loadBoard(serverId: string): Board {
  if (Platform.OS !== "web") return emptyBoard;
  try {
    const raw = window.localStorage.getItem(`paseo-deck:board:${serverId}`);
    return restoreBoard(raw ? JSON.parse(raw) : null) ?? emptyBoard;
  } catch {
    return emptyBoard;
  }
}

// The sidebar outlives the Deck screen. Publish layout edits at commit time,
// before the debounced disk save, so it only observes Tabs still in this Deck.
const boardSnapshots = new Map<string, Board>();
const boardListeners = new Set<() => void>();
export function readBoardSnapshot(serverId: string): Board {
  let board = boardSnapshots.get(serverId);
  if (!board) {
    board = loadBoard(serverId);
    boardSnapshots.set(serverId, board);
  }
  return board;
}
export function publishBoardSnapshot(serverId: string, board: Board): void {
  if (boardSnapshots.get(serverId) === board) return;
  boardSnapshots.set(serverId, board);
  for (const listener of boardListeners) listener();
}
export function subscribeBoardSnapshot(listener: () => void): () => void {
  boardListeners.add(listener);
  return () => {
    boardListeners.delete(listener);
  };
}

export function saveBoard(serverId: string, board: Board): void {
  if (Platform.OS !== "web") return;
  window.localStorage.setItem(
    `paseo-deck:board:${serverId}`,
    JSON.stringify(board),
  );
}

const toolbarPreferences = new Map<string, ToolbarPreferences>();
const toolbarListeners = new Set<() => void>();
export function readToolbarPreferences(serverId: string): ToolbarPreferences {
  let preferences = toolbarPreferences.get(serverId);
  if (!preferences) {
    let value: unknown;
    if (Platform.OS === "web") {
      try {
        const raw = window.localStorage.getItem(
          `paseo-deck:toolbar:${serverId}`,
        );
        value = raw ? JSON.parse(raw) : null;
      } catch {
        // A client without storage can still use the default toolbar.
      }
    }
    preferences = restoreToolbarPreferences(value);
    toolbarPreferences.set(serverId, preferences);
  }
  return preferences;
}
export function subscribeToolbarPreferences(listener: () => void): () => void {
  toolbarListeners.add(listener);
  return () => toolbarListeners.delete(listener);
}
export function writeToolbarPreferences(
  serverId: string,
  pinned: string[] | null,
): void {
  const preferences: ToolbarPreferences = {
    version: 1,
    pinned: pinned === null ? null : [...new Set(pinned)],
  };
  if (Platform.OS === "web")
    window.localStorage.setItem(
      `paseo-deck:toolbar:${serverId}`,
      JSON.stringify(preferences),
    );
  toolbarPreferences.set(serverId, preferences);
  for (const listener of toolbarListeners) listener();
}

// Paseo's current menu clamps a right flyout against the viewport. Scope the
// horizontal flip to our own menu anchors; every other native menu delegates.
let flyoutPatch:
  | {
      module: Record<string, unknown>;
      original: (input: FlyoutPositionInput) => unknown;
      wrapped: (input: FlyoutPositionInput) => unknown;
      owners: number;
      sheet: CursorSheet;
    }
  | undefined;
export function installSplitMenuPlacement(bridge: NativeBridge): () => void {
  if (Platform.OS !== "web" || !window.__r) return () => {};
  if (!flyoutPatch) {
    const module = window.__r(bridge.moduleIds.computePosition);
    const original = module.computePosition as (
      input: FlyoutPositionInput,
    ) => unknown;
    const wrapped = (input: FlyoutPositionInput) => {
      if (input.placement !== "right") return original(input);
      const anchor = input.triggerRect;
      const item = Array.from(
        document.querySelectorAll(
          '[data-testid^="split-more-"] [data-menu-item="true"]',
        ),
      ).find((element) => {
        const rect = element.parentElement?.getBoundingClientRect();
        return (
          rect &&
          rect.width > 0 &&
          Math.abs(rect.left - anchor.x) < 1 &&
          Math.abs(rect.top - anchor.y) < 1 &&
          Math.abs(rect.width - anchor.width) < 1 &&
          Math.abs(rect.height - anchor.height) < 1
        );
      });
      if (!item) return original(input);
      const placement = { ...input, offset: 8 };
      const side = chooseFlyoutSide(placement);
      item.setAttribute("data-split-flyout-side", side);
      return original({ ...placement, placement: side });
    };
    const sheet = document.createElement("style");
    sheet.textContent =
      '[data-split-flyout-side="left"] > div:last-child svg:last-child { transform: rotate(180deg); }';
    document.head.appendChild(sheet);
    module.computePosition = wrapped;
    flyoutPatch = { module, original, wrapped, owners: 0, sheet };
  }
  const patch = flyoutPatch;
  patch.owners++;
  return () => {
    if (--patch.owners) return;
    if (patch.module.computePosition === patch.wrapped)
      patch.module.computePosition = patch.original;
    patch.sheet.remove();
    if (flyoutPatch === patch) flyoutPatch = undefined;
  };
}

export function scheduleFrame(callback: () => void): () => void {
  if (Platform.OS !== "web") return () => {};
  const id = window.requestAnimationFrame(callback);
  return () => window.cancelAnimationFrame(id);
}

export function onPageExit(callback: () => void): () => void {
  if (Platform.OS !== "web") return () => {};
  window.addEventListener("pagehide", callback);
  return () => window.removeEventListener("pagehide", callback);
}

// Plugin routes are excluded by Paseo's workspace shortcut router. Reuse its
// configured chord and action dispatcher, so native Composer handles focus.
export function onNativeActionShortcut(
  chord: string[][],
  blocked: () => boolean,
  dispatch: (event: ShortcutEvent) => boolean,
): () => void {
  if (Platform.OS !== "web") return () => {};
  if (
    !Array.isArray(chord) ||
    !chord.length ||
    chord.some(
      (stroke) =>
        !Array.isArray(stroke) || stroke.some((key) => typeof key !== "string"),
    )
  )
    return () => {};
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  let step = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reset = () => {
    step = 0;
    clearTimeout(timer);
  };
  const handle = (event: ShortcutInput) => {
    if (event.defaultPrevented) return;
    if (["Meta", "Control", "Shift", "Alt"].includes(event.key)) return;
    if (blocked()) {
      reset();
      return;
    }
    if (!matchesShortcutStroke(event, chord[step] ?? [], isMac)) {
      reset();
      return;
    }
    if (++step === chord.length) {
      reset();
      if (dispatch(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    } else {
      event.preventDefault();
      clearTimeout(timer);
      timer = setTimeout(reset, 1000);
    }
  };
  window.addEventListener("keydown", handle, true);
  return () => {
    reset();
    window.removeEventListener("keydown", handle, true);
  };
}

export function keyboardFocusVisible(): boolean {
  if (Platform.OS !== "web") return true;
  return Boolean(document.activeElement?.matches(":focus-visible"));
}
export function focusControl(testId: string): void {
  if (Platform.OS !== "web") return;
  const element = visibleControl(testId);
  element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  element?.focus({ preventScroll: true });
}
export function describeControl(testId: string, title: string): void {
  if (Platform.OS !== "web") return;
  for (const element of Array.from(
    document.querySelectorAll(`[data-testid="${testId}"]`),
  ))
    element.setAttribute("title", title);
}

interface TabWheelEvent {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
}
interface TabScrollElement extends WebElement {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  addEventListener(
    type: "wheel",
    listener: (event: TabWheelEvent) => void,
    options: { passive: boolean },
  ): void;
  removeEventListener(
    type: "wheel",
    listener: (event: TabWheelEvent) => void,
  ): void;
}

export function onTabScroll(
  scrollView: ScrollView | null,
  groupId: string,
  thumbColor: string,
  trackColor: string,
  foregroundColor: string,
): () => void {
  if (Platform.OS !== "web") return () => {};
  const selector = `[data-testid="split-tabs-${groupId}"]`;
  // Retained route trees can share test IDs. Bind to this ScrollView instance.
  const strip = scrollView?.getScrollableNode() as TabScrollElement | null;
  if (!strip) return () => {};
  // An explicit track keeps overflowing Tabs discoverable on desktop systems
  // that otherwise hide their overlay scrollbars until a gesture starts.
  const sheet = document.createElement("style");
  const subtleThumbColor = `color-mix(in srgb, ${thumbColor} 35%, ${trackColor})`;
  const close = `${selector} [data-testid^="split-close-tab-"]`;
  sheet.textContent = `
    ${selector} { scrollbar-width: auto; scrollbar-color: auto; }
    ${selector}::-webkit-scrollbar { height: 3px; }
    ${selector}::-webkit-scrollbar-track { background: ${trackColor}; }
    ${selector}::-webkit-scrollbar-thumb {
      background: ${subtleThumbColor};
      border-radius: 999px;
    }
    @supports not selector(::-webkit-scrollbar) {
      ${selector} { scrollbar-width: thin; scrollbar-color: ${subtleThumbColor} ${trackColor}; }
    }
    ${close}::before {
      content: "";
      position: absolute;
      width: calc(100% - 2px);
      aspect-ratio: 1;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      border-radius: 4px;
      background: ${foregroundColor};
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease-out;
    }
    ${close}:hover::before { opacity: 0.1; }
    ${close}:active::before { opacity: 0.18; }
    ${close}:focus-visible {
      outline: 1px solid ${foregroundColor};
      outline-offset: -2px;
    }
    ${close} svg, ${close} svg * { transition: stroke 120ms ease-out; }
    ${close}:hover svg, ${close}:hover svg *,
    ${close}:focus-visible svg, ${close}:focus-visible svg * { stroke: ${foregroundColor}; }
    @media (prefers-reduced-motion: reduce) {
      ${close}::before, ${close} svg, ${close} svg * { transition: none; }
    }
  `;
  document.head.appendChild(sheet);
  const wheel = (event: TabWheelEvent) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      strip.scrollWidth <= strip.clientWidth ||
      Math.abs(event.deltaX) >= Math.abs(event.deltaY)
    )
      return;
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? strip.clientWidth
          : 1;
    const before = strip.scrollLeft;
    strip.scrollLeft += event.deltaY * unit;
    if (strip.scrollLeft !== before) event.preventDefault();
  };
  strip.addEventListener("wheel", wheel, { passive: false });
  return () => {
    strip.removeEventListener("wheel", wheel);
    sheet.remove();
  };
}

type DropRect = {
  groupId: string;
  left: number;
  top: number;
  width: number;
  height: number;
};
export type TabDropTarget = DropRect &
  (
    | { kind: "tabs"; index: number; markerLeft: number }
    | { kind: "merge" }
    | { kind: "split"; edge: SplitEdge }
  );
export type TabDragPreview = {
  tabId: string;
  title: string;
  left: number;
  top: number;
  target: TabDropTarget | null;
};
interface TabPointerEvent {
  button: number;
  buttons: number;
  pointerId: number;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
  key?: string;
  target?: WebElement;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}
interface DragElement extends WebElement {
  textContent: string | null;
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  style: {
    getPropertyValue(name: string): string;
    setProperty(name: string, value: string): void;
  };
  querySelector(selector: string): DragElement | null;
  addEventListener(
    type: string,
    listener: (event: TabPointerEvent) => void,
    capture: boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: TabPointerEvent) => void,
    capture: boolean,
  ): void;
  setPointerCapture(id: number): void;
  hasPointerCapture(id: number): boolean;
  releasePointerCapture(id: number): void;
}

// Use pointer capture rather than HTML drag data: only this board can move its
// Tabs, touch/pen work too, and native editors never receive an accidental drop.
export function onTabDrag(
  view: unknown,
  getGroups: () => TabGroup[],
  preview: (value: TabDragPreview | null) => void,
  drop: (tabId: string, target: TabDropTarget) => void,
): () => void {
  if (Platform.OS !== "web" || !view) return () => {};
  const area = view as DragElement;
  if (typeof area.addEventListener !== "function") return () => {};
  let current: {
    tabId: string;
    title: string;
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    started: boolean;
    item: DragElement;
    opacity: string;
  } | null = null;
  let cancelFrame: (() => void) | null = null;
  let cursorSheet: CursorSheet | null = null;
  let suppressClick = false;
  const userSelect = area.style.getPropertyValue("user-select");
  const locate = (
    scroll: boolean,
  ): { target: TabDropTarget | null; scrolled: boolean } => {
    if (!current) return { target: null, scrolled: false };
    const origin = area.getBoundingClientRect();
    const groups = getGroups();
    for (const group of groups) {
      const element = area.querySelector(
        `[data-testid="split-group-${group.id}"]`,
      );
      const bar = element?.querySelector('[data-testid="split-window-bar"]');
      if (!element || !bar) continue;
      const bounds = element.getBoundingClientRect();
      const header = bar.getBoundingClientRect();
      const { x, y } = current;
      if (
        !bounds.width ||
        !bounds.height ||
        x < bounds.left ||
        x > bounds.right ||
        y < header.top ||
        y > bounds.bottom
      )
        continue;
      if (y > header.bottom) {
        const position = group.tabIds.length
          ? splitDropPosition(
              bounds.width,
              bounds.bottom - header.bottom,
              x - bounds.left,
              y - header.bottom,
            )
          : "center";
        const rect = {
          groupId: group.id,
          left: bounds.left - origin.left,
          top: bounds.top - origin.top,
          width: bounds.width,
          height: bounds.height,
        };
        if (position === "center") {
          return {
            target: group.tabIds.includes(current.tabId)
              ? null
              : { ...rect, kind: "merge" },
            scrolled: false,
          };
        }
        if (!position || !canSplitTab(groups, current.tabId, group.id))
          return { target: null, scrolled: false };
        const horizontal = position === "left" || position === "right";
        return {
          target: {
            ...rect,
            kind: "split",
            edge: position,
            left: rect.left + (position === "right" ? rect.width / 2 : 0),
            top: rect.top + (position === "bottom" ? rect.height / 2 : 0),
            width: horizontal ? rect.width / 2 : rect.width,
            height: horizontal ? rect.height : rect.height / 2,
          },
          scrolled: false,
        };
      }
      const strip = element.querySelector(
        `[data-testid="split-tabs-${group.id}"]`,
      );
      const stripBounds = strip?.getBoundingClientRect();
      let scrolled = false;
      if (
        scroll &&
        strip &&
        stripBounds &&
        strip.scrollWidth > strip.clientWidth &&
        y <= header.bottom &&
        x >= stripBounds.left &&
        x <= stripBounds.right
      ) {
        const before = strip.scrollLeft;
        const delta =
          x < stripBounds.left + 24 ? -10 : x > stripBounds.right - 24 ? 10 : 0;
        strip.scrollLeft += delta;
        scrolled = strip.scrollLeft !== before;
      }
      const ids = group.tabIds.filter((id) => id !== current!.tabId);
      let index = ids.length;
      let marker = stripBounds?.left ?? header.left + 6;
      for (let i = 0; i < ids.length; i++) {
        const tab = element.querySelector(
          `[data-testid="split-tab-item-${ids[i]}"]`,
        );
        if (!tab) continue;
        const rect = tab.getBoundingClientRect();
        if (x < rect.left + rect.width / 2) {
          index = i;
          marker = rect.left - 1;
          break;
        }
        marker = rect.right + 1;
      }
      const min = stripBounds?.width ? stripBounds.left : header.left + 6;
      const max = stripBounds?.width ? stripBounds.right : header.right - 6;
      return {
        target: {
          kind: "tabs",
          groupId: group.id,
          index,
          left: header.left - origin.left,
          top: header.top - origin.top,
          width: header.width,
          height: header.height,
          markerLeft: Math.max(min, Math.min(max, marker)) - origin.left,
        },
        scrolled,
      };
    }
    return { target: null, scrolled: false };
  };
  const queue = () => {
    if (cancelFrame) return;
    cancelFrame = scheduleFrame(() => {
      cancelFrame = null;
      if (!current?.started) return;
      const origin = area.getBoundingClientRect();
      const { target, scrolled } = locate(true);
      preview({
        tabId: current.tabId,
        title: current.title,
        left: Math.max(
          4,
          Math.min(origin.width - 180, current.x - origin.left + 12),
        ),
        top: Math.max(
          4,
          Math.min(origin.height - 32, current.y - origin.top + 14),
        ),
        target,
      });
      if (scrolled) queue();
    });
  };
  const cancel = () => {
    cancelFrame?.();
    cancelFrame = null;
    cursorSheet?.remove();
    cursorSheet = null;
    const previous = current;
    current = null;
    if (!previous) return;
    if (previous.started) {
      previous.item.style.setProperty("opacity", previous.opacity);
      area.style.setProperty("user-select", userSelect);
      if (area.hasPointerCapture(previous.pointerId))
        area.releasePointerCapture(previous.pointerId);
      preview(null);
    }
  };
  const down = (event: TabPointerEvent) => {
    if (!event.isPrimary) {
      cancel();
      return;
    }
    if (event.button !== 0) return;
    suppressClick = false;
    const tab = event.target?.closest(
      '[role="tab"][data-testid^="split-tab-"]',
    ) as DragElement | null;
    const tabId = tab?.getAttribute("data-testid")?.slice("split-tab-".length);
    if (!tabId || !getGroups().some((group) => group.tabIds.includes(tabId)))
      return;
    const item = area.querySelector(`[data-testid="split-tab-item-${tabId}"]`);
    if (!item) return;
    current = {
      tabId,
      title: tab?.getAttribute("aria-label")?.split(" · ")[0] || "Tab",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      started: false,
      item,
      opacity: item.style.getPropertyValue("opacity"),
    };
  };
  const move = (event: TabPointerEvent) => {
    if (!current || current.pointerId !== event.pointerId) return;
    if (!event.buttons) {
      cancel();
      return;
    }
    current.x = event.clientX;
    current.y = event.clientY;
    if (!current.started) {
      if (
        Math.hypot(current.x - current.startX, current.y - current.startY) < 6
      )
        return;
      current.started = true;
      // Preserve the normal click cursor until the drag threshold is crossed.
      // Override descendants too, including native editors and other Tab bars.
      cursorSheet = document.createElement("style");
      cursorSheet.textContent = "* { cursor: grabbing !important; }";
      document.head.appendChild(cursorSheet);
      current.item.style.setProperty("opacity", "0.4");
      area.style.setProperty("user-select", "none");
      area.setPointerCapture(current.pointerId);
    }
    event.preventDefault();
    queue();
  };
  const up = (event: TabPointerEvent) => {
    if (!current || current.pointerId !== event.pointerId) return;
    const { tabId, started } = current;
    current.x = event.clientX;
    current.y = event.clientY;
    const target = started ? locate(false).target : null;
    suppressClick = started;
    cancel();
    if (target) drop(tabId, target);
  };
  const interrupted = (event: TabPointerEvent) => {
    if (current?.pointerId === event.pointerId) cancel();
  };
  const lostCapture = (event: TabPointerEvent) => {
    // A touch Tab can lose its implicit capture when capture moves to the area.
    if (event.target === area) interrupted(event);
  };
  const key = (event: TabPointerEvent) => {
    suppressClick = false;
    if (event.key !== "Escape" || !current) return;
    if (current.started) {
      suppressClick = true;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    cancel();
  };
  const click = (event: TabPointerEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const nativeDrag = (event: TabPointerEvent) => {
    if (current) event.preventDefault();
  };
  area.addEventListener("pointerdown", down, true);
  area.addEventListener("click", click, true);
  area.addEventListener("dragstart", nativeDrag, true);
  area.addEventListener("lostpointercapture", lostCapture, true);
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerup", up, true);
  document.addEventListener("pointercancel", interrupted, true);
  document.addEventListener("keydown", key, true);
  window.addEventListener("blur", cancel);
  return () => {
    cancel();
    area.removeEventListener("pointerdown", down, true);
    area.removeEventListener("click", click, true);
    area.removeEventListener("dragstart", nativeDrag, true);
    area.removeEventListener("lostpointercapture", lostCapture, true);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("pointercancel", interrupted, true);
    document.removeEventListener("keydown", key, true);
    window.removeEventListener("blur", cancel);
  };
}

export function onTabKeys(
  groupId: string,
  ids: string[],
  select: (id: string) => void,
): () => void {
  if (Platform.OS !== "web") return () => {};
  const handle = (event: ShortcutInput) => {
    if (
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const target = event.target;
    if (
      target?.getAttribute("role") !== "tab" ||
      !target.closest(`[data-testid="split-tabs-${groupId}"]`)
    )
      return;
    const index = ids.findIndex(
      (id) => `split-tab-${id}` === target.getAttribute("data-testid"),
    );
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % ids.length
        : event.key === "ArrowLeft"
          ? (index - 1 + ids.length) % ids.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? ids.length - 1
              : -1;
    if (next < 0 || !ids[next]) return;
    event.preventDefault();
    event.stopPropagation();
    select(ids[next]);
    focusControl(`split-tab-${ids[next]}`);
  };
  window.addEventListener("keydown", handle, true);
  return () => window.removeEventListener("keydown", handle, true);
}
export function onTabContextMenuKeys(
  tabId: string,
  open: (rect: { x: number; y: number; width: number; height: number }) => void,
  dismiss?: () => void,
): () => void {
  if (Platform.OS !== "web") return () => {};
  const handle = (event: ShortcutInput) => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey)
      return;
    if (event.key === "Escape" && dismiss) {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      return;
    }
    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey))
      return;
    const tab = event.target?.closest(
      `[data-testid="split-tab-item-${tabId}"]`,
    );
    if (!tab) return;
    const rect = tab.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    open({ x: rect.left, y: rect.bottom, width: 0, height: 0 });
  };
  window.addEventListener("keydown", handle, true);
  return () => window.removeEventListener("keydown", handle, true);
}
export function onPickerKeys(
  callback: (key: string) => boolean,
  close: () => void,
): () => void {
  if (Platform.OS !== "web") return () => {};
  const handle = (event: ShortcutInput) => {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      const root = document.querySelector(
        '[data-testid="split-resource-picker"]',
      );
      const controls = Array.from(
        root?.querySelectorAll(
          'input,textarea,[role="button"],[role="tab"],[role="radio"]',
        ) ?? [],
      ).filter(
        (item) =>
          item.getBoundingClientRect().width > 0 &&
          item.getAttribute("aria-disabled") !== "true",
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    // Result navigation belongs to the search field, not to a focused menu button.
    const isSearch =
      event.target?.getAttribute("data-testid") === "split-resource-search";
    if (isSearch && callback(event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  window.addEventListener("keydown", handle, true);
  return () => window.removeEventListener("keydown", handle, true);
}

export function revealControl(testId: string): void {
  if (Platform.OS !== "web") return;
  visibleControl(testId)?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
}

function visibleControl(testId: string): WebElement | undefined {
  // Paseo retains wide/compact route trees. Focus the visible copy, rather
  // than an older hidden control with the same persistent resource identity.
  return Array.from(
    document.querySelectorAll(`[data-testid="${testId}"]`),
  ).find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

// Route only plugin panel opens. The original factory handles every request
// outside the visible split screen, and is restored when the last owner leaves.
type PanelRouter = (request: PluginPanelRequest) => boolean;
let navigationPatch:
  | {
      module: Record<string, unknown>;
      original: NativeBridge["createPluginNavigation"];
      wrapped: NativeBridge["createPluginNavigation"];
      routes: Set<PanelRouter>;
    }
  | undefined;
export function installPluginPanelRouter(
  bridge: NativeBridge,
  route: PanelRouter,
): () => void {
  if (Platform.OS !== "web" || !window.__r) return () => {};
  if (!navigationPatch) {
    const module = window.__r(bridge.moduleIds.createPluginNavigation);
    const original =
      module.createPluginNavigation as NativeBridge["createPluginNavigation"];
    const routes = new Set<PanelRouter>();
    const dispatch = (request: PluginPanelRequest) => {
      for (const handler of [...routes].reverse())
        if (handler(request)) return true;
      return false;
    };
    const wrapped: NativeBridge["createPluginNavigation"] = (input) => {
      const navigation = original(input);
      return {
        ...navigation,
        openWorkspacePanel(pluginId, panelId, location) {
          if (
            input.workspaceId &&
            dispatch({
              ...input,
              workspaceId: input.workspaceId,
              pluginId,
              panelId,
              context: "workspace",
              location: location === "explorer" ? "explorer" : "workspace",
            })
          )
            return;
          navigation.openWorkspacePanel(pluginId, panelId, location);
        },
        openAgentPanel(pluginId, panelId, agentId, location) {
          if (
            input.workspaceId &&
            dispatch({
              ...input,
              workspaceId: input.workspaceId,
              pluginId,
              panelId,
              agentId,
              context: "agent",
              location: location === "explorer" ? "explorer" : "workspace",
            })
          )
            return;
          navigation.openAgentPanel(pluginId, panelId, agentId, location);
        },
      };
    };
    module.createPluginNavigation = wrapped;
    navigationPatch = { module, original, wrapped, routes };
  }
  const patch = navigationPatch;
  patch.routes.add(route);
  return () => {
    patch.routes.delete(route);
    if (
      !patch.routes.size &&
      patch.module.createPluginNavigation === patch.wrapped
    ) {
      patch.module.createPluginNavigation = patch.original;
      if (navigationPatch === patch) navigationPatch = undefined;
    }
  };
}
export function installForkTabRouter(
  bridge: NativeBridge,
  open: (request: ForkTabRequest) => boolean,
): () => void {
  if (
    Platform.OS !== "web" ||
    !window.__r ||
    !bridge.navigateToWorkspace ||
    !bridge.buildDraftWorkspaceAttachmentScopeKey ||
    !bridge.useWorkspaceAttachmentsStore
  )
    return () => {};
  const module = window.__r(bridge.moduleIds.navigateToWorkspace) as {
    navigateToWorkspace: NonNullable<NativeBridge["navigateToWorkspace"]>;
  };
  return installForkTabNavigation(
    module,
    (draftId) => {
      const scope = bridge.buildDraftWorkspaceAttachmentScopeKey!(draftId);
      return bridge
        .useWorkspaceAttachmentsStore!.getState()
        .attachmentsByScope[scope]?.find((item) => item.kind === "chat_history")
        ?.source;
    },
    open,
  );
}
export function focusConversation(tabId: string): Promise<void> {
  if (Platform.OS !== "web") return Promise.resolve();
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      const pane = visibleControl(`split-pane-${tabId}`);
      const input = Array.from(pane?.querySelectorAll("textarea") ?? []).find(
        (element) => element.getBoundingClientRect().width > 0,
      );
      input?.focus({ preventScroll: true });
      resolve();
    });
  });
}
