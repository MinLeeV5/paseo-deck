import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import type { PaseoProject } from "./paseo-types";
import type { WorkspaceCreation } from "./workspace-creation";
import { DialogChoice, DialogInput } from "./add-dialog-ui";

export function WorkspaceFields({
  theme,
  project,
  title,
  isolation,
  busy,
  onTitle,
  onIsolation,
}: {
  theme: PluginScreenProps["theme"];
  project: PaseoProject;
  title: string;
  isolation: WorkspaceCreation["isolation"];
  busy: boolean;
  onTitle(value: string): void;
  onIsolation(value: WorkspaceCreation["isolation"]): void;
}) {
  const c = theme.colors;
  return (
    <View testID="split-workspace-fields" style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ color: c.foreground, fontSize: 12, fontWeight: "500" }}>
          Workspace 名称{" "}
          <Text style={{ color: c.foregroundMuted, fontWeight: "400" }}>
            · 可选
          </Text>
        </Text>
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
      {project.projectKind === "git" ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="工作目录"
          style={{ gap: 6 }}
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
            theme={theme}
            title="新建 worktree"
            subtitle="使用独立分支和目录"
            icon="GitBranch"
            selected={isolation === "worktree"}
            onPress={() => onIsolation("worktree")}
            disabled={busy}
          />
          <DialogChoice
            theme={theme}
            title="使用原目录"
            subtitle="共享当前文件和分支"
            icon="Folder"
            selected={isolation === "directory"}
            onPress={() => onIsolation("directory")}
            disabled={busy}
          />
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
