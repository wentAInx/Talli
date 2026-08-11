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
    await expect(page.getByText("只读同步正常")).toBeVisible();
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
  await expect(page.getByLabel(/手续费账户/)).toHaveValue(/.+/);

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
