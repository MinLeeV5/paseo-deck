import type { ComponentType, ReactNode } from "react";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { Pane, Target } from "../shared/model";
import type { PaseoWorkspace } from "@getpaseo/client";

type UI = ComponentType<{ children?: ReactNode; [key: string]: unknown }>;
type ServiceLink = { kind: string; label: string; url: string };
type OpenTarget =
  | {
      source: "desktop";
      id: string;
      label: string;
      icon: unknown;
      openInput: Record<string, unknown>;
    }
  | { source: "forge"; id: string; label: string; url: string };
export type PluginIcon = unknown;
export type ButtonBehavior =
  | { kind: "action" }
  | { kind: "popover"; Content: UI }
  | { kind: "menu"; items: ButtonItem[] };
export type ButtonItem =
  | { kind: "separator"; id: string }
  | {
      kind: "item";
      id: string;
      title: string;
      icon?: PluginIcon;
      visible?: boolean;
      disabled?: boolean;
      behavior: ButtonBehavior;
    };
export type InstalledPlugin = {
  id: string;
  serverId: string;
  locale?: string;
  i18n?: { resolve(message: unknown, locale?: string): string };
  workspacePanels: {
    id: string;
    context: "workspace" | "agent";
    title: unknown;
    Component: UI;
  }[];
  [key: string]: unknown;
};
export type PluginButton = {
  key: number;
  id: string;
  installation: InstalledPlugin;
  placement: "header" | "composer";
  context: { workspaceId: string; context: string; agentId?: string };
  button: {
    title: string;
    label?: string;
    icon: PluginIcon;
    visible: boolean;
    disabled: boolean;
    behavior: ButtonBehavior;
  };
  pending: boolean;
};
export type PluginPanelRequest = {
  serverId: string;
  workspaceId: string;
  pluginId: string;
  panelId: string;
  context: "workspace" | "agent";
  agentId?: string;
  location?: "workspace" | "explorer";
};
export interface WorkspaceBridge {
  useWorkspaceScriptActions(input: {
    serverId: string;
    workspaceId: string;
    scripts: PaseoWorkspace["scripts"];
    onScriptTerminalStarted(id: string): void;
  }): {
    start(name: string): void;
    stop(name: string): void;
    restart(name: string): void;
    copyUrl(link: ServiceLink): void;
    selectRoute(kind: string): void;
    resolveLinks(script: PaseoWorkspace["scripts"][number]): {
      selected: ServiceLink | null;
      targets: ServiceLink[];
    };
    isStartPending: boolean;
    isStopPending: boolean;
  };
  usePreferredEditor(input: { serverId: string; projectId: string | null }): {
    preferredEditorId: string | null | undefined;
    updatePreferredEditor(id: string): Promise<void>;
  };
  resolvePreferredEditorId(
    ids: string[],
    preferred: string | null | undefined,
  ): string | null;
  useDesktopOpenTargets(input: {
    isLocalExecution: boolean;
    workspacePath: string;
  }): { targets: unknown[]; isAvailable: boolean };
  useHostRuntimeIsConnected(serverId: string): boolean;
  useIsLocalDaemon(serverId: string): boolean;
  useCheckoutStatusQuery(input: { serverId: string; cwd: string }): {
    status: unknown;
  };
  useCheckoutPrStatusQuery(input: { serverId: string; cwd: string }): {
    resolvedForge: unknown;
  };
  planWorkspaceOpenTargets(input: Record<string, unknown>): OpenTarget[];
  openDesktopTarget(input: Record<string, unknown>): Promise<void>;
  openExternalUrl(url: string): Promise<void>;
  EditorTargetIcon: UI;
  useWorkspaceFields<T>(
    serverId: string,
    workspaceId: string,
    select: (workspace: PaseoWorkspace) => T,
  ): T | null;
  pluginIconComponent(
    icon: PluginIcon,
  ): ComponentType<{ size: number; color: string; [key: string]: unknown }>;
  WorkspaceScriptsButton: UI;
  WorkspaceOpenInEditorButton: UI;
  MenuRoot: UI;
  MenuTrigger: UI;
  MenuSurface: UI;
  MenuItem: UI;
  MenuSubTrigger: UI;
  MenuSeparator: UI;
  PluginEnvironmentProvider: UI;
  PluginInstallationProvider: UI;
  PluginClientStateProvider: UI;
  createPluginClientStateSource(serverId: string): unknown;
  useInstalledPlugin(
    serverId: string,
    pluginId: string,
  ): InstalledPlugin | null;
  usePublishPanelInstanceAttributes(value: { modified: boolean }): void;
  usePaneContext(): {
    state?: Pane["state"];
    setCurrentTabState(state: Pane["state"]): void;
  };
  pluginButtonStore: {
    subscribe(listener: () => void): () => void;
    getSnapshot(): PluginButton[];
    run(key: number, path?: string[]): Promise<void>;
  };
  createPluginNavigation(input: {
    serverId: string;
    workspaceId: string | null;
  }): {
    openWorkspacePanel(
      pluginId: string,
      panelId: string,
      location?: string,
    ): void;
    openAgentPanel(
      pluginId: string,
      panelId: string,
      agentId: string,
      location?: string,
    ): void;
    [key: string]: unknown;
  };
  getIsElectron?(): boolean;
  createWorkspaceBrowser?(input: { initialUrl: string }): { browserId: string };
}
export type SplitPluginContextValue = {
  pane: Pane;
  theme: PluginScreenProps["theme"];
  compact: boolean;
  open(target: Target, workspaceId: string): void;
};
