import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures: string[] = [];

function filesUnder(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path).flatMap((name) => {
    const target = join(path, name);
    return statSync(target).isDirectory() ? filesUnder(target) : [target];
  });
}

function assertAbsent(
  files: readonly string[],
  patterns: readonly RegExp[],
  label: string,
): void {
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        failures.push(
          label + ": " + relative(root, file) + " matched " + pattern.source,
        );
      }
    }
  }
}

const sourceExtensions = /\.(?:ts|tsx|js|jsx|css)$/;
const clientBoundaryFiles = [
  ...filesUnder(join(root, "src/app")),
  ...filesUnder(join(root, "src/components")),
].filter((file) => sourceExtensions.test(file));
assertAbsent(
  clientBoundaryFiles,
  [
    /\bKRAKEN_API_KEY\b/,
    /\bKRAKEN_API_SECRET\b/,
    /\bALCHEMY_API_KEY\b/,
    /\bapiSecret\b/,
  ],
  "Client/UI secret boundary",
);

const persistenceFiles = [
  ...filesUnder(join(root, "src/db")),
  join(root, "src/domain/backup.ts"),
].filter((file) => sourceExtensions.test(file));
assertAbsent(
  persistenceFiles,
  [
    /\bKRAKEN_API_KEY\b/,
    /\bKRAKEN_API_SECRET\b/,
    /\bALCHEMY_API_KEY\b/,
    /\bapiSecret\b/,
  ],
  "Persistence secret boundary",
);

const providerFiles = filesUnder(join(root, "src/providers/kraken")).filter(
  (file) => /\.(?:ts|tsx)$/.test(file),
);
assertAbsent(
  providerFiles,
  [
    /\/0\/private\/AddOrder/,
    /\/0\/private\/CancelOrder/,
    /\/0\/private\/Withdraw/,
    /\/0\/private\/Earn/,
  ],
  "Forbidden Kraken write endpoint",
);

const evmProviderFiles = filesUnder(join(root, "src/providers/evm")).filter(
  (file) => /\.(?:ts|tsx)$/.test(file),
);

const evmProviderFilesOutsideRegistry = evmProviderFiles.filter(
  (file) => !file.endsWith("/chain-registry.ts"),
);
assertAbsent(
  evmProviderFilesOutsideRegistry,
  [
    /https:\/\/eth-mainnet\.g\.alchemy\.com/,
    /https:\/\/base-mainnet\.g\.alchemy\.com/,
    /https:\/\/arb-mainnet\.g\.alchemy\.com/,
  ],
  "Alchemy fixed origin outside EVM chain registry",
);

const applicationSourceFiles = filesUnder(join(root, "src")).filter((file) =>
  /\.(?:ts|tsx)$/.test(file),
);
assertAbsent(
  applicationSourceFiles,
  [
    /process\.env\.[A-Z0-9_]*(?:RPC_URL|RPC_ORIGIN|RPC_HOST)/,
    /process\.env\[["'][A-Z0-9_]*(?:RPC_URL|RPC_ORIGIN|RPC_HOST)["']\]/,
  ],
  "Arbitrary EVM RPC environment configuration",
);
assertAbsent(
  evmProviderFiles,
  [
    /eth_sendTransaction/,
    /eth_sendRawTransaction/,
    /eth_sign(?:Transaction|TypedData)?/,
    /personal_/,
    /wallet_/,
    /ALCHEMY_BASE_URL/,
  ],
  "Forbidden EVM write/sign method or custom RPC configuration",
);

const envExample = readFileSync(join(root, ".env.example"), "utf8");
for (const name of ["KRAKEN_API_KEY", "KRAKEN_API_SECRET", "ALCHEMY_API_KEY"]) {
  const expected = name + "=";
  const line = envExample
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(expected));
  if (line !== expected) {
    failures.push(
      ".env.example must keep " + name + " as an empty placeholder.",
    );
  }
}

const staticFiles = filesUnder(join(root, ".next/static"));
assertAbsent(
  staticFiles,
  [
    /\bKRAKEN_API_KEY\b/,
    /\bKRAKEN_API_SECRET\b/,
    /\bALCHEMY_API_KEY\b/,
    /sentinel-api-key/,
    /sentinel-alchemy-key/,
    /c2VjcmV0LWJ5dGVz/,
  ],
  "Built client bundle secret boundary",
);

if (failures.length > 0) {
  throw new Error(
    "External sync security check failed:\n" + failures.join("\n"),
  );
}

console.log("External sync security boundaries verified.");
