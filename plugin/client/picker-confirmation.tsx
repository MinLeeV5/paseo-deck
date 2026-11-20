import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { NativeBridge } from "./native-types";
import { DialogButton } from "./add-dialog-ui";
import { focusControl, onPickerPopupKeys, scheduleFrame } from "./web";

type ConfirmOptions = Parameters<NativeBridge["confirmDialog"]>[0];
const confirmationID = "split-picker-confirmation";

export function usePickerConfirmation(theme: PluginScreenProps["theme"]) {
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const confirm: NativeBridge["confirmDialog"] = useCallback((request) => {
    if (resolve.current) return Promise.resolve(false);
    return new Promise((finish) => {
      resolve.current = finish;
      setOptions(request);
    });
  }, []);
  const finish = useCallback((confirmed: boolean) => {
    const pending = resolve.current;
    resolve.current = null;
    setOptions(null);
    pending?.(confirmed);
  }, []);
  useEffect(
    () => () => {
      const pending = resolve.current;
      resolve.current = null;
      pending?.(false);
    },
    [],
  );
  useEffect(() => {
    if (!options) return;
    const cancel = scheduleFrame(() =>
      focusControl(`${confirmationID}-cancel`),
    );
    const removeKeys = onPickerPopupKeys(confirmationID, () => finish(false));
    return () => {
      cancel();
      removeKeys();
    };
  }, [options, finish]);
  const c = theme.colors;
  return {
    confirm,
    popup: options && (
      <View
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 110,
          padding: 14,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Pressable
          aria-hidden
          tabIndex={-1}
          onPress={() => finish(false)}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: c.surface0,
            opacity: 0.76,
          }}
        />
        <View
          role="dialog"
          aria-modal
          accessibilityLabel={options.title}
          testID={confirmationID}
          style={{
            width: "100%",
            maxWidth: 440,
            maxHeight: "100%",
            backgroundColor: c.surface1,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 10,
            padding: 16,
            gap: 11,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ fontSize: 16, fontWeight: "600", color: c.foreground }}
          >
            {options.title}
          </Text>
          <ScrollView
            style={{ flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              style={{ fontSize: 13, lineHeight: 19, color: c.foregroundMuted }}
            >
              {options.message}
            </Text>
          </ScrollView>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 7,
              flexWrap: "wrap",
            }}
          >
            <DialogButton
              theme={theme}
              label={options.cancelLabel}
              testID={`${confirmationID}-cancel`}
              onPress={() => finish(false)}
            />
            <DialogButton
              theme={theme}
              label={options.confirmLabel}
              destructive={options.destructive}
              testID={`${confirmationID}-approve`}
              onPress={() => finish(true)}
            />
          </View>
        </View>
      </View>
    ),
  };
}
