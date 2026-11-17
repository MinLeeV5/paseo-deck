import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import type { PaseoProject } from "./paseo-types";
import type { WorkspaceCreation } from "./workspace-creation";
import { useState, type ReactNode } from "react";
import { DialogChoice, DialogInput } from "./add-dialog-ui";

export function WorkspaceFields({
  theme,
  project,
  title,
  isolation,
  busy,
  branchPicker,
  onTitle,
  onIsolation,
}: {
  theme: PluginScreenProps["theme"];
  project: PaseoProject;
  title: string;
  isolation: WorkspaceCreation["isolation"];
  busy: boolean;
  branchPicker: ReactNode;
  onTitle(value: string): void;
  onIsolation(value: WorkspaceCreation["isolation"]): void;
}) {
  const c = theme.colors;
  const [stacked, setStacked] = useState(false);
  return (
    <View
      testID="split-workspace-fields"
      onLayout={(event) => setStacked(event.nativeEvent.layout.width < 420)}
      style={{ gap: 16 }}
    >
      <View
        testID="split-workspace-title-row"
        style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <Text
          testID="split-workspace-title-label"
          style={{
            color: c.foreground,
            fontSize: 12,
            fontWeight: "500",
            flexShrink: 0,
          }}
        >
          Workspace 名称{" "}
          <Text style={{ color: c.foregroundMuted, fontWeight: "400" }}>
            · 可选
          </Text>
        </Text>
        <View style={{ flex: 1, minWidth: 100, maxWidth: 280 }}>
          <DialogInput
            theme={theme}
            label="Workspace 名称（可选）"
            placeholder="留空自动命名"
            testID="split-workspace-title"
            value={title}
            onChangeText={onTitle}
            disabled={busy}
          />
        </View>
      </View>
      {project.projectKind === "git" ? (
        <View
          testID="split-workspace-source-row"
          style={{
            flexDirection: stacked ? "column" : "row",
            gap: 16,
            alignItems: "stretch",
          }}
        >
          <View
            testID="split-workspace-isolation"
            accessibilityRole="radiogroup"
            accessibilityLabel="工作目录"
            style={{ gap: 6, flex: stacked ? undefined : 1, minWidth: 0 }}
          >
            <Text
              style={{
                color: c.foreground,
                fontSize: 12,
                fontWeight: "500",
                marginBottom: 2,
              }}
            >
              工作目录
            </Text>
            <DialogChoice
              compact
              theme={theme}
              title="新建 worktree"
              subtitle="使用独立分支和目录"
              icon="GitBranch"
              selected={isolation === "worktree"}
              onPress={() => onIsolation("worktree")}
              disabled={busy}
            />
            <DialogChoice
              compact
              theme={theme}
              title="使用原目录"
              subtitle="共享当前文件和分支"
              icon="Folder"
              selected={isolation === "directory"}
              onPress={() => onIsolation("directory")}
              disabled={busy}
            />
          </View>
          {isolation === "worktree" && (
            <View style={{ flex: stacked ? undefined : 1, minWidth: 0 }}>
              {branchPicker}
            </View>
          )}
        </View>
      ) : (
        <Text
          style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 19 }}
        >
          此 project 使用原目录创建 workspace。
        </Text>
      )}
      <Text style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 19 }}>
        创建后自动添加新 Agent，发送首条消息开始对话。
      </Text>
    </View>
  );
}
