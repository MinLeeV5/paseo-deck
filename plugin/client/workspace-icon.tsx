import {
  createContext,
  createElement,
  memo,
  useContext,
  useMemo,
  useState,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { NativeBridge, ProjectIconTarget } from "./native-types";
import type { Directory } from "./directory";

type WorkspaceVisual = { key: string; name: string; uri: string | null };
const Visuals = createContext<Map<string, WorkspaceVisual>>(new Map());
const ProjectVisuals = createContext<Map<string, WorkspaceVisual>>(new Map());
export function WorkspaceIcons({
  bridge,
  hostId,
  directory,
  children,
  workspaceIds,
  allProjects = false,
}: {
  bridge: NativeBridge;
  hostId: string;
  directory?: Directory;
  children: ReactNode;
  workspaceIds: Set<string>;
  allProjects?: boolean;
}) {
  const [values, setValues] = useState<Map<string, WorkspaceVisual>>(
    () => new Map(),
  );
  const [projectValues, setProjectValues] = useState<
    Map<string, WorkspaceVisual>
  >(() => new Map());
  return (
    <QueryClientProvider client={bridge.queryClient}>
      <IconCatalog
        bridge={bridge}
        hostId={hostId}
        projects={directory?.projects}
        workspaces={directory?.workspaces}
        workspaceIds={workspaceIds}
        allProjects={allProjects}
        onChange={setValues}
        onProjectsChange={setProjectValues}
      />
      <ProjectVisuals.Provider value={projectValues}>
        <Visuals.Provider value={values}>{children}</Visuals.Provider>
      </ProjectVisuals.Provider>
    </QueryClientProvider>
  );
}
// Keep native query observers out of the layout render path. No icon hook or
// data-URI signature work is repeated while a divider moves.
const IconCatalog = memo(function IconCatalog({
  bridge,
  hostId,
  projects,
  workspaces,
  workspaceIds,
  allProjects,
  onChange,
  onProjectsChange,
}: {
  bridge: NativeBridge;
  hostId: string;
  projects?: Directory["projects"];
  workspaces?: Directory["workspaces"];
  workspaceIds: Set<string>;
  allProjects: boolean;
  onChange(value: Map<string, WorkspaceVisual>): void;
  onProjectsChange(value: Map<string, WorkspaceVisual>): void;
}) {
  const allTargets = useMemo<ProjectIconTarget[]>(() => {
    const catalog = projects ?? [];
    const counts = new Map<string, number>();
    for (const project of catalog)
      if (project.projectKey)
        counts.set(
          project.projectKey,
          (counts.get(project.projectKey) ?? 0) + 1,
        );
    return catalog.map((project) => ({
      projectViewKey:
        project.projectKey && counts.get(project.projectKey) === 1
          ? project.projectKey
          : JSON.stringify([hostId, project.projectId]),
      serverId: hostId,
      projectId: project.projectId,
      iconWorkingDir: project.projectRootPath,
      customIconRevision: project.projectCustomIconRevision,
      iconRevision: project.projectIconRevision,
    }));
  }, [projects, hostId]);
  const targets = useMemo(() => {
    if (allProjects) return allTargets;
    const ids = new Set(
      (workspaces ?? [])
        .filter((workspace) => workspaceIds.has(workspace.id))
        .map((workspace) => workspace.projectId),
    );
    return allTargets.filter((target) => ids.has(target.projectId));
  }, [allTargets, workspaces, workspaceIds, allProjects]);
  const icons = bridge.useProjectIcons({ projects: targets });
  const projectValues = useMemo(
    () =>
      new Map(
        (projects ?? []).map((project) => {
          const target = allTargets.find(
            (target) => target.projectId === project.projectId,
          )!;
          return [
            project.projectId,
            {
              key: target.projectViewKey,
              name: project.projectCustomName ?? project.projectDisplayName,
              uri: icons.get(target.projectViewKey) ?? null,
            },
          ];
        }),
      ),
    [projects, allTargets, icons],
  );
  const values = useMemo(
    () =>
      new Map(
        (workspaces ?? []).map((workspace) => {
          return [
            workspace.id,
            projectValues.get(workspace.projectId) ?? {
              key: JSON.stringify([hostId, workspace.projectId]),
              name: workspace.projectCustomName ?? workspace.projectDisplayName,
              uri: null,
            },
          ];
        }),
      ),
    [workspaces, projectValues, hostId],
  );
  useLayoutEffect(() => onChange(values), [values, onChange]);
  useLayoutEffect(
    () => onProjectsChange(projectValues),
    [projectValues, onProjectsChange],
  );
  return null;
});
export const WorkspaceIcon = memo(function WorkspaceIcon({
  bridge,
  workspaceId,
  label,
  size = 14,
}: {
  bridge: NativeBridge;
  workspaceId: string;
  label: string;
  size?: number;
}) {
  const visual = useContext(Visuals).get(workspaceId);
  return projectIconView(bridge, visual, label, workspaceId, size);
});

export const ProjectIcon = memo(function ProjectIcon({
  bridge,
  projectId,
  label,
  size = 20,
}: {
  bridge: NativeBridge;
  projectId: string;
  label: string;
  size?: number;
}) {
  const visual = useContext(ProjectVisuals).get(projectId);
  return projectIconView(bridge, visual, label, projectId, size);
});

function projectIconView(
  bridge: NativeBridge,
  visual: WorkspaceVisual | undefined,
  label: string,
  fallbackKey: string,
  size: number,
) {
  const name = visual?.name ?? label.split(" / ")[0];
  return createElement(bridge.ProjectIconView, {
    iconDataUri: visual?.uri ?? null,
    initial:
      (
        bridge.projectIconPlaceholderLabelFromDisplayName?.(name) ??
        name.split("/").pop() ??
        label
      )
        .charAt(0)
        .toUpperCase() || "?",
    projectViewKey: visual?.key ?? fallbackKey,
    size,
    textStyle: { fontSize: Math.max(7, size * 0.65), fontWeight: "600" },
  });
}
