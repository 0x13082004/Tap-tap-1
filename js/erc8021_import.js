import { Attribution } from "https://esm.sh/ox/erc8021";

export function toDataSuffix(builderCode) {
  return Attribution.toDataSuffix({
    codes: [builderCode],
  });
}
