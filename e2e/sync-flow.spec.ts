import { expect, test, type Page } from "@playwright/test";

async function createAccount(
  page: Page,
  input: { name: string; assetId: string; initialBalance: string },
) {
  await page.goto("/accounts/new");
  await page.getByLabel("账户名称").fill(input.name);
  await page.getByLabel("账户类型").selectOption("exchange");
  await page.getByLabel("资产").selectOption(input.assetId);
  await page.getByLabel("初始余额（可选）").fill(input.initialBalance);
  await page.getByRole("button", { name: "创建账户" }).click();
  await expect(page.getByRole("heading", { name: input.name })).toBeVisible();
}

async function mapAsset(
  page: Page,
  input: { raw: string; assetId: string; accountLabel: string },
) {
  const row = page.locator(".sync-mapping-table tr").filter({
    has: page.getByText(input.raw, { exact: true }),
  });
  await row.getByRole("combobox", { name: "映射状态" }).selectOption("mapped");
  await row
    .getByRole("combobox", { name: "Talli 资产" })
    .selectOption(input.assetId);
  await row
    .getByRole("combobox", { name: "Talli 账户" })
    .selectOption({ label: input.accountLabel });
  await row.getByRole("button", { name: "保存映射" }).click();
  await expect(row.locator(".mapping-state-mapped")).toContainText(
    input.accountLabel.split(" · ")[0]!,
  );
}

test("Kraken read-only sync requires explicit mapping, reconcile, and import", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "sync-mobile") {
    await page.goto("/sync?queue=imported");
    await expect(
      page.getByRole("link", { name: "同步", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    const krakenCard = page.locator(".sync-connection-card").filter({
      has: page.getByRole("heading", { name: "Kraken", exact: true }),
    });
    await expect(krakenCard.getByText("只读同步正常")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Kraken trade BTC\/USD/ }),
    ).toBeVisible();

    const btcMapping = page.locator(".sync-mapping-table tr").filter({
      has: page.getByText("XXBT", { exact: true }),
    });
    await expect(
      btcMapping.getByRole("combobox", { name: "Talli 账户" }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Kraken trade BTC\/USD/ }).click();
    await expect(
      page.getByRole("heading", { name: "已导入 Talli" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "查看原始交易页" }),
    ).toBeVisible();
    const noHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(noHorizontalOverflow).toBe(true);
    return;
  }

  const noOrigin = await page.request.post("/api/sync/kraken/run", {
    data: { connectionId: "missing" },
  });
  expect(noOrigin.status()).toBe(403);
  const crossOrigin = await page.request.post("/api/sync/kraken/run", {
    data: { connectionId: "missing" },
    headers: { Origin: "https://example.invalid" },
  });
  expect(crossOrigin.status()).toBe(403);

  await createAccount(page, {
    name: "V3 Kraken BTC",
    assetId: "seed-asset-btc",
    initialBalance: "0.50000000",
  });
  await createAccount(page, {
    name: "V3 Kraken USD",
    assetId: "seed-asset-usd",
    initialBalance: "1250.10",
  });
  await createAccount(page, {
    name: "V3 Kraken USDT",
    assetId: "seed-asset-usdt",
    initialBalance: "100.000000",
  });

  await page.goto("/sync");
  await expect(page.getByRole("heading", { name: "外部同步" })).toBeVisible();
  await page.getByRole("button", { name: "创建 Kraken 只读连接" }).click();
  await expect(page.getByText("等待首次同步")).toBeVisible();
  await expect(page.getByText("API key").locator("..")).toContainText("已配置");

  await page.getByRole("button", { name: "立即同步" }).click();
  await expect(page.getByText("只读同步正常")).toBeVisible();
  await expect(page.getByText(/query-funds/)).toBeVisible();
  await expect(page.getByText("未检测到危险写权限")).toBeVisible();

  await mapAsset(page, {
    raw: "XXBT",
    assetId: "seed-asset-btc",
    accountLabel: "V3 Kraken BTC · BTC",
  });
  await mapAsset(page, {
    raw: "ZUSD",
    assetId: "seed-asset-usd",
    accountLabel: "V3 Kraken USD · USD",
  });
  await mapAsset(page, {
    raw: "USDT",
    assetId: "seed-asset-usdt",
    accountLabel: "V3 Kraken USDT · USDT",
  });

  await page.getByRole("button", { name: "立即同步" }).click();
  const btcObservation = page.locator(".observation-card").filter({
    hasText: "Kraken BTC",
  });
  await expect(btcObservation).toContainText("0.50200000 BTC");
  await expect(btcObservation).toContainText("0.50000000 BTC");
  await expect(btcObservation).toContainText("+0.00200000 BTC");
  page.once("dialog", (dialog) => dialog.accept());
  await btcObservation
    .getByRole("button", { name: "调整账本为外部余额" })
    .click();
  await expect(
    btcObservation.getByRole("button", { name: "已创建余额快照" }),
  ).toBeVisible();

  const tradeCandidate = page.getByRole("link", {
    name: /Kraken trade BTC\/USD/,
  });
  await expect(tradeCandidate).toBeVisible();
  await tradeCandidate.click();
  await expect(
    page.getByRole("heading", { name: "Normalized legs" }),
  ).toBeVisible();
  await expect(page.getByText("T-TRADE-1", { exact: true })).toBeVisible();
  await expect(page.getByText("-100.0000 ZUSD", { exact: true })).toBeVisible();
  await expect(page.getByLabel("卖出账户")).toHaveValue(/.+/);
  await expect(page.getByLabel("买入账户")).toHaveValue(/.+/);
  await expect(
    page.getByText("Kraken reported fee: 0.2500", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fee asset unresolved", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("手续费 Talli 账户 / 资产")).toHaveValue("");
  await expect(
    page.getByLabel("我确认本次不导入 Kraken 报告的手续费"),
  ).not.toBeChecked();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "导入到 Talli" }).click();
  await expect(
    page.locator(".candidate-import-form .form-error"),
  ).toContainText("Kraken reported a nonzero fee");
  await expect(
    page.getByRole("heading", { name: "Kraken trade BTC/USD" }),
  ).toBeVisible();

  await page
    .getByLabel("手续费 Talli 账户 / 资产")
    .selectOption({ label: "V3 Kraken USD · USD" });

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "导入到 Talli" }).click();
  await expect(page.getByRole("heading", { name: "编辑兑换" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "此事件来自明确导入" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "查看 Kraken 候选" }).click();
  await expect(
    page.getByRole("heading", { name: "已导入 Talli" }),
  ).toBeVisible();

  const beforeResync = (await (
    await page.request.get("/api/data/backup")
  ).json()) as {
    data: { ledgerEvents: unknown[]; externalImportLinks: unknown[] };
  };
  await page.goto("/sync?queue=imported");
  await page.getByRole("button", { name: "立即同步" }).click();
  await expect(
    page.getByRole("link", { name: /Kraken trade BTC\/USD/ }),
  ).toBeVisible();
  const afterResync = (await (
    await page.request.get("/api/data/backup")
  ).json()) as {
    data: { ledgerEvents: unknown[]; externalImportLinks: unknown[] };
  };
  expect(afterResync.data.ledgerEvents).toHaveLength(
    beforeResync.data.ledgerEvents.length,
  );
  expect(afterResync.data.externalImportLinks).toHaveLength(1);

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
});

test("Ethereum Mainnet wallet keeps on-chain balance, gas, and movement outside Ledger until review", async ({
  page,
}, testInfo) => {
  const address = "0x1111111111111111111111111111111111111111";
  if (testInfo.project.name === "sync-mobile") {
    await page.goto("/sync?queue=imported");
    const ethereumWorkbench = page.locator(".evm-workbench").filter({
      has: page.getByRole("heading", { name: "V4 Main wallet" }),
    });
    await expect(
      ethereumWorkbench.getByRole("heading", { name: "V4 Main wallet" }),
    ).toBeVisible();
    await expect(
      ethereumWorkbench.getByText("◇ 0x111111…111111"),
    ).toBeVisible();
    await expect(
      ethereumWorkbench.getByText("Network fee", { exact: true }),
    ).toBeVisible();
    const noHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(noHorizontalOverflow).toBe(true);
    return;
  }

  const noOrigin = await page.request.post("/api/sync/evm/run", {
    data: { connectionId: "missing" },
  });
  expect(noOrigin.status()).toBe(403);

  await createAccount(page, {
    name: "V4 Ethereum ETH",
    assetId: "seed-asset-eth",
    initialBalance: "1.5",
  });
  await createAccount(page, {
    name: "V4 Ethereum USDC",
    assetId: "seed-asset-usdc",
    initialBalance: "90",
  });

  await page.goto("/sync");
  await page.getByLabel("钱包名称").fill("V4 Main wallet");
  await page.getByLabel("Public EVM address").fill(address);
  await page.getByLabel(/History start date/).fill("2026-01-01");
  await page.getByRole("button", { name: "添加 EVM 只读钱包" }).click();
  await expect(
    page.getByRole("heading", { name: "V4 Main wallet" }),
  ).toBeVisible();
  await expect(page.getByText("env:alchemy.primary")).toBeVisible();
  await expect(page.getByText("no sign / send / write RPC")).toBeVisible();

  const beforeSync = (await (
    await page.request.get("/api/data/backup")
  ).json()) as {
    data: { ledgerEvents: unknown[]; balanceSnapshots: unknown[] };
  };
  const walletCard = page.locator(".evm-workbench .sync-connection-card");
  await walletCard.getByRole("button", { name: "立即同步" }).click();
  await expect(walletCard.getByText("只读同步正常")).toBeVisible();
  await expect(walletCard.getByText(/21000018/)).toBeVisible();
  const unknownMapping = page.locator(".sync-mapping-table tr").filter({
    has: page.getByText(
      "eip155:1/erc20:0x8888888888888888888888888888888888888888",
      { exact: true },
    ),
  });
  await expect(unknownMapping).toContainText("token decimals unresolved");
  await expect(
    unknownMapping
      .getByRole("combobox", { name: "映射状态" })
      .locator('option[value="mapped"]'),
  ).toHaveAttribute("disabled", "");

  await mapAsset(page, {
    raw: "eip155:1/native",
    assetId: "seed-asset-eth",
    accountLabel: "V4 Ethereum ETH · ETH",
  });
  await mapAsset(page, {
    raw: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    assetId: "seed-asset-usdc",
    accountLabel: "V4 Ethereum USDC · USDC",
  });
  await walletCard.getByRole("button", { name: "立即同步" }).click();

  const ethObservation = page
    .locator(".evm-workbench .observation-card")
    .filter({
      hasText: "On-chain ETH",
    });
  await expect(ethObservation).toContainText("1.490000000000000000 ETH");
  await expect(ethObservation).toContainText("1.500000000000000000 ETH");
  await expect(ethObservation).toContainText("-0.010000000000000000 ETH");
  const unknownObservation = page
    .locator(".evm-workbench .observation-card")
    .filter({
      hasText: "raw atomic amount 123456789 · token decimals unresolved",
    });
  await expect(unknownObservation).toContainText(
    "raw atomic amount 123456789 · token decimals unresolved",
  );
  await expect(
    unknownObservation.getByRole("button", { name: "调整账本为外部余额" }),
  ).toHaveCount(0);
  const afterSync = (await (
    await page.request.get("/api/data/backup")
  ).json()) as {
    data: { ledgerEvents: unknown[]; balanceSnapshots: unknown[] };
  };
  expect(afterSync.data.ledgerEvents).toHaveLength(
    beforeSync.data.ledgerEvents.length,
  );
  expect(afterSync.data.balanceSnapshots).toHaveLength(
    beforeSync.data.balanceSnapshots.length,
  );

  page.once("dialog", (dialog) => dialog.accept());
  await ethObservation
    .getByRole("button", { name: "调整账本为外部余额" })
    .click();
  await expect(
    ethObservation.getByRole("button", { name: "已创建余额快照" }),
  ).toBeVisible();

  await expect(page.getByText("Movement", { exact: true })).toBeVisible();
  await expect(page.getByText("Network fee", { exact: true })).toBeVisible();
  const txGroup = page
    .locator(".candidate-tx-group")
    .filter({ hasText: "Tx 0xaaaaaa" });
  await expect(txGroup).toContainText("100 USDC");
  await expect(txGroup).toContainText("0.01 ETH");
  await txGroup.getByRole("link", { name: /Movement/ }).click();
  await expect(
    page.getByRole("heading", { name: "Movement", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("导入为")).toHaveValue("exchange");
  await expect(page.getByLabel("导入为").locator("option")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "导入到 Talli" }).click();
  await expect(page.getByRole("heading", { name: "编辑兑换" })).toBeVisible();
  await page.getByRole("link", { name: "查看 EVM 候选" }).click();
  await expect(
    page.getByRole("heading", { name: "已导入 Talli" }),
  ).toBeVisible();

  await page.goto("/sync");
  const pendingEvmGroup = page
    .locator(".evm-workbench .candidate-tx-group")
    .filter({ hasText: "Network fee" });
  await pendingEvmGroup.getByRole("link", { name: /Network fee/ }).click();
  await expect(
    page.getByRole("heading", { name: "Network fee", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("导入为")).toHaveValue("expense");
  await expect(page.getByLabel("导入为").locator("option")).toHaveCount(1);
  await expect(
    page.locator(".evm-candidate-facts").getByText(`0x${"a".repeat(64)}`),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "导入到 Talli" }).click();
  await expect(
    page.getByRole("heading", { name: "编辑Ethereum Network" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "查看 EVM 候选" }).click();
  await expect(
    page.getByRole("heading", { name: "已导入 Talli" }),
  ).toBeVisible();

  const beforeResync = (await (
    await page.request.get("/api/data/backup")
  ).json()) as {
    schemaVersion: number;
    data: { ledgerEvents: unknown[]; externalImportLinks: unknown[] };
  };
  expect(beforeResync.schemaVersion).toBe(7);
  await page.goto("/sync?queue=imported");
  await page
    .locator(".evm-workbench .sync-connection-card")
    .getByRole("button", { name: "立即同步" })
    .click();
  await expect(
    page.locator(".evm-workbench").getByText("Network fee", { exact: true }),
  ).toBeVisible();
  const afterResync = (await (
    await page.request.get("/api/data/backup")
  ).json()) as {
    data: { ledgerEvents: unknown[]; externalImportLinks: unknown[] };
  };
  expect(afterResync.data.ledgerEvents).toHaveLength(
    beforeResync.data.ledgerEvents.length,
  );
  expect(afterResync.data.externalImportLinks).toHaveLength(
    beforeResync.data.externalImportLinks.length,
  );
});

test("Base and Arbitrum expose discovery limits, exact traces, and exact fee components", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const sharedAddress = "0x5555555555555555555555555555555555555555";
  const networks = [
    {
      chainId: "8453",
      name: "V4.1 Base wallet",
      networkName: "Base",
      coverage: "discovery limited",
      nativeKey: "eip155:8453/native",
      usdcKey: "eip155:8453/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      ethAccount: "V4.1 Base ETH",
      usdcAccount: "V4.1 Base USDC",
    },
    {
      chainId: "42161",
      name: "V4.1 Arbitrum wallet",
      networkName: "Arbitrum One",
      coverage: "discovery limited · activity ≥ block 22,207,815",
      nativeKey: "eip155:42161/native",
      usdcKey: "eip155:42161/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      ethAccount: "V4.1 Arbitrum ETH",
      usdcAccount: "V4.1 Arbitrum USDC",
    },
  ] as const;

  if (testInfo.project.name === "sync-mobile") {
    await page.goto("/sync");
    for (const network of networks) {
      const workbench = page.locator(".evm-workbench").filter({
        has: page.getByRole("heading", { name: network.name, exact: true }),
      });
      await expect(
        workbench.getByText(network.coverage, { exact: true }),
      ).toBeVisible();
      await expect(
        workbench.getByText("✓ exact activity trace", { exact: true }),
      ).toBeVisible();
      await expect(
        workbench
          .locator(".sync-mapping-table")
          .getByText(network.nativeKey, { exact: true }),
      ).toBeVisible();
    }
    const unavailableWorkbench = page.locator(".evm-workbench").filter({
      has: page.getByRole("heading", {
        name: "V4.1 Base balance-only",
        exact: true,
      }),
    });
    await expect(
      unavailableWorkbench.getByText("! balance-only · trace unavailable", {
        exact: true,
      }),
    ).toBeVisible();

    for (const network of networks) {
      await page.goto("/sync?queue=imported");
      const workbench = page.locator(".evm-workbench").filter({
        has: page.getByRole("heading", { name: network.name, exact: true }),
      });
      await workbench.getByRole("link", { name: /Network fee/ }).click();
      await expect(
        page.getByRole("heading", {
          name: "Network fee breakdown",
          exact: true,
        }),
      ).toBeVisible();
    }
    const noHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(noHorizontalOverflow).toBe(true);
    return;
  }

  for (const network of networks) {
    await createAccount(page, {
      name: network.ethAccount,
      assetId: "seed-asset-eth",
      initialBalance: "0",
    });
    await createAccount(page, {
      name: network.usdcAccount,
      assetId: "seed-asset-usdc",
      initialBalance: "0",
    });
  }

  for (const network of networks) {
    await page.goto("/sync");
    await page.locator('select[name="chainId"]').selectOption(network.chainId);
    await page.getByLabel("钱包名称").fill(network.name);
    await page.getByLabel("Public EVM address").fill(sharedAddress);
    await page.getByLabel(/History start date/).fill("2026-01-01");
    await page.getByRole("button", { name: "添加 EVM 只读钱包" }).click();
    const workbench = page.locator(".evm-workbench").filter({
      has: page.getByRole("heading", { name: network.name, exact: true }),
    });
    await expect(
      workbench.getByRole("heading", { name: network.name, exact: true }),
    ).toBeVisible();
    const beforeSync = (await (
      await page.request.get("/api/data/backup")
    ).json()) as {
      data: { ledgerEvents: unknown[]; externalImportLinks: unknown[] };
    };
    await workbench.getByRole("button", { name: "立即同步" }).click();
    await expect(
      workbench.getByText("只读同步正常", { exact: true }),
    ).toBeVisible();
    await expect(
      workbench.getByText(network.coverage, { exact: true }),
    ).toBeVisible();
    await expect(
      workbench.getByText("✓ exact activity trace", { exact: true }),
    ).toBeVisible();
    const afterSync = (await (
      await page.request.get("/api/data/backup")
    ).json()) as {
      data: { ledgerEvents: unknown[]; externalImportLinks: unknown[] };
    };
    expect(afterSync.data.ledgerEvents).toHaveLength(
      beforeSync.data.ledgerEvents.length,
    );
    expect(afterSync.data.externalImportLinks).toHaveLength(
      beforeSync.data.externalImportLinks.length,
    );

    await page.goto("/sync?queue=needs_mapping");
    await workbench.getByRole("link", { name: /Network fee/ }).click();
    await expect(
      page.getByRole("heading", { name: "Network fee breakdown", exact: true }),
    ).toBeVisible();
    if (network.chainId === "8453") {
      await expect(
        page.getByText("L2 execution", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("L1 data / security", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Operator fee", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("25000000000000 wei", { exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText("Child execution", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Parent calldata", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("21000000000000 wei", { exact: true }),
      ).toBeVisible();
    }

    await page.goto("/sync?queue=needs_mapping");
    await mapAsset(page, {
      raw: network.nativeKey,
      assetId: "seed-asset-eth",
      accountLabel: `${network.ethAccount} · ETH`,
    });
    await mapAsset(page, {
      raw: network.usdcKey,
      assetId: "seed-asset-usdc",
      accountLabel: `${network.usdcAccount} · USDC`,
    });
    await workbench.getByRole("button", { name: "立即同步" }).click();

    await page.goto("/sync");
    await workbench.getByRole("link", { name: /Movement/ }).click();
    await expect(page.getByLabel("导入为")).toHaveValue("exchange");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "导入到 Talli" }).click();
    await expect(page.getByRole("heading", { name: "编辑兑换" })).toBeVisible();
    await page.getByRole("link", { name: "查看 EVM 候选" }).click();
    await expect(
      page.getByRole("heading", { name: "已导入 Talli" }),
    ).toBeVisible();

    await page.goto("/sync");
    await workbench.getByRole("link", { name: /Network fee/ }).click();
    await expect(page.getByLabel("导入为")).toHaveValue("expense");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "导入到 Talli" }).click();
    await expect(
      page.getByRole("heading", {
        name: `编辑${network.networkName} Network`,
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "查看 EVM 候选" }).click();
    await expect(
      page.getByRole("heading", { name: "已导入 Talli" }),
    ).toBeVisible();

    const afterImport = (await (
      await page.request.get("/api/data/backup")
    ).json()) as {
      schemaVersion: number;
      data: { ledgerEvents: unknown[]; externalImportLinks: unknown[] };
    };
    expect(afterImport.schemaVersion).toBe(7);
    expect(afterImport.data.ledgerEvents).toHaveLength(
      beforeSync.data.ledgerEvents.length + 2,
    );
    expect(afterImport.data.externalImportLinks).toHaveLength(
      beforeSync.data.externalImportLinks.length + 2,
    );

    await page.goto("/sync?queue=imported");
    await workbench.getByRole("button", { name: "立即同步" }).click();
    const afterResync = (await (
      await page.request.get("/api/data/backup")
    ).json()) as {
      data: { ledgerEvents: unknown[]; externalImportLinks: unknown[] };
    };
    expect(afterResync.data.ledgerEvents).toHaveLength(
      afterImport.data.ledgerEvents.length,
    );
    expect(afterResync.data.externalImportLinks).toHaveLength(
      afterImport.data.externalImportLinks.length,
    );
  }

  await page.goto("/sync");
  await page.locator('select[name="chainId"]').selectOption("8453");
  await page.getByLabel("钱包名称").fill("V4.1 Base balance-only");
  await page
    .getByLabel("Public EVM address")
    .fill("0x9999999999999999999999999999999999999999");
  await page.getByLabel(/History start date/).fill("2026-01-01");
  await page.getByRole("button", { name: "添加 EVM 只读钱包" }).click();
  const unavailableWorkbench = page.locator(".evm-workbench").filter({
    has: page.getByRole("heading", {
      name: "V4.1 Base balance-only",
      exact: true,
    }),
  });
  const beforeUnavailableSync = (await (
    await page.request.get("/api/data/backup")
  ).json()) as { data: { ledgerEvents: unknown[] } };
  await unavailableWorkbench.getByRole("button", { name: "立即同步" }).click();
  await expect(
    unavailableWorkbench.getByText("! balance-only · trace unavailable", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(unavailableWorkbench).toContainText(
    "本次未保存 activity，也未推进 cursor",
  );
  await expect(unavailableWorkbench).toContainText("等待同步");
  await expect(unavailableWorkbench).toContainText("0 个候选");
  const afterUnavailableSync = (await (
    await page.request.get("/api/data/backup")
  ).json()) as { data: { ledgerEvents: unknown[] } };
  expect(afterUnavailableSync.data.ledgerEvents).toHaveLength(
    beforeUnavailableSync.data.ledgerEvents.length,
  );
});
