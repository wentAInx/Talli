import { expect, test } from "@playwright/test";

async function createAccount(
  page: import("@playwright/test").Page,
  input: { name: string; assetId: string; initialBalance?: string },
) {
  await page.goto("/accounts/new");
  await page.getByLabel("账户名称").fill(input.name);
  await page.getByLabel("账户类型").selectOption("other");
  await page.getByLabel("资产").selectOption(input.assetId);
  if (input.initialBalance !== undefined) {
    await page.getByLabel("初始余额（可选）").fill(input.initialBalance);
  }
  await page.getByRole("button", { name: "创建账户" }).click();
  await expect(page.getByRole("heading", { name: input.name })).toBeVisible();
}

test("account, expense, dashboard, edit, and delete stay exact", async ({
  page,
}, testInfo) => {
  const accountName = `${testInfo.project.name}-支付宝`;

  await page.goto("/accounts");
  await expect(page.getByRole("link", { name: "+ 添加账户" })).toBeVisible();

  await page.goto("/accounts/new");
  await page.getByLabel("账户名称").fill(accountName);
  await page.getByLabel("账户类型").selectOption("ewallet");
  await page.getByLabel("资产").selectOption("seed-asset-cny");
  await expect(page.getByTestId("initial-balance-precision")).toContainText(
    "CNY · 最多 2 位小数",
  );
  await page.getByLabel("初始余额（可选）").fill("1000.00");
  await page.getByRole("button", { name: "创建账户" }).click();

  await expect(page.getByRole("heading", { name: accountName })).toBeVisible();
  await expect(page.getByTestId("account-balance")).toHaveText("¥1,000.00 CNY");

  await page.goto("/transactions/new");
  await expect(page).toHaveTitle("记一笔 | Asset Ledger");
  for (const label of ["支出", "收入", "转账", "兑换", "调整余额"]) {
    await expect(page.getByRole("tab", { name: label })).toBeVisible();
  }
  await page.getByRole("tab", { name: "支出" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "收入" })).toBeFocused();
  await page.getByRole("tab", { name: "支出" }).click();
  await page.getByLabel("金额").fill("1.001");
  await page.getByLabel("账户").selectOption({ label: `${accountName} · CNY` });
  await page.getByRole("button", { name: "保存支出" }).click();
  await expect(page.getByTestId("form-error")).toBeFocused();
  await expect(page.getByTestId("form-error")).toContainText("小数位");
  await page.getByLabel("金额").fill("35.80");
  await page.getByLabel("账户").selectOption({ label: `${accountName} · CNY` });
  await page.getByLabel("分类").selectOption({ label: "餐饮" });
  await page.getByLabel("对象（可选）").fill("便利店");
  await page.getByRole("button", { name: "保存支出" }).click();

  await expect(page.getByRole("heading", { name: "编辑便利店" })).toBeVisible();
  await page.goto("/");
  const accountRow = page
    .getByTestId("asset-group-CNY")
    .getByRole("link", { name: new RegExp(accountName) });
  await expect(accountRow).toContainText("¥964.20 CNY");

  await page.goto("/transactions");
  await page.getByRole("link", { name: /便利店/ }).click();
  await page.getByLabel("金额").fill("40.80");
  const updateResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/transactions/"),
  );
  await page.getByRole("button", { name: "保存支出" }).click();
  await updateResponse;

  await page.goto("/");
  await expect(
    page
      .getByTestId("asset-group-CNY")
      .getByRole("link", { name: new RegExp(accountName) }),
  ).toContainText("¥959.20 CNY");

  await page.goto("/transactions");
  await page.getByRole("link", { name: /便利店/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除交易" }).click();
  await expect(page.getByRole("heading", { name: "流水" })).toBeVisible();
  await expect(page.getByText("便利店")).toHaveCount(0);

  await page.goto("/");
  await expect(
    page
      .getByTestId("asset-group-CNY")
      .getByRole("link", { name: new RegExp(accountName) }),
  ).toContainText("¥1,000.00 CNY");

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
});

test("income, transfer, exchange, and reconciliation forms reach their services", async ({
  page,
}, testInfo) => {
  const prefix = `${testInfo.project.name}-矩阵`;
  const changeableAccount = `${prefix}-可改资产`;
  const cnyAccountA = `${prefix}-CNY-A`;
  const cnyAccountB = `${prefix}-CNY-B`;
  const usdAccount = `${prefix}-USD`;
  const usdtAccount = `${prefix}-USDT`;

  await createAccount(page, {
    name: changeableAccount,
    assetId: "seed-asset-cny",
  });
  await page.getByLabel("资产").selectOption("seed-asset-usd");
  await page.getByRole("button", { name: "保存账户" }).click();
  await expect(page.getByTestId("account-asset")).toHaveText("USD · US Dollar");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "归档账户" }).click();
  await expect(page.getByText("已归档 · 不计入总览")).toBeVisible();

  await createAccount(page, {
    name: cnyAccountA,
    assetId: "seed-asset-cny",
    initialBalance: "1000.00",
  });
  await createAccount(page, {
    name: cnyAccountB,
    assetId: "seed-asset-cny",
    initialBalance: "0.00",
  });
  await createAccount(page, {
    name: usdAccount,
    assetId: "seed-asset-usd",
    initialBalance: "0.00",
  });
  await createAccount(page, {
    name: usdtAccount,
    assetId: "seed-asset-usdt",
    initialBalance: "500.000000",
  });

  await page.goto("/transactions/new?type=income");
  await page.getByLabel("金额").fill("100.00");
  await page.getByLabel("账户").selectOption({ label: `${cnyAccountA} · CNY` });
  await page.getByRole("button", { name: "保存收入" }).click();
  await expect(page.getByRole("heading", { name: "编辑收入" })).toBeVisible();

  await page.goto("/transactions/new?type=transfer");
  await page
    .getByRole("combobox", { name: "转出账户", exact: true })
    .selectOption({ label: `${cnyAccountA} · CNY` });
  await expect(
    page.getByText("CNY · 最多 2 位小数", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(
      '[data-testid="occurred-at-field"], [data-testid="fee-toggle"]',
    ),
  ).toHaveCount(2);
  expect(
    await page
      .locator('[data-testid="occurred-at-field"], [data-testid="fee-toggle"]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-testid")),
      ),
  ).toEqual(["occurred-at-field", "fee-toggle"]);
  await expect(
    page
      .getByRole("combobox", { name: "转入账户", exact: true })
      .locator("option", { hasText: usdAccount }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "转入账户", exact: true })
    .selectOption({ label: `${cnyAccountB} · CNY` });
  await page.getByLabel("金额").fill("50.00");
  await page.getByRole("button", { name: "保存转账" }).click();
  await expect(page.getByRole("heading", { name: "编辑转账" })).toBeVisible();

  await page.goto("/transactions/new?type=exchange");
  await page
    .getByRole("combobox", { name: "卖出账户", exact: true })
    .selectOption({ label: `${usdtAccount} · USDT` });
  await page
    .getByRole("combobox", { name: "买入账户", exact: true })
    .selectOption({ label: `${usdAccount} · USD` });
  await page.getByLabel("卖出数量").fill("100.000000");
  await page.getByLabel("买入数量").fill("99.50");
  await page.getByLabel("这笔操作另有手续费").check();
  await page
    .getByRole("combobox", { name: "手续费账户", exact: true })
    .selectOption({ label: `${cnyAccountA} · CNY` });
  await expect(
    page.getByText("CNY · 最多 2 位小数", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("手续费金额").fill("1.00");
  await expect(page.getByText("1 USDT = 0.995 USD")).toBeVisible();
  await page.getByRole("button", { name: "保存兑换" }).click();
  await expect(page.getByRole("heading", { name: "编辑兑换" })).toBeVisible();

  await page.goto("/transactions/new?type=reconcile");
  await page.getByLabel("账户").selectOption({ label: `${cnyAccountB} · CNY` });
  await page.getByLabel("实际余额").fill("60.00");
  await page.getByRole("button", { name: "保存调整余额" }).click();
  await expect(page.getByRole("heading", { name: cnyAccountB })).toBeVisible();
  await expect(page.getByTestId("account-balance")).toHaveText("¥60.00 CNY");

  await page.goto("/");
  await expect(
    page
      .getByTestId("asset-group-CNY")
      .getByRole("link", { name: new RegExp(cnyAccountA) }),
  ).toContainText("¥1,049.00 CNY");
  await expect(
    page
      .getByTestId("asset-group-USD")
      .getByRole("link", { name: new RegExp(usdAccount) }),
  ).toContainText("$99.50 USD");
  await expect(
    page
      .getByTestId("asset-group-USDT")
      .getByRole("link", { name: new RegExp(usdtAccount) }),
  ).toContainText("400.000000 USDT");

  await page.goto("/settings");
  const cnyAsset = page
    .locator("details.settings-record")
    .filter({ hasText: "CNY · Chinese Yuan" })
    .first();
  await cnyAsset.locator("summary").click();
  await expect(cnyAsset.getByLabel("类型")).toBeDisabled();
  await expect(cnyAsset.getByLabel("小数精度")).toHaveAttribute("readonly", "");
  await expect(cnyAsset.getByRole("button", { name: "归档" })).toBeDisabled();
  await expect(cnyAsset).toContainText("请先归档该资产下的所有活跃账户");
});

test("filters, native-asset reports, settings, and exports form a V1 loop", async ({
  page,
}, testInfo) => {
  const accountName = `${testInfo.project.name}-筛选账户`;
  const payee = `${testInfo.project.name}-筛选商户`;
  await createAccount(page, {
    name: accountName,
    assetId: "seed-asset-cny",
    initialBalance: "100.00",
  });

  await page.goto("/transactions/new?type=expense");
  await page.getByLabel("金额").fill("12.34");
  await page.getByLabel("账户").selectOption({ label: `${accountName} · CNY` });
  await page.getByLabel("对象（可选）").fill(payee);
  await page.getByRole("button", { name: "保存支出" }).click();

  await page.goto("/transactions");
  await page.getByLabel("搜索").fill(payee);
  await page.getByLabel("类型").selectOption("expense");
  await page.getByRole("button", { name: "应用筛选" }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(payee) }),
  ).toBeVisible();

  await page.getByRole("link", { name: "报表", exact: true }).click();
  await expect(page.getByRole("heading", { name: "月度收支" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Chinese Yuan" }),
  ).toBeVisible();
  await expect(page.getByText("不做行情或跨资产换算")).toBeVisible();

  await page.getByRole("link", { name: "设置", exact: true }).click();
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "下载无损 JSON 备份" }),
  ).toBeVisible();

  const backupResponse = await page.request.get("/api/data/backup");
  expect(backupResponse.ok()).toBe(true);
  const backup = (await backupResponse.json()) as {
    format: string;
    schemaVersion: number;
    data: { ledgerEntries: { amountAtomic: string }[] };
  };
  expect(backup.format).toBe("multi-asset-ledger-backup");
  expect(backup.schemaVersion).toBe(1);
  expect(
    backup.data.ledgerEntries.every(
      (entry) => typeof entry.amountAtomic === "string",
    ),
  ).toBe(true);

  const csvResponse = await page.request.get("/api/data/export.csv");
  expect(csvResponse.ok()).toBe(true);
  expect(await csvResponse.text()).toContain(accountName);

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
});
