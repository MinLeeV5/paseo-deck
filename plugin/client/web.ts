import { Platform } from "react-native";
import {
  restoreBoard,
  emptyBoard,
  type Board,
  type TabGroup,
} from "../shared/model";
import type { NativeBridge } from "./native-types";
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
        if (typeof value !== "function")
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
    const pane = window.__r(info.moduleIds.WorkspacePaneContent);
    if (typeof pane.buildWorkspacePaneContentModel !== "function")
      throw new Error("原生面板构建入口已变化。");
    const getPanel = exports.getPanelRegistration as (kind: string) => unknown;
    return {
      ...info,
      ...exports,
      queryClient,
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
    const raw = window.localStorage.getItem(
      `paseo-split-demo:board:${serverId}`,
    );
    const value = raw ? JSON.parse(raw) : null;
    const parsed = restoreBoard(value);
    if (parsed && value?.version === 1 && raw) {
      const backupKey = `paseo-split-demo:board:v1-backup:${serverId}`;
      if (!window.localStorage.getItem(backupKey))
        window.localStorage.setItem(backupKey, raw);
    }
    return parsed ?? emptyBoard;
  } catch {
    return emptyBoard;
  }
}
export function saveBoard(serverId: string, board: Board): void {
  if (Platform.OS !== "web") return;
  window.localStorage.setItem(
    `paseo-split-demo:board:${serverId}`,
    JSON.stringify(board),
  );
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
  groupId: string,
  thumbColor: string,
  trackColor: string,
): () => void {
  if (Platform.OS !== "web") return () => {};
  const selector = `[data-testid="split-tabs-${groupId}"]`;
  const strip = document.querySelector(selector) as TabScrollElement | null;
  if (!strip) return () => {};
  // An explicit track keeps overflowing Tabs discoverable on desktop systems
  // that otherwise hide their overlay scrollbars until a gesture starts.
  const sheet = document.createElement("style");
  const subtleThumbColor = `color-mix(in srgb, ${thumbColor} 35%, ${trackColor})`;
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

export type TabDropTarget = {
  groupId: string;
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  markerLeft: number;
};
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
  drop: (tabId: string, groupId: string, index: number) => void,
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
  let suppressClick = false;
  const userSelect = area.style.getPropertyValue("user-select");
  const locate = (
    scroll: boolean,
  ): { target: TabDropTarget | null; scrolled: boolean } => {
    if (!current) return { target: null, scrolled: false };
    const origin = area.getBoundingClientRect();
    for (const group of getGroups()) {
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
        y > (group.tabIds.length ? header.bottom : bounds.bottom)
      )
        continue;
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
      title: tab?.textContent?.trim() || "Tab",
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
    if (target) drop(tabId, target.groupId, target.index);
  };
  const interrupted = (event: TabPointerEvent) => {
    if (current?.pointerId === event.pointerId) cancel();
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
  area.addEventListener("lostpointercapture", interrupted, true);
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
    area.removeEventListener("lostpointercapture", interrupted, true);
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
