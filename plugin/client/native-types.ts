import type { ComponentType, ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { Pane, Target } from "../shared/model";
import type { WorkspaceBridge } from "./workspace-types";
import type { TabMenuBridge } from "./tab-menu-types";
import type { Directory } from "./directory";

export type NativeStatusBucket =
  | "needs_input"
  | "failed"
  | "running"
  | "attention"
  | "done";

export interface NativeTabPresentation {
  label: string;
  titleState: "ready" | "loading";
  statusBucket: NativeStatusBucket | null;
}

export interface NativePaneInput {
  tab: {
    tabId: string;
    key: string;
    kind: string;
    target: Target;
    state?: Pane["state"];
  };
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  host: "main" | "sheet";
  panelRevision: number;
  onOpenTab(target: Target): void;
  onOpenPreferredTarget(target: Target, source?: unknown): void;
  onOpenTargetToSide(target: Target): void;
  onCloseCurrentTab(): void;
  onRetargetCurrentTab(target: Target): void;
  onSetCurrentTabState(state: Pane["state"]): void;
  onOpenWorkspaceFile(request: {
    location: { path: string; lineStart?: number; lineEnd?: number };
    disposition: string;
  }): void;
  onOpenImportSheet(): void;
}
export interface ProjectIconTarget {
  projectViewKey: string;
  serverId: string;
  projectId: string;
  iconWorkingDir: string;
  customIconRevision?: string | null;
  iconRevision?: string;
}
export interface NativeBridge extends WorkspaceBridge, TabMenuBridge {
  WorkspaceTabPresentationResolver: ComponentType<{
    tab: NativePaneInput["tab"];
    serverId: string;
    workspaceId: string;
    children(presentation: NativeTabPresentation): ReactNode;
  }>;
  StatusIcon: ComponentType<{
    statusBucket: NativeStatusBucket | null;
    size: number;
    backdrop: "surface0" | "surface1" | "surface2";
    children?: ReactNode;
  }>;
  projectIconPlaceholderLabelFromDisplayName?(name: string): string;
  useProjectIcons(input: {
    projects: ProjectIconTarget[];
  }): Map<string, string | null>;
  ProjectIconView: ComponentType<{
    iconDataUri: string | null;
    initial: string;
    projectViewKey: string;
    size: number;
    textStyle?: unknown;
  }>;

  useShortcutKeys(action: string): string[][] | null;
  useKeyboardActionDispatcher(): {
    dispatch(action: { id: string; scope: string }): boolean;
  };
  hasActiveWebOverlay(): boolean;
  queryClient: QueryClient;
  bundleName: string;
  moduleIds: Record<string, number>;
  SheetPaneHostProvider?: ComponentType<{
    value: unknown;
    children?: ReactNode;
  }>;
  WorkspaceComposerEditingSessionsProvider: ComponentType<{
    workspaceKey: string;
    tabIds: readonly string[];
    children?: ReactNode;
  }>;
  ComposerEditingSessionsProvider: ComponentType<{ children?: ReactNode }>;
  WorkspaceFocusProvider: ComponentType<{
    workspaceKey: string;
    children?: ReactNode;
  }>;
  DiffDocumentWorkspaceCacheProvider: ComponentType<{ children?: ReactNode }>;
  AssistantFileLinkResolverProvider: ComponentType<{
    client: unknown;
    serverId: string;
    workspaceRoot?: string;
    onOpenWorkspaceFile(request: {
      path: string;
      lineStart?: number;
      lineEnd?: number;
    }): void;
    children?: ReactNode;
  }>;
  useHostRuntimeClient(serverId: string): unknown;
  useWorkspaceDirectory(serverId: string, workspaceId: string): string | null;
  getPanelInstanceAttributes(identity: {
    serverId: string;
    workspaceId: string;
    tabId: string;
  }): { modified: boolean; suspendPendingSave?: () => () => void };
  confirmDialog(options: {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    destructive: boolean;
  }): Promise<boolean>;
  getHostRuntimeStore(): {
    getClient(serverId: string): {
      listTerminals(): Promise<{ terminals: Directory["terminals"] }>;
    } | null;
    prepareAgentTimeline(serverId: string, agentId: string): Promise<unknown>;
  };
  useSessionStore(
    selector: (state: {
      sessions: Record<
        string,
        | {
            viewedTimelineSync?: {
              replaceVisibleAgentIds(owner: string, ids: string[]): void;
            };
          }
        | undefined
      >;
    }) => { replaceVisibleAgentIds(owner: string, ids: string[]): void } | null,
  ): { replaceVisibleAgentIds(owner: string, ids: string[]): void } | null;
  useIsFocused(): boolean;
  RetainedPanelActivity: ComponentType<{
    active: boolean;
    children?: ReactNode;
  }>;
  WorkspacePaneContent: ComponentType<{
    content: unknown;
    isWorkspaceFocused: boolean;
    isPaneFocused: boolean;
    onFocusPane(): void;
  }>;
  buildWorkspacePaneContentModel(input: NativePaneInput): unknown;
  hasPanel(kind: string): boolean;
}
