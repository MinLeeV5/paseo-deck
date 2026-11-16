import type { PaseoProject, PaseoWorkspace } from "./paseo-types";

export function sortPickerProjects(
  projects: readonly PaseoProject[],
  workspaces: readonly PaseoWorkspace[],
) {
  const activity = new Map<string, number>();
  for (const workspace of workspaces) {
    if (workspace.internal || workspace.background || workspace.archivingAt)
      continue;
    const latest = Math.max(
      ...[
        workspace.activityAt,
        workspace.lastUserMessageAt,
        workspace.createdAt,
      ].map((time) => (time ? Date.parse(time) || 0 : 0)),
    );
    activity.set(
      workspace.projectId,
      Math.max(activity.get(workspace.projectId) ?? 0, latest),
    );
  }
  // Preserve the source order for ties and projects without activity.
  return [...projects].sort(
    (a, b) =>
      (activity.get(b.projectId) ?? 0) - (activity.get(a.projectId) ?? 0),
  );
}
