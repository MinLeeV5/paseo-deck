import type { ComponentType, ReactNode } from "react";
import type { Target } from "../shared/model";

type UI = ComponentType<{ children?: ReactNode; [key: string]: unknown }>;
type NativeTab = { tabId: string; target: Target };
type MenuEntry =
  | { kind: "separator" | "file-panel-open-with"; key: string }
  | {
      kind: "item";
      key: string;
      label: string;
      icon: string;
      hint?: string;
      tooltip?: string;
      disabled?: boolean;
      destructive?: boolean;
      testID: string;
      onSelect(): void;
    };

export interface TabMenuBridge {
  ContextMenuTrigger: UI;
  WorkspaceTabRenameModal: UI;
  useMenuContext(name: string): {
    open: boolean;
    setOpen(open: boolean): void;
    setAnchorRect(rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    }): void;
  };
  useFilePanelOpenWithMenu(
    identity: { serverId: string; workspaceId: string; tabId: string },
    testID: string,
  ): { trigger: ReactNode; pages: unknown[] };
  buildWorkspaceTabMenuEntries(input: {
    surface: "desktop";
    tab: NativeTab;
    index: number;
    tabCount: number;
    menuTestIDBase: string;
    onCopyResumeCommand(agentId: string): void;
    onCopyAgentId(agentId: string): void;
    onCopyTerminalId(terminalId: string): void;
    onCopyFilePath(path: string): void;
    onReloadAgent(agentId: string): void;
    onRenameTab(tab: NativeTab): void;
    onCloseTab(tabId: string): void;
    onCloseTabsBefore(tabId: string): void;
    onCloseTabsAfter(tabId: string): void;
    onCloseOtherTabs(tabId: string): void;
  }): MenuEntry[];
  buildProviderCommand(input: {
    provider: string;
    id: "resume";
    sessionId: string;
  }): string | null;
  copyToClipboard(text: string): Promise<void>;
  useTranslation(): { t(key: string): string };
  useToast(): {
    copied(message: string): void;
    error(message: string): void;
    show(
      message: string,
      options?: { durationMs?: number | null; variant?: string },
    ): void;
  };
}

export interface TabMutationClient {
  updateAgent(agentId: string, update: { name: string }): Promise<unknown>;
  renameTerminal(input: { terminalId: string; title: string }): Promise<{
    success: boolean;
    error?: string;
  }>;
}
