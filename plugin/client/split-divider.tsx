import { memo, useState } from "react";
import {
  Platform,
  View,
  type GestureResponderHandlers,
  type ViewStyle,
} from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { Rect } from "./pane-frame";

export const SplitDivider = memo(function SplitDivider({
  id,
  rect,
  direction,
  theme,
  handlers,
}: {
  id: string;
  rect: Rect;
  direction: "row" | "column";
  theme: PluginScreenProps["theme"];
  handlers: GestureResponderHandlers;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const vertical = direction === "row";
  const highlighted = hovered || dragging;
  const color = dragging
    ? theme.colors.foreground
    : theme.colors.foregroundMuted;
  return (
    <View
      {...handlers}
      testID={`split-divider-${id}`}
      accessibilityRole="adjustable"
      accessibilityLabel="调整分屏比例"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onResponderGrant={(event) => {
        setDragging(true);
        return handlers.onResponderGrant?.(event);
      }}
      onResponderRelease={(event) => {
        setDragging(false);
        handlers.onResponderRelease?.(event);
      }}
      onResponderTerminate={(event) => {
        setDragging(false);
        handlers.onResponderTerminate?.(event);
      }}
      style={{
        position: "absolute",
        left: rect.left - (vertical ? 4 : 0),
        top: rect.top - (vertical ? 0 : 4),
        width: vertical ? 12 : rect.width,
        height: vertical ? rect.height : 12,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3,
        // React Native's types expose only native cursors; RN Web also accepts
        // the standard CSS resize cursors. Keep this extension web-only.
        ...(Platform.OS === "web"
          ? {
              cursor: (vertical
                ? "col-resize"
                : "row-resize") as ViewStyle["cursor"],
            }
          : {}),
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: vertical ? 2 : "100%",
          height: vertical ? "100%" : 2,
          backgroundColor: highlighted ? color : theme.colors.border,
          opacity: highlighted ? 0.7 : 1,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          width: vertical ? (highlighted ? 4 : 3) : 28,
          height: vertical ? 28 : highlighted ? 4 : 3,
          borderRadius: 2,
          backgroundColor: color,
          opacity: highlighted ? 0.9 : 0.45,
        }}
      />
    </View>
  );
});
