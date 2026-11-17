import { forwardRef, useState, type ReactNode } from "react";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import {
  Pressable,
  Text,
  View,
  type TextInput as NativeTextInput,
} from "react-native";
import { keyboardFocusVisible } from "./web";
type Theme = PluginScreenProps["theme"];

export const DialogInput = forwardRef<
  NativeTextInput,
  {
    theme: Theme;
    label: string;
    placeholder?: string;
    value: string;
    onChangeText(value: string): void;
    onSubmit?(): void;
    disabled?: boolean;
    icon?: string;
    testID?: string;
  }
>(function DialogInput(
  {
    theme,
    label,
    placeholder,
    value,
    onChangeText,
    onSubmit,
    disabled,
    icon,
    testID,
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const c = theme.colors;
  return (
    <View
      style={{
        minHeight: 38,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderRadius: 7,
        borderColor: focused ? c.accent : c.border,
        backgroundColor: c.surface0,
      }}
    >
      {icon && <Icon name={icon} size={15} color={c.foregroundMuted} />}
      <TextInput
        ref={ref}
        testID={testID}
        accessibilityLabel={label}
        placeholder={placeholder ?? label}
        placeholderTextColor={c.foregroundMuted}
        value={value}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        style={{
          flex: 1,
          minWidth: 0,
          height: 36,
          padding: 0,
          borderWidth: 0,
          outlineWidth: 0,
          backgroundColor: "transparent",
          color: c.foreground,
          fontSize: 13,
        }}
      />
    </View>
  );
});

export function DialogButton({
  theme,
  label,
  onPress,
  primary,
  disabled,
  busy,
  icon,
  testID,
}: {
  theme: Theme;
  label: string;
  onPress(): void;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: string;
  testID?: string;
}) {
  const [focused, setFocused] = useState(false),
    [hovered, setHovered] = useState(false);
  const c = theme.colors;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      aria-disabled={disabled}
      aria-busy={busy}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(keyboardFocusVisible())}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: focused ? c.accent : primary ? c.foreground : c.border,
        backgroundColor: primary
          ? c.foreground
          : hovered || pressed
            ? c.surface2
            : c.surface0,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {icon && (
        <Icon
          name={icon}
          size={14}
          color={primary ? c.surface0 : c.foregroundMuted}
        />
      )}
      <Text
        numberOfLines={1}
        style={{
          color: primary ? c.surface0 : c.foreground,
          fontSize: 12,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function DialogChoice({
  theme,
  title,
  subtitle,
  icon,
  leadingIcon,
  selected,
  onPress,
  disabled,
  compact,
  testID,
}: {
  theme: Theme;
  title: string;
  subtitle?: string;
  icon?: string;
  leadingIcon?: ReactNode;
  selected: boolean;
  onPress(): void;
  disabled?: boolean;
  compact?: boolean;
  testID?: string;
}) {
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false);
  const c = theme.colors;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(keyboardFocusVisible())}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        minHeight: compact ? 40 : 58,
        paddingHorizontal: 12,
        paddingVertical: compact ? 8 : 11,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderRadius: 7,
        borderColor: focused ? c.accent : selected ? c.border : "transparent",
        backgroundColor:
          selected || hovered || pressed ? c.surface2 : "transparent",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {leadingIcon ?? (
        <Icon
          name={icon ?? "Layers"}
          size={compact ? 15 : 17}
          color={selected ? c.foreground : c.foregroundMuted}
        />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text
          numberOfLines={1}
          style={{
            color: c.foreground,
            fontSize: 13,
            fontWeight: selected ? "500" : "400",
          }}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            numberOfLines={1}
            style={{ color: c.foregroundMuted, fontSize: 12 }}
          >
            {subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
