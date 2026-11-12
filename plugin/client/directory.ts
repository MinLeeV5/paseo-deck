import { usePaseo } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { NativeBridge } from "./native-types";
import type {
  PaseoAgent,
  PaseoProject,
  PaseoWorkspace,
  PaseoTerminal,
} from "@getpaseo/client";

export type Directory = {
  workspaces: PaseoWorkspace[];
  projects: PaseoProject[];
  agents: PaseoAgent[];
  terminals: (PaseoTerminal & { title?: string | null })[];
};
export const workspaceLabel = (workspace: PaseoWorkspace) =>
  `${workspace.projectCustomName ?? workspace.projectDisplayName} / ${workspace.title ?? workspace.name}`;
export const isRunning = (agent: Pick<PaseoAgent, "status">) =>
  agent.status === "running" || agent.status === "initializing";
export function useDirectory(
  hostId: string,
  active: boolean,
  pickerOpen: boolean,
  bridge?: NativeBridge,
) {
  const paseo = usePaseo();
  const cache = useQueryClient();
  const key = ["split-directory-v2", hostId];
  const latest = useRef(new Map<string, PaseoAgent>());
  const latestWorkspaces = useRef(new Map<string, PaseoWorkspace>());
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Directory> => {
      // The public terminal projection omits the user-assigned title.
      // Borrow the host client so renamed tabs also restore their native title.
      const client = bridge?.getHostRuntimeStore().getClient(hostId);
      const [workspaces, projects, agents, terminals] = await Promise.all([
        paseo.workspaces.list({ page: { limit: 200 } }),
        paseo.projects.list(),
        paseo.agents.list({ page: { limit: 200 } }),
        client
          ? client.listTerminals().then((result) => result.terminals)
          : paseo.terminals.list().then((result) => result.entries),
      ]);
      return {
        workspaces: workspaces.entries.map((workspace) => {
          const observed = latestWorkspaces.current.get(workspace.id);
          return observed?.syncSeq !== undefined &&
            workspace.syncSeq !== undefined &&
            observed.syncSeq > workspace.syncSeq
            ? observed
            : workspace;
        }),
        projects: projects.projects,
        agents: agents.entries.map(({ agent }) => {
          const update = latest.current.get(agent.id);
          return update && update.updatedAt >= agent.updatedAt ? update : agent;
        }),
        terminals,
      };
    },
    enabled: active && Boolean(bridge),
    staleTime: 15000,
    refetchInterval: pickerOpen && active ? 15000 : false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let release: (() => Promise<void>) | undefined;
    let removeSnapshot: (() => void) | undefined;
    const apply = (workspace: PaseoWorkspace) => {
      latestWorkspaces.current.set(workspace.id, workspace);
      cache.setQueryData<Directory>(
        ["split-directory-v2", hostId],
        (current) => {
          if (!current) return current;
          const old = current.workspaces.find(
            (value) => value.id === workspace.id,
          );
          if (
            old &&
            old.name === workspace.name &&
            old.title === workspace.title &&
            old.workspaceDirectory === workspace.workspaceDirectory &&
            old.projectDisplayName === workspace.projectDisplayName &&
            old.projectRootPath === workspace.projectRootPath &&
            old.projectCustomName === workspace.projectCustomName &&
            old.projectCustomIconRevision ===
              workspace.projectCustomIconRevision &&
            JSON.stringify(old.scripts) === JSON.stringify(workspace.scripts)
          )
            return current;
          return {
            ...current,
            workspaces: old
              ? current.workspaces.map((value) =>
                  value.id === workspace.id ? workspace : value,
                )
              : [...current.workspaces, workspace].slice(0, 200),
          };
        },
      );
    };
    const removeListener = paseo.workspaces.subscribe((update) => {
      if (update.kind === "upsert") apply(update.workspace);
      else if (update.kind === "remove") {
        latestWorkspaces.current.delete(update.id);
        cache.setQueryData<Directory>(
          ["split-directory-v2", hostId],
          (current) =>
            current && {
              ...current,
              workspaces: current.workspaces.filter(
                (workspace) => workspace.id !== update.id,
              ),
            },
        );
      }
    });
    void paseo.workspaces
      .list({ page: { limit: 200 }, subscribe: {} })
      .then((result) => {
        release = () => result.subscription.release();
        if (stopped) {
          void release().catch(console.error);
          return;
        }
        removeSnapshot = result.subscription.subscribe({
          snapshot: (snapshot) => {
            for (const workspace of snapshot.entries) apply(workspace);
          },
          update: (message) => {
            if (
              message.type === "workspace_update" &&
              message.payload.kind === "upsert"
            )
              apply(message.payload.workspace);
          },
        });
      })
      .catch((error) => {
        if (!stopped) console.error("[Paseo Deck workspace directory]", error);
      });
    return () => {
      stopped = true;
      removeListener();
      removeSnapshot?.();
      void release?.().catch(console.error);
      latestWorkspaces.current.clear();
    };
  }, [paseo, cache, hostId, active]);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let release: (() => Promise<void>) | undefined;
    let removeSnapshot: (() => void) | undefined;
    const controller = new AbortController();
    const apply = (agent: PaseoAgent) => {
      latest.current.delete(agent.id);
      latest.current.set(agent.id, agent);
      if (latest.current.size > 200)
        latest.current.delete(latest.current.keys().next().value!);
      cache.setQueryData<Directory>(
        ["split-directory-v2", hostId],
        (current) => {
          if (!current) return current;
          const previous = current.agents.find((item) => item.id === agent.id);
          // Streaming metadata does not rebuild every Tab. Only visible directory
          // fields and lifecycle changes need to update this lightweight cache.
          if (
            previous &&
            previous.title === agent.title &&
            previous.status === agent.status &&
            previous.workspaceId === agent.workspaceId &&
            previous.cwd === agent.cwd
          )
            return current;
          return {
            ...current,
            agents: previous
              ? current.agents.map((item) =>
                  item.id === agent.id ? agent : item,
                )
              : [agent, ...current.agents].slice(0, 200),
          };
        },
      );
    };
    const removeListener = paseo.agents.subscribe((update) => {
      if (update.kind === "upsert") apply(update.agent);
    });
    // subscribe() only listens to this API scope. Own one metadata observation
    // while the page is active; it does not request Agent timelines or tokens.
    void paseo.agents
      .list({ page: { limit: 200 }, subscribe: {}, signal: controller.signal })
      .then((result) => {
        release = result.subscription
          ? () => result.subscription!.release()
          : undefined;
        if (stopped) {
          void release?.().catch((error) =>
            console.error("[Paseo Deck directory cleanup]", error),
          );
          return;
        }
        if (result.subscription)
          removeSnapshot = result.subscription.subscribe({
            snapshot: (snapshot) => {
              for (const { agent } of snapshot.entries) apply(agent);
            },
            update: () => {},
          });
        else for (const { agent } of result.entries) apply(agent);
      })
      .catch((error) => {
        if (!stopped) console.error("[Paseo Deck agent directory]", error);
      });
    return () => {
      stopped = true;
      removeListener();
      removeSnapshot?.();
      controller.abort();
      void release?.().catch((error) =>
        console.error("[Paseo Deck directory cleanup]", error),
      );
      latest.current.clear();
    };
  }, [paseo, cache, hostId, active]);
  return query;
}
