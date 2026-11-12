import type {
  PluginClientContext,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { SplitBoard } from "./client/board";

function SidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="PanelsTopLeft"
      label="Paseo Deck"
      active={currentScreen?.screenId === "main"}
      onPress={() => {
        if (currentScreen?.screenId !== "main")
          openScreen({ screenId: "main" });
      }}
    />
  );
}
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
    Component: SidebarItem,
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
  return () => {};
}
