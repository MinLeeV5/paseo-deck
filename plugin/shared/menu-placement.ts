type Rect = { x: number; y: number; width: number; height: number };

// Return coordinates relative to the containing surface, with the menu clear
// of its trigger and inside that surface's visible bounds.
export function placeVerticalMenu({
  triggerRect,
  displayArea,
  preferredHeight = 280,
  gap = 6,
  padding = 8,
}: {
  triggerRect: Rect;
  displayArea: Rect;
  preferredHeight?: number;
  gap?: number;
  padding?: number;
}) {
  const x = triggerRect.x - displayArea.x;
  const y = triggerRect.y - displayArea.y;
  const above = Math.max(0, y - padding - gap);
  const below = Math.max(
    0,
    displayArea.height - padding - y - triggerRect.height - gap,
  );
  const side: "top" | "bottom" =
    below >= preferredHeight || below >= above ? "bottom" : "top";
  const height = Math.min(preferredHeight, side === "top" ? above : below);
  const width = Math.min(
    triggerRect.width,
    Math.max(0, displayArea.width - padding * 2),
  );
  return {
    side,
    height,
    width,
    top: side === "top" ? y - gap - height : y + triggerRect.height + gap,
    left: Math.max(padding, Math.min(x, displayArea.width - padding - width)),
  };
}
