import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { PaseoProject } from "./paseo-types";
import {
  WORKSPACE_AUTO_TITLE,
  initialWorkspaceAutoTitle,
} from "./workspace-auto-title.ts";

export type WorkspaceCreation = {
  project: PaseoProject;
  title: string;
  isolation: "directory" | "worktree";
  baseBranch?: string;
  idempotencyKey: string;
};

export function workspaceCreationOptions({
  project,
  title,
  isolation,
  baseBranch,
  idempotencyKey,
}: WorkspaceCreation): Parameters<
  PluginClientContext["paseo"]["workspaces"]["create"]
>[0] {
  if (isolation === "worktree" && project.projectKind !== "git")
    throw new Error("此 project 不支持创建 worktree，请使用原目录。");
  return {
    idempotencyKey,
    ...(title.trim()
      ? { title: title.trim() }
      : { metadata: { [WORKSPACE_AUTO_TITLE]: initialWorkspaceAutoTitle } }),
    source:
      isolation === "worktree"
        ? {
            kind: "worktree",
            projectId: project.projectId,
            cwd: project.projectRootPath,
            ...(baseBranch?.trim() ? { baseBranch: baseBranch.trim() } : {}),
          }
        : {
            kind: "directory",
            projectId: project.projectId,
            path: project.projectRootPath,
          },
  };
}
