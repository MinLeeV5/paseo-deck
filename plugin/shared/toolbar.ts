export type ToolbarPreferences = {
  version: 1;
  pinned: string[] | null;
};

export const defaultToolbarPreferences: ToolbarPreferences = {
  version: 1,
  pinned: null,
};

// Registration keys are runtime-specific; plugin and contribution IDs survive
// reloads and are shared by the same button in different workspaces.
export function pluginButtonIdentity(button: {
  id: string;
  installation: { id: string };
}): string {
  return JSON.stringify([button.installation.id, button.id]);
}

export function restoreToolbarPreferences(value: unknown): ToolbarPreferences {
  if (!value || typeof value !== "object") return defaultToolbarPreferences;
  const candidate = value as { version?: unknown; pinned?: unknown };
  if (
    candidate.version !== 1 ||
    (candidate.pinned !== null &&
      (!Array.isArray(candidate.pinned) ||
        candidate.pinned.some((id) => typeof id !== "string")))
  )
    return defaultToolbarPreferences;
  return {
    version: 1,
    pinned:
      candidate.pinned === null
        ? null
        : [...new Set(candidate.pinned as string[])],
  };
}

export function pinnedButtonCapacity(width: number, compact: boolean): number {
  // Keep room for the selected Tab, add button and official controls. Below
  // this breakpoint all workspace actions remain available in More.
  return compact || width < 560
    ? 0
    : Math.max(0, Math.floor((width - 420) / 26));
}

export type FlyoutPositionInput = {
  placement: string;
  triggerRect: { x: number; y: number; width: number; height: number };
  contentSize: { width: number; height: number };
  displayArea: { x: number; y: number; width: number; height: number };
  offset?: number;
};
export function chooseFlyoutSide(input: FlyoutPositionInput): "left" | "right" {
  const {
    triggerRect: anchor,
    contentSize: content,
    displayArea: area,
  } = input;
  const offset = input.offset ?? 4;
  const right = area.x + area.width - 8 - (anchor.x + anchor.width + offset);
  const left = anchor.x - offset - area.x - 8;
  if (right >= content.width) return "right";
  return left >= content.width || left > right ? "left" : "right";
}
