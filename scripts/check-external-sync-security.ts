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

function assertPresent(
  file: string,
  patterns: readonly RegExp[],
  label: string,
) {
  const content = readFileSync(file, "utf8");
  for (const pattern of patterns) {
    if (!pattern.test(content)) {
      failures.push(
        label + ": " + relative(root, file) + " missed " + pattern.source,
      );
    }
  }
}

function assertOrdered(
  file: string,
  markers: readonly string[],
  label: string,
) {
  const content = readFileSync(file, "utf8");
  let cursor = -1;
  for (const marker of markers) {
    const index = content.indexOf(marker, cursor + 1);
    if (index < 0) {
      failures.push(label + ": " + relative(root, file) + " missed " + marker);
      return;
    }
    cursor = index;
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
    /\bCOINGECKO_API_KEY\b/,
    /\bapiSecret\b/,
  ],
  "Client/UI secret boundary",
);

const clientComponentFiles = clientBoundaryFiles.filter((file) =>
  /^\s*["']use client["'];/m.test(readFileSync(file, "utf8")),
);
assertAbsent(
  clientComponentFiles,
  [
    /fast-xml-parser/,
    /csv-parse(?:\/sync)?/,
    /(?:@\/|\.\.\/)+(?:providers\/file-import|services\/file-import-service)/,
  ],
  "Client financial-file parser boundary",
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
    /\bCOINGECKO_API_KEY\b/,
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

const fileImportProviderFiles = filesUnder(
  join(root, "src/providers/file-import"),
).filter((file) => /\.(?:ts|tsx)$/.test(file));
assertAbsent(
  fileImportProviderFiles,
  [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\b(?:axios|got|undici)\b/,
    /from\s+["']node:(?:http|https|net|tls)["']/,
    /https?:\/\//,
  ],
  "Financial-file parser network isolation",
);

const automationPureFiles = [
  join(root, "src/domain/automation.ts"),
  join(root, "src/domain/recurring.ts"),
  join(root, "src/services/automation-projection-service.ts"),
  join(root, "src/services/recurring-calendar-service.ts"),
  join(root, "src/services/recurring-match-service.ts"),
];

const historicalAnalyticsReadFiles = [
  join(root, "src/app/analytics/page.tsx"),
  join(root, "src/services/historical-analytics-service.ts"),
  join(root, "src/domain/historical-analytics.ts"),
  join(root, "src/domain/historical-quote-math.ts"),
];
assertAbsent(
  historicalAnalyticsReadFiles,
  [
    /\bfetch\s*\(/,
    /createServerHistoricalPriceProviderAdapters/,
    /from\s+["'][^"']*providers\/(?:coingecko|ecb|fetch-http-transport)["']/,
  ],
  "Historical analytics cache-only read boundary",
);

const historicalLayerFiles = [
  ...filesUnder(join(root, "src/domain")),
  ...filesUnder(join(root, "src/services")),
  ...filesUnder(join(root, "src/db/queries")),
].filter((file) => /historical/.test(file) && /\.(?:ts|tsx)$/.test(file));
assertAbsent(
  historicalLayerFiles,
  [
    /\bsetInterval\s*\(/,
    /\bscheduleJob\s*\(/,
    /from\s+["'](?:node-cron|cron|cron-parser|agenda|bree)["']/,
    /\b(?:insert|update|delete)Ledger(?:Event|Entry|Snapshot)/,
  ],
  "Historical layer scheduler and Ledger-write isolation",
);

const backupQueryText = readFileSync(
  join(root, "src/db/queries/backup.ts"),
  "utf8",
);
const backupReadBody = backupQueryText.slice(
  backupQueryText.indexOf("export function readBackupData"),
  backupQueryText.indexOf("export function readAppMetaRows"),
);
for (const forbidden of [
  "historicalPriceQuotes",
  "historicalFxQuotes",
  "historicalRefreshRuns",
  "historicalRefreshUnits",
]) {
  if (backupReadBody.includes(forbidden)) {
    failures.push(
      `Backup provider-cache exclusion: readBackupData referenced ${forbidden}.`,
    );
  }
}
if (!backupReadBody.includes("historicalManualQuotes")) {
  failures.push(
    "Backup manual-history reachability: readBackupData missed historicalManualQuotes.",
  );
}
assertAbsent(
  automationPureFiles,
  [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\b(?:axios|got|undici)\b/,
    /from\s+["']node:(?:http|https|net|tls)["']/,
    /https?:\/\//,
  ],
  "Automation and recurring network isolation",
);
assertAbsent(
  [
    join(root, "src/domain/automation.ts"),
    join(root, "src/services/automation-projection-service.ts"),
  ],
  [
    /from\s+["'][^"']*(?:ledger-command-service|external-import-service|file-import-service)["']/,
    /\b(?:insert|update|delete)(?:Ledger|External|Candidate|Source)/,
  ],
  "Rule projection fact-write isolation",
);
assertAbsent(
  [
    join(root, "src/domain/automation.ts"),
    join(root, "src/services/automation-rule-service.ts"),
    join(root, "src/db/schema.ts"),
  ],
  [/["'`](?:regex|matches_regex)["'`]/i],
  "Automation user-regex boundary",
);
assertAbsent(
  [
    ...filesUnder(join(root, "src/domain")),
    ...filesUnder(join(root, "src/services")),
  ].filter(
    (file) =>
      /\.(?:ts|tsx)$/.test(file) && /(?:automation|recurring)/.test(file),
  ),
  [
    /\bsetInterval\s*\(/,
    /\bscheduleJob\s*\(/,
    /from\s+["'](?:node-cron|cron|cron-parser|agenda|bree)["']/,
  ],
  "Automation and recurring scheduler boundary",
);

const fileImportIngressFiles = [
  ...fileImportProviderFiles,
  ...filesUnder(join(root, "src/app/api/import")),
  join(root, "src/services/file-import-service.ts"),
].filter((file) => /\.(?:ts|tsx)$/.test(file));
assertAbsent(
  fileImportIngressFiles,
  [
    /from\s+["']node:(?:fs|path)["']/,
    /\b(?:readFile|readFileSync|createReadStream)\s*\(/,
    /formData\.get\(["']url["']\)/i,
    /\b(?:sourceUrl|fileUrl|importUrl)\b/i,
  ],
  "Financial-file upload-only ingress",
);

assertAbsent(
  [join(root, "src/db/schema.ts")],
  [
    /\bblob\s*\(/i,
    /text\(["'](?:raw_file|raw_xml|raw_csv|file_blob|file_contents)["']/i,
  ],
  "Financial-file raw blob persistence",
);
assertAbsent(
  persistenceFiles,
  [
    /\baccountNumber\b/,
    /\bfull(?:Account|Iban|IBAN)\b/,
    /\braw(?:Account|Iban|IBAN)\b/,
  ],
  "Financial-file raw account persistence",
);

const fileImportXmlCommon = join(root, "src/providers/file-import/common.ts");
assertPresent(
  fileImportXmlCommon,
  [/XML_FORBIDDEN_DECLARATION/, /DOCTYPE\|ENTITY/, /XML_XINCLUDE/],
  "Financial-file XML declaration precheck",
);
assertOrdered(
  fileImportXmlCommon,
  ["assertSafeXmlText(text);", "XMLValidator.validate", "new XMLParser"],
  "Financial-file XML validation order",
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
for (const name of [
  "KRAKEN_API_KEY",
  "KRAKEN_API_SECRET",
  "ALCHEMY_API_KEY",
  "COINGECKO_API_KEY",
]) {
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
    /\bCOINGECKO_API_KEY\b/,
    /sentinel-api-key/,
    /sentinel-alchemy-key/,
    /c2VjcmV0LWJ5dGVz/,
  ],
  "Built client bundle secret boundary",
);
assertAbsent(
  staticFiles,
  [
    /fast-xml-parser/,
    /csv-parse\/sync/,
    /parseCamt053Statement/,
    /XML_DTD_FORBIDDEN/,
  ],
  "Built client financial-file parser boundary",
);

if (failures.length > 0) {
  throw new Error(
    "External sync security check failed:\n" + failures.join("\n"),
  );
}

console.log("External sync security boundaries verified.");
