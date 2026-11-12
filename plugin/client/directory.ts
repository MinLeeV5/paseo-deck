import { usePaseo } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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
  terminals: PaseoTerminal[];
};
export const workspaceLabel = (workspace: PaseoWorkspace) =>
  `${workspace.projectCustomName ?? workspace.projectDisplayName} / ${workspace.title ?? workspace.name}`;
export const isRunning = (agent: Pick<PaseoAgent, "status">) =>
  agent.status === "running" || agent.status === "initializing";
export function useDirectory(
  hostId: string,
  active: boolean,
  pickerOpen: boolean,
) {
  const paseo = usePaseo();
  const cache = useQueryClient();
  const key = ["split-directory-v2", hostId];
  const latest = useRef(new Map<string, PaseoAgent>());
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Directory> => {
      const [workspaces, projects, agents, terminals] = await Promise.all([
        paseo.workspaces.list({ page: { limit: 200 } }),
        paseo.projects.list(),
        paseo.agents.list({ page: { limit: 200 } }),
        paseo.terminals.list(),
      ]);
      return {
        workspaces: workspaces.entries,
        projects: projects.projects,
        agents: agents.entries.map(({ agent }) => {
          const update = latest.current.get(agent.id);
          return update && update.updatedAt >= agent.updatedAt ? update : agent;
        }),
        terminals: terminals.entries,
      };
    },
    enabled: active,
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
            console.error("[Split directory cleanup]", error),
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
        if (!stopped) console.error("[Split agent directory]", error);
      });
    return () => {
      stopped = true;
      removeListener();
      removeSnapshot?.();
      controller.abort();
      void release?.().catch((error) =>
        console.error("[Split directory cleanup]", error),
      );
      latest.current.clear();
    };
  }, [paseo, cache, hostId, active]);
  return query;
}
