import type { DatabaseContext } from "../../db/connection";
import {
  ensureExternalConnectionState,
  findExternalConnection,
  findExternalConnectionState,
  setExternalConnectionNonce,
} from "../../db/queries";
import {
  defaultServiceRuntime,
  runtimeNow,
  type ServiceRuntime,
} from "../../services/runtime";
import { KrakenProviderError } from "./errors";
import type { KrakenNonceSource } from "./types";

export class KrakenNonceService implements KrakenNonceSource {
  constructor(
    private readonly context: DatabaseContext,
    private readonly runtime: ServiceRuntime = defaultServiceRuntime,
  ) {}

  next(connectionId: string): string {
    return this.context.db.transaction(
      (transaction) => {
        if (!findExternalConnection(transaction, connectionId)) {
          throw new KrakenProviderError(
            "CONFIG_ERROR",
            "Kraken connection configuration was not found.",
          );
        }
        const now = runtimeNow(this.runtime);
        ensureExternalConnectionState(transaction, connectionId, now);
        const state = findExternalConnectionState(transaction, connectionId);
        if (!state || !/^\d+$/.test(state.lastNonceText)) {
          throw new KrakenProviderError(
            "NONCE_ERROR",
            "Stored Kraken nonce state is invalid.",
          );
        }

        const nowMilliseconds = BigInt(Date.parse(now));
        const previous = BigInt(state.lastNonceText);
        const next =
          nowMilliseconds > previous ? nowMilliseconds : previous + 1n;
        const nextText = next.toString();
        setExternalConnectionNonce(transaction, connectionId, nextText, now);
        return nextText;
      },
      { behavior: "immediate" },
    );
  }
}
