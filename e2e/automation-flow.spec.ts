import { expect, test, type Page } from "@playwright/test";

interface AutomationBackupState {
  schemaVersion: number;
  ledgerEvents: number;
  externalTransactionCandidates: number;
  automationRules: number;
  recurringItems: number;
  recurringOccurrenceLinks: number;
  recurringOccurrenceSkips: number;
  dataKeys: string[];
}

async function automationBackupState(
  page: Page,
): Promise<AutomationBackupState> {
  const response = await page.request.get("/api/data/backup");
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as {
    schemaVersion: number;
    data: {
      ledgerEvents: unknown[];
      externalTransactionCandidates: unknown[];
      automationRules: unknown[];
      recurringItems: unknown[];
      recurringOccurrenceLinks: unknown[];
      recurringOccurrenceSkips: unknown[];
      [key: string]: unknown;
    };
  };
  return {
    schemaVersion: payload.schemaVersion,
    ledgerEvents: payload.data.ledgerEvents.length,
    externalTransactionCandidates:
      payload.data.externalTransactionCandidates.length,
    automationRules: payload.data.automationRules.length,
    recurringItems: payload.data.recurringItems.length,
    recurringOccurrenceLinks: payload.data.recurringOccurrenceLinks.length,
    recurringOccurrenceSkips: payload.data.recurringOccurrenceSkips.length,
    dataKeys: Object.keys(payload.data),
  };
}

async function expectRestorePreviewToBeReadOnly(page: Page) {
  const unsupportedMethod = await page.request.get("/api/data/restore");
  expect(unsupportedMethod.status()).toBe(405);

  const beforeResponse = await page.request.get("/api/data/backup");
  expect(beforeResponse.ok()).toBe(true);
  const before = (await beforeResponse.json()) as {
    schemaVersion: number;
    data: unknown;
  };

  const previewResponse = await page.request.post("/api/data/restore", {
    multipart: {
      mode: "preview",
      file: {
        name: "talli-backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(before)),
      },
    },
  });
  expect(previewResponse.status()).toBe(200);
  expect(await previewResponse.json()).toMatchObject({
    ok: true,
    mode: "preview",
    result: {
      schemaVersion: 7,
      target: "seed-only",
    },
  });

  const afterResponse = await page.request.get("/api/data/backup");
  expect(afterResponse.ok()).toBe(true);
  const after = (await afterResponse.json()) as { data: unknown };
  expect(after.data).toEqual(before.data);
}

test("rules remain projections and recurring posts only after explicit action", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const suffix = testInfo.project.name;
  const accountName = `${suffix}-V51-CNY`;
  const ruleName = `${suffix}-Coffee projection`;
  const recurringName = `${suffix}-Daily lunch`;
  const payee = `${suffix}-Lunch counter`;
  const today = new Date().toISOString().slice(0, 10);

  if (testInfo.project.name === "desktop-chromium") {
    await expectRestorePreviewToBeReadOnly(page);
  }

  await page.goto("/accounts/new");
  await page.getByLabel("账户名称").fill(accountName);
  await page.getByLabel("账户类型").selectOption("bank");
  await page.getByLabel("资产").selectOption("seed-asset-cny");
  await page.getByLabel("初始余额（可选）").fill("0.00");
  await page.getByRole("button", { name: "创建账户" }).click();
  await expect(page.getByRole("heading", { name: accountName })).toBeVisible();

  await page.goto("/transactions/new?type=expense");
  await page.getByLabel("金额").fill("12.34");
  await page.getByLabel("账户").selectOption({ label: `${accountName} · CNY` });
  await page.getByLabel("分类").selectOption({ label: "订阅" });
  await page.getByLabel("对象（可选）").fill(payee);
  await page.getByLabel("日期与时间").fill(`${today}T12:00`);
  await page.getByRole("button", { name: "保存支出" }).click();
  await expect(
    page.getByRole("heading", { name: `编辑${payee}` }),
  ).toBeVisible();
  const sourceEventUrl = page.url();

  const beforeRule = await automationBackupState(page);
  expect(beforeRule.schemaVersion).toBe(7);
  expect(beforeRule.dataKeys).not.toContain("ruleProjections");
  expect(beforeRule.dataKeys).not.toContain("recurringMatchSuggestions");
  expect(beforeRule.dataKeys).not.toContain("generatedOccurrences");

  await page.goto("/automation");
  await expect(page.getByRole("heading", { name: "Automation" })).toBeVisible();
  await expect(
    page.getByText("Rules only compute a projection."),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Condition" }).click();
  await expect(page.getByLabel("Condition field")).toHaveCount(2);
  await page.getByRole("button", { name: "Remove condition" }).last().click();
  await expect(page.getByLabel("Condition field")).toHaveCount(1);
  await page.getByLabel("Name").fill(ruleName);
  await page.getByLabel("Condition value").fill("Starbucks");
  await page.getByLabel("Action value").fill(`${suffix}-Coffee shop`);
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText(/0\/\d+ matched/)).toBeVisible();

  const afterPreview = await automationBackupState(page);
  expect(afterPreview.ledgerEvents).toBe(beforeRule.ledgerEvents);
  expect(afterPreview.externalTransactionCandidates).toBe(
    beforeRule.externalTransactionCandidates,
  );
  expect(afterPreview.automationRules).toBe(beforeRule.automationRules);

  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByText(ruleName, { exact: true })).toBeVisible();
  const afterRule = await automationBackupState(page);
  expect(afterRule.automationRules).toBe(beforeRule.automationRules + 1);
  expect(afterRule.ledgerEvents).toBe(beforeRule.ledgerEvents);

  await page.goto(sourceEventUrl);
  await page
    .getByRole("link", { name: "Create recurring expectation" })
    .click();
  await expect(page.getByText(/Prefilled from Ledger event/)).toBeVisible();
  await expect(page.getByLabel("Expected amount")).toHaveValue("12.34");
  await page.getByLabel("Name").fill(recurringName);
  await page.getByLabel("Frequency").selectOption("monthly");
  await page.getByLabel("Every").fill("1");
  await expect(page.getByLabel("Anchor date")).toHaveValue(today);
  await page.getByRole("button", { name: "Save recurring item" }).click();
  const recurringCard = page.locator(".recurring-card").filter({
    hasText: recurringName,
  });
  await expect(recurringCard).toBeVisible();
  await expect(recurringCard).toContainText("12.34 CNY");

  const afterDefinition = await automationBackupState(page);
  expect(afterDefinition.recurringItems).toBe(beforeRule.recurringItems + 1);
  expect(afterDefinition.ledgerEvents).toBe(beforeRule.ledgerEvents);
  expect(afterDefinition.recurringOccurrenceLinks).toBe(
    beforeRule.recurringOccurrenceLinks,
  );

  await recurringCard.getByRole("link", { name: "Timeline" }).click();
  const occurrence = page
    .locator(".occurrence-card")
    .filter({ hasText: today });
  await expect(occurrence).toBeVisible();
  await occurrence
    .getByLabel("Link existing suggestion")
    .selectOption({ index: 1 });
  await occurrence.getByRole("button", { name: "Link explicitly" }).click();
  await expect(occurrence.getByText("linked", { exact: true })).toBeVisible();

  const timeline = page.locator(".occurrence-card");
  await expect(timeline).toHaveCount(3);
  page.once("dialog", (dialog) => dialog.accept());
  await timeline
    .nth(1)
    .getByRole("button", { name: "Skip occurrence" })
    .click();
  await expect(
    timeline.nth(1).getByText("skipped", { exact: true }),
  ).toBeVisible();

  await timeline.nth(2).getByText("Post occurrence explicitly").click();
  await expect(timeline.nth(2).getByLabel("Actual amount")).toHaveValue(
    "12.34",
  );
  await timeline
    .nth(2)
    .getByRole("button", { name: "Create Ledger event + link" })
    .click();
  await expect(
    page.getByRole("heading", { name: `编辑${payee}` }),
  ).toBeVisible();

  const afterPost = await automationBackupState(page);
  expect(afterPost.ledgerEvents).toBe(beforeRule.ledgerEvents + 1);
  expect(afterPost.recurringOccurrenceLinks).toBe(
    beforeRule.recurringOccurrenceLinks + 2,
  );
  expect(afterPost.recurringOccurrenceSkips).toBe(
    beforeRule.recurringOccurrenceSkips + 1,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
