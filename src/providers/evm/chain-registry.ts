import {
  evmChainIdentity,
  type EvmChainId,
  type EvmChainIdentity,
} from "../../domain/evm";

export type AlchemyOrigin =
  | "https://eth-mainnet.g.alchemy.com"
  | "https://base-mainnet.g.alchemy.com"
  | "https://arb-mainnet.g.alchemy.com";

export interface EvmChainConfig extends EvmChainIdentity {
  alchemyOrigin: AlchemyOrigin;
}

const ALCHEMY_ORIGINS: Record<EvmChainId, AlchemyOrigin> = {
  1: "https://eth-mainnet.g.alchemy.com",
  8453: "https://base-mainnet.g.alchemy.com",
  42161: "https://arb-mainnet.g.alchemy.com",
};

export function evmChainConfig(chainId: EvmChainId): EvmChainConfig {
  return {
    ...evmChainIdentity(chainId),
    alchemyOrigin: ALCHEMY_ORIGINS[chainId],
  };
}
