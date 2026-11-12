import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useEffect, useState, type RefObject } from "react";
import { Text, View } from "react-native";
import type { TabGroup } from "../shared/model";
import { onTabDrag, type TabDragPreview } from "./web";

// Keep pointer-move renders out of the board and its native content subtrees.
export function TabDragLayer({
  area,
  enabled,
  getGroups,
  onDrop,
  theme,
}: {
  area: RefObject<View | null>;
  enabled: boolean;
  getGroups(): TabGroup[];
  onDrop(tabId: string, groupId: string, index: number): void;
  theme: PluginScreenProps["theme"];
}) {
  const [preview, setPreview] = useState<TabDragPreview | null>(null);
  useEffect(() => {
    if (enabled) return onTabDrag(area.current, getGroups, setPreview, onDrop);
  }, [area, enabled, getGroups, onDrop]);
  if (!preview) return null;
  const target = preview.target;
  const colors = theme.colors;
  return (
    <View
      pointerEvents="none"
      testID="split-tab-drag"
      style={{ position: "absolute", inset: 0, zIndex: 20 }}
    >
      {target && (
        <>
          <View
            testID="split-tab-drop-target"
            style={{
              position: "absolute",
              left: target.left,
              top: target.top,
              width: target.width,
              height: target.height,
              borderWidth: 1,
              borderColor: colors.foregroundMuted,
              borderRadius: 4,
              backgroundColor: colors.surface2,
              opacity: 0.45,
            }}
          />
          <View
            testID="split-tab-drop-marker"
            style={{
              position: "absolute",
              left: target.markerLeft - 1,
              top: target.top + 3,
              width: 2,
              height: Math.max(0, target.height - 6),
              borderRadius: 1,
              backgroundColor: colors.foreground,
            }}
          />
        </>
      )}
      <View
        style={{
          position: "absolute",
          left: preview.left,
          top: preview.top,
          maxWidth: 220,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 5,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface2,
          opacity: 0.95,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: colors.foreground, fontSize: 12 }}
        >
          {preview.title}
        </Text>
      </View>
    </View>
  );
}
