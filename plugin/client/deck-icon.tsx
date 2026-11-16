import type { PluginIconProps } from "@getpaseo/plugin/client";
import { Image } from "react-native";
import { deckIconUri } from "./deck-icon-data";

const source = { uri: deckIconUri };

export function DeckIcon({ size }: PluginIconProps) {
  return (
    <Image
      testID="paseo-deck-icon"
      source={source}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessible={false}
    />
  );
}
