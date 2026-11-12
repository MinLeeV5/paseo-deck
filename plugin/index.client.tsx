import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SplitBoard } from "./client/board";
import { DeckSidebarItem } from "./client/sidebar-item";
import { disposeNativeComposerSync } from "./client/web";

export default function contribute(client: PluginClientContext) {
  client.addScreen({
    id: "main",
    // Paseo requires a non-empty title; leave the header label visually empty.
    title: "\u200B",
    Component: SplitBoard,
  });
  client.addSidebarHeaderItem({
    id: "main",
    title: "Paseo Deck",
    Component: DeckSidebarItem,
  });
  client.addCommandCenterItem({
    id: "open-deck",
    title: "打开 Paseo Deck",
    icon: "PanelsTopLeft",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "main" });
    },
  });
  return disposeNativeComposerSync;
}
