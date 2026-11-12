export interface ShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  repeat?: boolean;
}

export function matchesShortcutStroke(
  event: ShortcutEvent,
  keys: readonly string[],
  isMac: boolean,
): boolean {
  if (event.isComposing || event.repeat || keys.length === 0) return false;
  const normalized = keys.map((key) => key.toLowerCase());
  const mod = normalized.includes("mod");
  const meta =
    normalized.includes("meta") || normalized.includes("cmd") || (mod && isMac);
  const ctrl =
    normalized.includes("ctrl") ||
    normalized.includes("control") ||
    (mod && !isMac);
  if (
    event.metaKey !== meta ||
    event.ctrlKey !== ctrl ||
    event.altKey !== normalized.includes("alt") ||
    event.shiftKey !== normalized.includes("shift")
  )
    return false;
  const key = normalized.find(
    (key) =>
      !["mod", "meta", "cmd", "ctrl", "control", "alt", "shift"].includes(key),
  );
  const alias: Record<string, string> = {
    space: " ",
    esc: "escape",
    return: "enter",
  };
  return key !== undefined && event.key.toLowerCase() === (alias[key] ?? key);
}
