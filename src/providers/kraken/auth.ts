import { createHash, createHmac } from "node:crypto";

import { KrakenProviderError } from "./errors";

export function createKrakenSignature(input: {
  path: `/0/private/${string}`;
  nonce: string;
  body: string;
  apiSecret: string;
}): string {
  if (!/^\d+$/.test(input.nonce)) {
    throw new KrakenProviderError(
      "NONCE_ERROR",
      "Kraken nonce must be unsigned integer text.",
    );
  }

  let secret: Buffer;
  try {
    secret = Buffer.from(input.apiSecret, "base64");
  } catch {
    throw new KrakenProviderError(
      "CONFIG_ERROR",
      "Kraken API secret configuration is invalid.",
    );
  }
  if (secret.length === 0) {
    throw new KrakenProviderError(
      "CONFIG_ERROR",
      "Kraken API secret configuration is invalid.",
    );
  }

  const digest = createHash("sha256")
    .update(input.nonce + input.body)
    .digest();
  return createHmac("sha512", secret)
    .update(Buffer.concat([Buffer.from(input.path), digest]))
    .digest("base64");
}
