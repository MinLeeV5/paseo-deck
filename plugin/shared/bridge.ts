import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { findMetroModule } from "./model";

export const nativeExports = [
  "WorkspacePaneContent",
  "getPanelRegistration",
  "ensurePanelsRegistered",
  "WorkspaceComposerEditingSessionsProvider",
  "ComposerEditingSessionsProvider",
  "WorkspaceFocusProvider",
  "DiffDocumentWorkspaceCacheProvider",
  "AssistantFileLinkResolverProvider",
  "useHostRuntimeClient",
  "useWorkspaceDirectory",
  "getHostRuntimeStore",
  "useSessionStore",
  "useIsFocused",
  "RetainedPanelActivity",
  "getPanelInstanceAttributes",
  "confirmDialog",
  "useShortcutKeys",
  "useKeyboardActionDispatcher",
  "hasActiveWebOverlay",
  "useProjectIcons",
  "ProjectIconView",
  "WorkspaceScriptsButton",
  "WorkspaceOpenInEditorButton",
  "MenuRoot",
  "MenuTrigger",
  "MenuSurface",
  "MenuItem",
  "MenuSubTrigger",
  "MenuSeparator",
  "PluginEnvironmentProvider",
  "PluginInstallationProvider",
  "PluginClientStateProvider",
  "createPluginClientStateSource",
  "useInstalledPlugin",
  "usePublishPanelInstanceAttributes",
  "usePaneContext",
  "createPluginNavigation",
  "pluginIconComponent",
] as const;
// Sheet panes were added after 0.13. Older builds do not use this context.
export const optionalNativeExports = [
  "SheetPaneHostProvider",
  "projectIconPlaceholderLabelFromDisplayName",
  "getIsElectron",
  "createWorkspaceBrowser",
] as const;
export function resolveNativeModules(source: string): Record<string, number> {
  return Object.fromEntries([
    ...nativeExports.map((name) => [name, findMetroModule(source, name)]),
    ["queryClient", findMetroModule(source, "queryClient")],
    ["pluginButtonStore", findMetroModule(source, "pluginButtonStore")],
    ...optionalNativeExports.flatMap((name) => {
      try {
        return [[name, findMetroModule(source, name)]];
      } catch {
        return [];
      }
    }),
  ]);
}
export const bridgeInfoRpc = defineRpc({
  name: "bridge.info",
  input: z.object({}),
  output: z.object({
    bundleName: z.string(),
    moduleIds: z.record(z.string(), z.number().int()),
  }),
});
