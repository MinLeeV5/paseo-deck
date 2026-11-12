import type { Target } from "../shared/model";

export type WorkspaceNavigationRequest = {
  serverId: string;
  workspaceId: string;
  target?: Target;
};
export type ForkTabRequest = WorkspaceNavigationRequest & {
  target: Extract<Target, { kind: "draft" }>;
  sourceAgentId: string;
};
export type ForkSource = { serverId: string; agentId: string };
export interface ForkNavigationBridge {
  navigateToWorkspace?(request: WorkspaceNavigationRequest): unknown;
  buildDraftWorkspaceAttachmentScopeKey?(draftId: string): string;
  useWorkspaceAttachmentsStore?: {
    getState(): {
      attachmentsByScope: Record<
        string,
        readonly { kind: string; source?: ForkSource }[] | undefined
      >;
    };
  };
}
type NavigationModule = {
  navigateToWorkspace: NonNullable<ForkNavigationBridge["navigateToWorkspace"]>;
};
type Route = {
  readSource(draftId: string): ForkSource | undefined;
  open(request: ForkTabRequest): boolean;
};
const patches = new WeakMap<
  NavigationModule,
  {
    original: NavigationModule["navigateToWorkspace"];
    wrapped: NavigationModule["navigateToWorkspace"];
    routes: Set<Route>;
  }
>();

// Native forks prepare their history attachment before opening a draft. Use
// that source identity to route only forks, leaving other workspace navigation
// and the native history/settings preparation intact.
export function installForkTabNavigation(
  module: NavigationModule,
  readSource: Route["readSource"],
  open: Route["open"],
): () => void {
  let patch = patches.get(module);
  if (!patch) {
    const original = module.navigateToWorkspace;
    const routes = new Set<Route>();
    const wrapped: NavigationModule["navigateToWorkspace"] = (request) => {
      const target = request.target;
      if (target?.kind === "draft") {
        for (const route of [...routes].reverse()) {
          const source = route.readSource(target.draftId);
          if (
            source?.serverId === request.serverId &&
            route.open({ ...request, target, sourceAgentId: source.agentId })
          )
            return;
        }
      }
      return original(request);
    };
    module.navigateToWorkspace = wrapped;
    patch = { original, wrapped, routes };
    patches.set(module, patch);
  }
  const current = patch;
  const route = { readSource, open };
  current.routes.add(route);
  return () => {
    current.routes.delete(route);
    if (!current.routes.size) {
      if (module.navigateToWorkspace === current.wrapped)
        module.navigateToWorkspace = current.original;
      if (patches.get(module) === current) patches.delete(module);
    }
  };
}
