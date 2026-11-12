import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { keyboardFocusVisible } from "./web";
import { memo, useState, type Ref } from "react";
import { Pressable, Text, View } from "react-native";

export const targetIcons = {
  agent: "Bot",
  draft: "SquarePen",
  terminal: "Terminal",
  browser: "Globe",
  plugin: "Puzzle",
  file: "FileCode2",
  files: "FolderTree",
  working_diff: "GitCompare",
  provider_subagent: "GitBranch",
} as const;

export const IconButton = memo(function IconButton({
  label,
  icon,
  onPress,
  theme,
  disabled = false,
  size = 24,
  accent = false,
  anchorRef,
  tooltip = true,
  testID,
}: {
  label: string;
  icon: string;
  onPress(): void;
  theme: PluginScreenProps["theme"];
  disabled?: boolean;
  size?: number;
  accent?: boolean;
  anchorRef?: Ref<View>;
  tooltip?: boolean;
  testID?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const colors = theme.colors;
  return (
    <View ref={anchorRef} style={{ zIndex: hovered || focused ? 10 : 0 }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setFocused(keyboardFocusVisible())}
        onBlur={() => setFocused(false)}
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 3,
          borderWidth: 1,
          borderColor: focused ? colors.foregroundMuted : "transparent",
          backgroundColor: hovered ? colors.surface2 : "transparent",
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <Icon
          name={icon}
          size={size <= 22 ? 12 : 14}
          color={accent ? colors.accent : colors.foregroundMuted}
        />
      </Pressable>
      {tooltip && hovered && !disabled && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: size + 3,
            right: 0,
            width: Math.min(320, label.length * 11 + 16),
            paddingHorizontal: 7,
            paddingVertical: 4,
            borderRadius: 4,
            backgroundColor: colors.surface2,
            borderColor: colors.border,
            borderWidth: 1,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, color: colors.foreground }}
          >
            {label}
          </Text>
        </View>
      )}
    </View>
  );
});
