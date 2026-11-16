import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { findMetroModule } from "./model.ts";

export const nativeExports = [
  "WorkspacePaneContent",
  "WorkspaceTabPresentationResolver",
  "StatusIcon",
  "StatusRing",
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
  "navigateToWorkspace",
  "buildDraftWorkspaceAttachmentScopeKey",
  "useWorkspaceAttachmentsStore",
  "SubagentsTrack",
] as const;
// 0.16 shares the overlay registry across web and hardware keyboards. Keep
// Deck's bridge key stable while reading the export supplied by each build.
function nativeExportNames(name: string): readonly string[] {
  return name === "hasActiveWebOverlay"
    ? ["hasActiveOverlay", "hasActiveWebOverlay"]
    : [name];
}

export function readNativeExport(
  module: Record<string, unknown>,
  name: string,
): unknown {
  for (const candidate of nativeExportNames(name)) {
    if (module[candidate] !== undefined) return module[candidate];
  }
  return undefined;
}

function findNativeModule(source: string, name: string): number {
  // The plugin SDK also exports useTranslation, with a different contract.
  // getI18n identifies the host's react-i18next module unambiguously.
  const candidates =
    name === "useTranslation" ? ["getI18n"] : nativeExportNames(name);
  for (const candidate of candidates) {
    try {
      return findMetroModule(source, candidate);
    } catch {
      // Try the equivalent export in another supported Paseo release.
    }
  }
  throw new Error(
    `此 Paseo 构建没有可识别的 ${name} 入口（已检查 ${candidates.join(" / ")}）。`,
  );
}

export function resolveNativeModules(source: string): Record<string, number> {
  return Object.fromEntries([
    ...nativeExports.map((name) => [name, findNativeModule(source, name)]),
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
