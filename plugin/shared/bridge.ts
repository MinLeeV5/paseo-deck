import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { findMetroModule } from "./model";

export const nativeExports = [
  "WorkspacePaneContent",
  "WorkspaceTabPresentationResolver",
  "StatusIcon",
  "getPanelRegistration",
  "ensurePanelsRegistered",
  "WorkspaceComposerEditingSessionsProvider",
  "ComposerEditingSessionsProvider",
  "WorkspaceFocusProvider",
  "DiffDocumentWorkspaceCacheProvider",
  "AssistantFileLinkResolverProvider",
  "useHostRuntimeClient",
  "useWorkspaceDirectory",
  "useWorkspaceFields",
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
  "useWorkspaceScriptActions",
  "usePreferredEditor",
  "resolvePreferredEditorId",
  "useDesktopOpenTargets",
  "openDesktopTarget",
  "planWorkspaceOpenTargets",
  "useCheckoutStatusQuery",
  "useCheckoutPrStatusQuery",
  "useHostRuntimeIsConnected",
  "useIsLocalDaemon",
  "openExternalUrl",
  "EditorTargetIcon",
  "computePosition",
  "MenuRoot",
  "MenuTrigger",
  "MenuSurface",
  "MenuItem",
  "MenuSubTrigger",
  "MenuSeparator",
  "ContextMenuTrigger",
  "useMenuContext",
  "buildWorkspaceTabMenuEntries",
  "WorkspaceTabRenameModal",
  "useFilePanelOpenWithMenu",
  "buildProviderCommand",
  "copyToClipboard",
  "useToast",
  "useTranslation",
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
// These optional host capabilities are not needed by every supported build.
export const optionalNativeExports = [
  "Composer",
  "SheetPaneHostProvider",
  "projectIconPlaceholderLabelFromDisplayName",
  "getIsElectron",
  "createWorkspaceBrowser",
] as const;
export function resolveNativeModules(source: string): Record<string, number> {
  return Object.fromEntries([
    ...nativeExports.map((name) => [
      name,
      // The plugin SDK also exports useTranslation, with a different contract.
      // getI18n identifies the host's react-i18next module unambiguously.
      findMetroModule(source, name === "useTranslation" ? "getI18n" : name),
    ]),
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
