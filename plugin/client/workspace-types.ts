import type { ComponentType, ReactNode } from "react";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { Pane, Target } from "../shared/model";

type UI = ComponentType<{ children?: ReactNode; [key: string]: unknown }>;
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
  workspacePanels: {
    id: string;
    context: "workspace" | "agent";
    title: string;
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
  pluginIconComponent(icon: PluginIcon): ComponentType<{ size: number; color: string; [key: string]: unknown }>;
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
