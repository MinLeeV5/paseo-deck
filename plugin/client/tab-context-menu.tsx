import { usePaseo } from "@getpaseo/plugin/client";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Text, type PressableProps } from "react-native";
import type { Pane, RelatedTabs } from "../shared/model";
import type { Directory } from "./directory";
import type { NativeBridge } from "./native-types";
import type { TabMutationClient } from "./tab-menu-types";
import { onTabContextMenuKeys } from "./web";

const icons = {
  copy: "Copy",
  pencil: "Pencil",
  "arrow-left-to-line": "ArrowLeftToLine",
  "arrow-right-to-line": "ArrowRightToLine",
  "copy-x": "CopyX",
  "rotate-cw": "RotateCw",
  x: "X",
} as const;

export function TabContextMenu({
  pane,
  nativeTabId,
  title,
  index,
  tabCount,
  directory,
  bridge,
  theme,
  onClose,
  onCloseRelated,
  onResourceChanged,
  children,
}: {
  pane: Pane;
  nativeTabId: string;
  title: string;
  index: number;
  tabCount: number;
  directory?: Directory;
  bridge: NativeBridge;
  theme: PluginScreenProps["theme"];
  onClose(tabId: string): void;
  onCloseRelated(tabId: string, scope: RelatedTabs): void;
  onResourceChanged(): Promise<unknown>;
  children: ReactNode;
}) {
  const paseo = usePaseo();
  const client = bridge.useHostRuntimeClient(
    pane.serverId,
  ) as TabMutationClient | null;
  const toast = bridge.useToast();
  const { t } = bridge.useTranslation();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const testID = `split-tab-context-${pane.id}`;
  const openWith = bridge.useFilePanelOpenWithMenu(
    {
      serverId: pane.serverId,
      workspaceId: pane.workspaceId,
      tabId: nativeTabId,
    },
    testID,
  );
  const run = (action: () => Promise<void>) => {
    void action().catch((error: unknown) =>
      toast.error(error instanceof Error ? error.message : String(error)),
    );
  };
  const copy = async (text: string, message: string) => {
    await bridge.copyToClipboard(text);
    toast.copied(t(message));
  };
  const entries = bridge.buildWorkspaceTabMenuEntries({
    surface: "desktop",
    tab: { tabId: pane.id, target: pane.target },
    index,
    tabCount,
    menuTestIDBase: testID,
    onCopyResumeCommand: (agentId) =>
      run(async () => {
        const agent =
          // A reload may replace the provider session without changing the title
          // or status observed by the lightweight tab directory.
          (await paseo.agents.ref(agentId).refresh())?.agent ??
          directory?.agents.find((agent) => agent.id === agentId);
        const sessionId =
          agent?.runtimeInfo?.sessionId ?? agent?.persistence?.sessionId;
        if (!agent || !sessionId)
          throw new Error(t("workspace.tabs.toasts.resumeIdUnavailable"));
        const command = bridge.buildProviderCommand({
          provider: agent.provider,
          id: "resume",
          sessionId,
        });
        if (!command)
          throw new Error(t("workspace.tabs.toasts.resumeCommandUnavailable"));
        await copy(command, "workspace.tabs.toasts.resumeCommandCopiedLabel");
      }),
    onCopyAgentId: (id) =>
      run(() => copy(id, "workspace.tabs.toasts.agentIdCopiedLabel")),
    onCopyTerminalId: (id) =>
      run(() => copy(id, "workspace.tabs.toasts.terminalIdCopiedLabel")),
    onCopyFilePath: (path) =>
      run(() => copy(path, "workspace.tabs.toasts.filePathCopiedLabel")),
    onRenameTab: () => setRenaming(true),
    onReloadAgent: (agentId) =>
      run(async () => {
        toast.show(t("workspace.tabs.toasts.reloadingAgent"), {
          durationMs: null,
        });
        await paseo.agents.ref(agentId).reload();
        await bridge
          .getHostRuntimeStore()
          .prepareAgentTimeline(pane.serverId, agentId);
        toast.show(t("workspace.tabs.toasts.reloadedAgent"), {
          variant: "success",
        });
      }),
    onCloseTab: onClose,
    onCloseTabsBefore: (id) => onCloseRelated(id, "before"),
    onCloseTabsAfter: (id) => onCloseRelated(id, "after"),
    onCloseOtherTabs: (id) => onCloseRelated(id, "others"),
  });
  const renameTarget =
    pane.target.kind === "agent"
      ? { kind: "agent", id: pane.target.agentId, currentTitle: title }
      : pane.target.kind === "terminal"
        ? { kind: "terminal", id: pane.target.terminalId, currentTitle: title }
        : null;

  return (
    <>
      <bridge.MenuRoot open={open} onOpenChange={setOpen} compactMode="sheet">
        {children}
        <bridge.MenuSurface
          testID={testID}
          align="start"
          width={240}
          maxHeight={440}
          scrollable
          sheetTitle={title}
          pages={openWith.pages}
        >
          {entries.map((entry) => {
            if (entry.kind === "separator")
              return <bridge.MenuSeparator key={entry.key} />;
            if (entry.kind === "file-panel-open-with")
              return <Fragment key={entry.key}>{openWith.trigger}</Fragment>;
            if (entry.kind !== "item") return null;
            return (
              <bridge.MenuItem
                key={entry.key}
                testID={entry.testID}
                disabled={entry.disabled}
                destructive={entry.destructive}
                tooltip={entry.tooltip}
                onSelect={entry.onSelect}
                leading={
                  <Icon
                    name={icons[entry.icon as keyof typeof icons] ?? "Circle"}
                    size={16}
                    color={theme.colors.foregroundMuted}
                  />
                }
                trailing={
                  entry.hint ? (
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.colors.foregroundMuted,
                      }}
                    >
                      {entry.hint}
                    </Text>
                  ) : undefined
                }
              >
                {entry.label}
              </bridge.MenuItem>
            );
          })}
        </bridge.MenuSurface>
      </bridge.MenuRoot>
      <bridge.WorkspaceTabRenameModal
        renamingTab={renaming ? renameTarget : null}
        onClose={() => setRenaming(false)}
        onSubmit={async (value: string) => {
          if (!client)
            throw new Error(t("workspace.terminal.hostDisconnected"));
          if (!renameTarget) return;
          if (renameTarget.kind === "terminal") {
            const result = await client.renameTerminal({
              terminalId: renameTarget.id,
              title: value.trim(),
            });
            if (!result.success)
              throw new Error(result.error ?? "Failed to rename terminal");
            void bridge.queryClient.invalidateQueries({
              queryKey: ["terminals", pane.serverId],
            });
          } else {
            await client.updateAgent(renameTarget.id, { name: value.trim() });
            void bridge.queryClient.invalidateQueries({
              queryKey: ["sidebarAgentsList", pane.serverId],
            });
            void bridge.queryClient.invalidateQueries({
              queryKey: ["allAgents", pane.serverId],
            });
          }
          await onResourceChanged();
        }}
      />
    </>
  );
}

export function TabMenuTrigger({
  bridge,
  tabId,
  children,
  ...props
}: {
  bridge: NativeBridge;
  tabId: string;
  children: ReactNode;
} & Omit<PressableProps, "children">) {
  const menu = bridge.useMenuContext("SplitTabContextMenu");
  useEffect(
    () =>
      onTabContextMenuKeys(
        tabId,
        (rect) => {
          menu.setAnchorRect(rect);
          menu.setOpen(true);
        },
        menu.open ? () => menu.setOpen(false) : undefined,
      ),
    [tabId, menu.open, menu.setAnchorRect, menu.setOpen],
  );
  return (
    <bridge.ContextMenuTrigger {...props}>{children}</bridge.ContextMenuTrigger>
  );
}
