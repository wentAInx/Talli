import { expect, test, type Page } from "@playwright/test";

const ANALYTICS_URL = "/analytics?from=2026-08-14&to=2026-08-14";

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function createArtworkQuote(
  page: Page,
  date: string,
  rate: string,
): Promise<void> {
  const form = page.locator("#manual-history form").first();
  await form
    .locator('select[name="baseAssetId"]')
    .selectOption("analytics-e2e-0001");
  await form.getByLabel("估值日期").fill(date);
  await form.getByLabel(/1 基础资产/).fill(rate);
  await form.getByRole("button", { name: "保存历史价格" }).click();
  await expect(
    page
      .locator("#manual-history details.settings-record")
      .filter({ hasText: date })
      .filter({ hasText: "ART" }),
  ).toHaveCount(1);
}

test("historical analytics refresh, gaps, archived exposure, manual facts, flows, and bridge", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  test.setTimeout(90_000);

  await page.goto(ANALYTICS_URL);
  await expect(page).toHaveTitle("Analytics | Talli");
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(page.getByText("还没有历史报价缓存")).toBeVisible();
  await expect(page.locator(".analytics-chart-gap")).toHaveCount(1);
  await expect(page.getByText(/存在报价缺口/)).toBeVisible();

  await page.getByRole("button", { name: "刷新历史数据" }).click();
  await expect(page.getByText(/4\/6 完成/)).toBeVisible();
  await expect(page.getByRole("button", { name: "继续刷新" })).toBeVisible();

  await page.reload();
  await expect(page.getByText(/4\/6 完成/)).toBeVisible();
  await page.getByRole("button", { name: "继续刷新" }).click();
  await expect(page.getByText(/6\/6 完成/)).toBeVisible();
  await expect(page.getByText(/任务 success/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/任务 success/)).toBeVisible();
  await expect(page.locator(".history-status-wide")).toContainText("success ·");

  await expect(page.getByText(/缺映射：ART/)).toBeVisible();
  await page.getByRole("tab", { name: "按资产", exact: true }).click();
  await expect(
    page.locator(".allocation-row").filter({ hasText: "BTC" }),
  ).toContainText("47600");
  await expect(
    page.locator(".allocation-row").filter({ hasText: "USDT" }),
  ).toContainText("698.04");
  const cashFlowRow = page
    .locator(".analytics-section")
    .filter({ has: page.getByRole("heading", { name: "历史现金流" }) })
    .getByRole("row", { name: /2026-08/ });
  await expect(cashFlowRow).toContainText("100.00 CNY");
  await expect(cashFlowRow).toContainText("-20.00 CNY");
  await expect(cashFlowRow).toContainText("80.00 CNY");

  await createArtworkQuote(page, "2026-08-14", "5000");
  await expect(page.getByText("范围完整")).toBeVisible();
  await expect(page.locator(".analytics-chart-gap")).toHaveCount(0);
  await expect(page.locator(".analytics-kpi.is-liability")).toContainText(
    "-70.00 CNY",
  );
  await createArtworkQuote(page, "2026-08-13", "5000");

  const bridge = page
    .locator(".analytics-section")
    .filter({ has: page.getByRole("heading", { name: "净值变化桥接" }) });
  await expect(bridge).toContainText("不是税务成本基础或已实现盈亏");
  const bridgeRow = bridge.getByRole("row", { name: /2026-08-14/ });
  await expect(bridgeRow).toContainText("80.00 CNY");
  await expect(bridgeRow).toContainText("100.00 CNY");
  await expect(bridgeRow).toContainText("-20.00 CNY");
  await expect(page.getByText("Data provided by CoinGecko")).toBeVisible();
  await expect(page.getByText("Source: ECB statistics")).toBeVisible();

  let record = page
    .locator("#manual-history details.settings-record")
    .filter({ hasText: "2026-08-14" })
    .filter({ hasText: "ART" });
  if (
    !(await record.evaluate((element) => (element as HTMLDetailsElement).open))
  ) {
    await record.locator("summary").click();
  }
  await record.getByLabel("价格").fill("5100");
  await record.getByRole("button", { name: "更新历史价格" }).click();
  record = page
    .locator("#manual-history details.settings-record")
    .filter({ hasText: "2026-08-14" })
    .filter({ hasText: "ART" });
  await expect(record).toContainText("5100");

  if (
    !(await record.evaluate((element) => (element as HTMLDetailsElement).open))
  ) {
    await record.locator("summary").click();
  }
  page.once("dialog", (dialog) => dialog.accept());
  await record.getByRole("button", { name: "删除历史价格" }).click();
  await expect(
    page
      .locator("#manual-history details.settings-record")
      .filter({ hasText: "2026-08-14" })
      .filter({ hasText: "ART" }),
  ).toHaveCount(0);
  await expect(page.getByText(/存在报价缺口/)).toBeVisible();
  await createArtworkQuote(page, "2026-08-14", "5000");

  await expectNoDocumentOverflow(page);
});

test("mobile analytics navigation, charts, forms, and tables stay contained", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-webkit");

  await page.goto(ANALYTICS_URL);
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "手机主导航" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "分析" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const navMetrics = await page
    .getByRole("navigation", { name: "手机主导航" })
    .evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      itemHeight: element.querySelector("a")?.getBoundingClientRect().height,
      itemWidth: element.querySelector("a")?.getBoundingClientRect().width,
    }));
  expect(navMetrics.scrollWidth).toBeGreaterThan(navMetrics.clientWidth);
  expect(navMetrics.itemHeight).toBeGreaterThanOrEqual(44);
  expect(navMetrics.itemWidth).toBeGreaterThanOrEqual(44);

  const chartWidth = await page
    .locator(".analytics-chart")
    .evaluate((element) => element.getBoundingClientRect().width);
  const viewportWidth = page.viewportSize()!.width;
  expect(chartWidth).toBeLessThanOrEqual(viewportWidth - 20);
  await expect(
    page.getByRole("tab", { name: "按资产", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('#manual-history select[name="baseAssetId"]'),
  ).toBeVisible();
  await expectNoDocumentOverflow(page);
});
