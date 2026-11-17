import { useEffect, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type TextInput,
} from "react-native";
import type { NativeBridge } from "./native-types";
import { DialogButton, DialogChoice, DialogInput } from "./add-dialog-ui";
import { keyboardFocusVisible, onWorkspaceBranchMenu } from "./web";
import { placeVerticalMenu } from "../shared/menu-placement";

const branchLabel = (ref: string) =>
  ref.replace(/^refs\/(heads|remotes)\//, "");

export function useWorkspaceBranchPicker({
  bridge,
  serverId,
  theme,
  cwd,
  value,
  onChange,
  disabled,
  rootRef,
  enabled,
}: {
  bridge: NativeBridge;
  serverId: string;
  theme: PluginScreenProps["theme"];
  cwd: string;
  value: string;
  onChange(value: string): void;
  disabled: boolean;
  rootRef: RefObject<View | null>;
  enabled: boolean;
}) {
  const c = theme.colors;
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const search = useRef<TextInput>(null);
  const trigger = useRef<View>(null);
  const [position, setPosition] = useState({
    side: "bottom" as "top" | "bottom",
    top: 0,
    left: 0,
    width: 280,
    height: 280,
  });
  const close = () => {
    if (!expanded) return;
    setExpanded(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    setExpanded(false);
    setQuery("");
  }, [cwd, serverId, enabled]);
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (expanded) search.current?.focus();
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    return onWorkspaceBranchMenu(() => {
      setExpanded(false);
      trigger.current?.focus();
    });
  }, [expanded]);
  const toggle = () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    trigger.current?.measureInWindow((x, y, width, height) => {
      rootRef.current?.measureInWindow(
        (rootX, rootY, rootWidth, rootHeight) => {
          setPosition(
            placeVerticalMenu({
              triggerRect: { x, y, width, height },
              displayArea: {
                x: rootX,
                y: rootY,
                width: rootWidth,
                height: rootHeight,
              },
            }),
          );
          setExpanded(true);
        },
      );
    });
  };
  const branches = useQuery({
    queryKey: ["deck-base-branches", serverId, cwd, searchTerm],
    queryFn: async () => {
      const client = bridge.getHostRuntimeStore().getClient(serverId);
      if (!client) throw new Error("主机未连接，请连接后重试。");
      // Preserve remote-qualified refs so origin/main and main stay distinct.
      const result = await client.getBranchSuggestions({
        cwd,
        query: searchTerm,
        limit: 50,
        refMode: "exact",
      });
      if (result.error) throw new Error(result.error);
      return [...new Set(result.branches)];
    },
    enabled: enabled && expanded && !disabled,
    retry: false,
    staleTime: 15_000,
  });
  const searching = query.trim() !== searchTerm || branches.isPending;
  const choose = (branch: string) => {
    onChange(branch);
    setExpanded(false);
    setQuery("");
    trigger.current?.focus();
  };
  return {
    close,
    field: (
      <View testID="split-workspace-base-branch-field" style={{ gap: 8 }}>
        <Text style={{ color: c.foreground, fontSize: 12, fontWeight: "500" }}>
          基础分支
        </Text>
        <Pressable
          ref={trigger}
          testID="split-workspace-base-branch"
          accessibilityRole="button"
          accessibilityLabel={`基础分支：${branchLabel(value) || "自动选择"}`}
          accessibilityState={{ expanded, disabled }}
          aria-expanded={expanded}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={toggle}
          onFocus={() => setFocused(keyboardFocusVisible())}
          onBlur={() => setFocused(false)}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={({ pressed }) => ({
            minHeight: 40,
            paddingHorizontal: 10,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderRadius: 7,
            borderColor: focused ? c.accent : c.border,
            backgroundColor: hovered || pressed ? c.surface2 : c.surface0,
            opacity: disabled ? 0.45 : 1,
          })}
        >
          <View aria-hidden pointerEvents="none">
            <Icon name="GitBranch" size={15} color={c.foregroundMuted} />
          </View>
          <Text
            style={{ flex: 1, minWidth: 0, color: c.foreground, fontSize: 13 }}
          >
            {branchLabel(value) || "自动选择"}
          </Text>
          <View aria-hidden pointerEvents="none">
            <Icon
              name={
                expanded
                  ? position.side === "top"
                    ? "ChevronDown"
                    : "ChevronUp"
                  : "ChevronsUpDown"
              }
              size={14}
              color={c.foregroundMuted}
            />
          </View>
        </Pressable>

        <Text
          style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 18 }}
        >
          从此分支创建独立 worktree。
        </Text>
      </View>
    ),
    popup:
      expanded && enabled ? (
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", inset: 0, zIndex: 100 }}
        >
          <Pressable
            accessibilityLabel="关闭基础分支选项"
            onPress={close}
            style={{ position: "absolute", inset: 0 }}
          />
          <View
            testID="split-workspace-base-branch-options"
            role="dialog"
            accessibilityLabel="选择基础分支"
            style={{
              position: "absolute",
              top: position.top,
              left: position.left,
              width: position.width,
              height: position.height,
              zIndex: 10,
              padding: 8,
              gap: 6,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 7,
              backgroundColor: c.surface0,
              boxShadow: [
                { offsetX: 0, offsetY: 3, blurRadius: 12, color: c.border },
              ],
            }}
          >
            <DialogInput
              ref={search}
              autoFocus
              theme={theme}
              label="搜索基础分支"
              placeholder="搜索本地或远程分支…"
              icon="Search"
              value={query}
              onChangeText={setQuery}
              disabled={disabled}
              testID="split-workspace-base-branch-search"
            />
            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="基础分支"
              >
                <DialogChoice
                  theme={theme}
                  compact
                  title="自动选择"
                  subtitle="沿用项目设置"
                  icon={value ? "GitBranch" : "Check"}
                  selected={!value}
                  onPress={() => choose("")}
                  disabled={disabled}
                />
                {searching ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    accessibilityState={{ busy: true }}
                    style={{
                      padding: 12,
                      color: c.foregroundMuted,
                      fontSize: 12,
                    }}
                  >
                    正在读取分支…
                  </Text>
                ) : branches.isError ? (
                  <View style={{ padding: 8, gap: 8 }}>
                    <Text
                      accessibilityRole="alert"
                      style={{
                        color: c.statusDanger,
                        fontSize: 12,
                        lineHeight: 18,
                      }}
                    >
                      无法读取分支：{branches.error.message}
                    </Text>
                    <DialogButton
                      theme={theme}
                      label="重试读取分支"
                      onPress={() => void branches.refetch()}
                      busy={branches.isFetching}
                      disabled={disabled || branches.isFetching}
                      icon="RefreshCw"
                    />
                  </View>
                ) : branches.data?.length ? (
                  branches.data.map((branch) => (
                    <DialogChoice
                      key={branch}
                      theme={theme}
                      compact
                      title={branchLabel(branch)}
                      subtitle={
                        branch.startsWith("refs/remotes/")
                          ? "远程分支"
                          : branch.startsWith("refs/heads/")
                            ? "本地分支"
                            : undefined
                      }
                      icon={branch === value ? "Check" : "GitBranch"}
                      selected={branch === value}
                      onPress={() => choose(branch)}
                      disabled={disabled}
                    />
                  ))
                ) : (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={{
                      padding: 12,
                      color: c.foregroundMuted,
                      fontSize: 12,
                    }}
                  >
                    {searchTerm
                      ? "没有匹配的分支，请换个关键词。"
                      : "暂无可用分支。"}
                  </Text>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      ) : null,
  };
}
