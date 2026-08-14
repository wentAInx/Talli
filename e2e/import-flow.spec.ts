import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

interface BackupCounts {
  schemaVersion: number;
  ledgerEvents: number;
  snapshots: number;
  candidates: number;
  importLinks: number;
  matchLinks: number;
  fileBatches: number;
  automationRules: number;
  recurringItems: number;
  recurringOccurrenceLinks: number;
}

async function backupCounts(page: Page): Promise<BackupCounts> {
  const response = await page.request.get("/api/data/backup");
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as {
    schemaVersion: number;
    data: {
      ledgerEvents: unknown[];
      balanceSnapshots: unknown[];
      externalTransactionCandidates: unknown[];
      externalImportLinks: unknown[];
      externalCandidateMatchLinks: unknown[];
      fileImportBatches: unknown[];
      automationRules: unknown[];
      recurringItems: unknown[];
      recurringOccurrenceLinks: unknown[];
    };
  };
  return {
    schemaVersion: payload.schemaVersion,
    ledgerEvents: payload.data.ledgerEvents.length,
    snapshots: payload.data.balanceSnapshots.length,
    candidates: payload.data.externalTransactionCandidates.length,
    importLinks: payload.data.externalImportLinks.length,
    matchLinks: payload.data.externalCandidateMatchLinks.length,
    fileBatches: payload.data.fileImportBatches.length,
    automationRules: payload.data.automationRules.length,
    recurringItems: payload.data.recurringItems.length,
    recurringOccurrenceLinks: payload.data.recurringOccurrenceLinks.length,
  };
}

async function expectNoHorizontalPageOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("financial file import stays outside Ledger until explicit match or import", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  if (testInfo.project.name === "desktop-chromium") {
    const crossOriginPreview = await page.request.post("/api/import/preview", {
      headers: { Origin: "https://example.invalid" },
      multipart: {},
    });
    expect(crossOriginPreview.status()).toBe(403);
  }

  const suffix = testInfo.project.name;
  const accountName = `${suffix}-V5-CNY`;
  const profileName = `${suffix}-CSV-statement`;
  const tagName = `${suffix}-Payroll`;
  const ruleName = `${suffix}-Employer projection`;
  const projectedPayee = `${suffix}-Payroll department`;
  const recurringName = `${suffix}-Monthly salary`;

  await page.goto("/accounts/new");
  await page.getByLabel("账户名称").fill(accountName);
  await page.getByLabel("账户类型").selectOption("bank");
  await page.getByLabel("资产").selectOption("seed-asset-cny");
  await page.getByLabel("初始余额（可选）").fill("0.00");
  await page.getByRole("button", { name: "创建账户" }).click();
  await expect(page.getByRole("heading", { name: accountName })).toBeVisible();
  const accountUrl = page.url();
  const accountId = accountUrl.split("/").at(-1)!;

  await page.goto("/transactions/new?type=expense");
  await page.getByLabel("金额").fill("35.00");
  await page.getByLabel("账户").selectOption({ label: `${accountName} · CNY` });
  await page.getByLabel("对象（可选）").fill("Starbucks");
  await page.getByLabel("日期与时间").fill("2026-08-10T12:00");
  await page.getByRole("button", { name: "保存支出" }).click();
  await expect(
    page.getByRole("heading", { name: "编辑Starbucks" }),
  ).toBeVisible();
  const existingEventUrl = page.url();

  await page.goto(accountUrl);
  await page.getByRole("link", { name: "Import statement" }).click();
  await expect(
    page.getByRole("heading", { name: "Import Studio" }),
  ).toBeVisible();
  await expect(page.getByLabel("Target account")).toHaveValue(accountId);
  await page.getByLabel("Profile name").fill(profileName);
  const createProfileButton = page.getByRole("button", {
    name: "Create explicit import profile",
  });
  await createProfileButton.click();
  await expect(
    page.getByText(profileName, { exact: true }).first(),
  ).toBeVisible();
  await expect(createProfileButton).toBeEnabled();
  await page
    .getByLabel("Import profile")
    .selectOption({ label: `${profileName} · ${accountName} · CNY` });

  await page.goto("/settings#tags");
  await page.getByLabel("标签名称").fill(tagName);
  const createTagButton = page.getByRole("button", { name: "新增标签" });
  await createTagButton.click();
  expect(
    await page
      .locator("#tags input")
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      ),
  ).toContain(tagName);
  await expect(createTagButton).toBeEnabled();

  await page.goto("/automation");
  await page.getByLabel("Name").fill(ruleName);
  await page.getByLabel("Condition value").fill("Employer");
  await page.getByRole("button", { name: "+ Condition" }).click();
  await page.getByLabel("Condition field").nth(1).selectOption("direction");
  await page.getByLabel("Direction").selectOption("in");
  await page.getByRole("button", { name: "+ Condition" }).click();
  await page.getByLabel("Condition field").nth(2).selectOption("file_profile");
  await page.getByLabel("File profile").selectOption({ label: profileName });
  await page.getByLabel("Action value").fill(projectedPayee);
  await page.getByRole("button", { name: "+ Action" }).click();
  await page.getByLabel("Action type").nth(1).selectOption("set_category");
  await page.getByLabel("Action category").selectOption({ label: "工资/收入" });
  await page.getByRole("button", { name: "+ Action" }).click();
  await page.getByLabel("Action type").nth(2).selectOption("add_tag");
  await page.getByLabel("Action tag").selectOption({ label: tagName });
  await page.getByRole("button", { name: "+ Action" }).click();
  await page
    .getByLabel("Action type")
    .nth(3)
    .selectOption("suggest_event_type");
  await page.getByLabel("Suggested event type").selectOption("income");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText(/0\/\d+ matched/)).toBeVisible();
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByText(ruleName, { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Recurring", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create recurring item" }),
  ).toBeVisible();
  await page.getByLabel("Name").fill(recurringName);
  await page
    .getByLabel("Account")
    .selectOption({ label: `${accountName} · CNY` });
  await page.getByLabel("Event type").selectOption("income");
  await page
    .getByLabel("Category")
    .selectOption({ label: "工资/收入 · income" });
  await page.getByLabel("Payee text").fill(projectedPayee);
  await page.getByLabel("Payee match").selectOption("exact");
  await page.getByLabel(tagName).check();
  await page.getByLabel("Expected amount").fill("20000.00");
  await page.getByLabel("Frequency").selectOption("monthly");
  await page.getByLabel("Anchor date").fill("2026-08-11");
  await page.getByRole("button", { name: "Save recurring item" }).click();
  await expect(page.getByText(recurringName, { exact: true })).toBeVisible();

  await page.goto("/import");
  await page
    .getByLabel("Import profile")
    .selectOption({ label: `${profileName} · ${accountName} · CNY` });

  const beforeCommit = await backupCounts(page);
  expect(beforeCommit.schemaVersion).toBe(7);

  await page
    .getByLabel("Statement file")
    .setInputFiles(
      join(
        process.cwd(),
        "docs/v5-financial-file-import/fixtures/sample_bank.csv",
      ),
    );
  await page.getByRole("button", { name: "Preview file" }).click();
  await expect(
    page
      .locator(".import-stat-rail")
      .getByText("Rows", { exact: true })
      .locator(".."),
  ).toContainText("4");
  await expect(page.getByText("Possible Ledger match")).toBeVisible();
  await expect(page.getByText("CSV profile mapping")).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Create review candidates" }).click();
  await expect(page.getByText(/No Ledger event was created/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent batches" }),
  ).toBeVisible();
  const starbucksCandidate = page
    .locator(".import-candidate-row")
    .filter({ hasText: accountName })
    .filter({ hasText: "Starbucks" })
    .getByRole("link");
  await expect(starbucksCandidate).toBeVisible();

  const afterCommit = await backupCounts(page);
  expect(afterCommit).toMatchObject({
    schemaVersion: 7,
    ledgerEvents: beforeCommit.ledgerEvents,
    snapshots: beforeCommit.snapshots,
    candidates: beforeCommit.candidates + 4,
    importLinks: beforeCommit.importLinks,
    matchLinks: beforeCommit.matchLinks,
    fileBatches: beforeCommit.fileBatches + 1,
    automationRules: beforeCommit.automationRules,
    recurringItems: beforeCommit.recurringItems,
    recurringOccurrenceLinks: beforeCommit.recurringOccurrenceLinks,
  });

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Create review candidates" }).click();
  await expect(page.getByText(/4 already imported/)).toBeVisible();
  expect(await backupCounts(page)).toEqual(afterCommit);

  await page.goto("/automation");
  await page
    .locator(".automation-rule-row")
    .filter({ hasText: ruleName })
    .getByRole("button", { name: "Edit" })
    .click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText(/1\/\d+ matched/)).toBeVisible();
  await page.goto("/import");

  await starbucksCandidate.click();
  await expect(
    page.getByRole("heading", { name: "Match Existing" }),
  ).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  await expect(page.getByText(/Starbucks.*score/i)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Match Existing" }).click();
  await expect(
    page.getByText("Matched existing event", { exact: true }),
  ).toBeVisible();
  const afterMatch = await backupCounts(page);
  expect(afterMatch.ledgerEvents).toBe(afterCommit.ledgerEvents);
  expect(afterMatch.matchLinks).toBe(afterCommit.matchLinks + 1);

  await page.getByRole("link", { name: "View Ledger event" }).click();
  await expect(
    page.getByRole("heading", { name: "编辑与删除已锁定" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "保存支出" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "删除交易" })).toHaveCount(0);
  await page.getByRole("link", { name: /Review Starbucks/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Unlink match" }).click();
  await expect(
    page.getByText("New review candidate", { exact: true }),
  ).toBeVisible();
  await page.goto(existingEventUrl);
  await expect(page.getByRole("button", { name: "保存支出" })).toBeVisible();

  await page.goto("/import");
  await page
    .locator(".import-candidate-row")
    .filter({ hasText: accountName })
    .filter({ hasText: "Employer" })
    .getByRole("link")
    .click();
  await expect(
    page.getByRole("heading", { name: "Automation suggestions" }),
  ).toBeVisible();
  const employerCandidateUrl = page.url();
  await expect(page.getByText(ruleName, { exact: true })).toBeVisible();
  await expect(page.getByText(`Employer → ${projectedPayee}`)).toBeVisible();
  await expect(page.getByLabel("Payee")).toHaveValue(projectedPayee);
  await expect(page.getByLabel("Category")).toHaveValue(
    "seed-category-income-salary",
  );
  await expect(page.getByLabel(tagName)).toBeChecked();
  await page.getByRole("link", { name: "Create recurring draft" }).click();
  await expect(page.getByText(/Prefilled from file candidate/)).toBeVisible();
  await expect(page.getByLabel("Expected amount")).toHaveValue("20000.00");
  await expect(page.getByLabel("Anchor date")).toHaveValue("2026-08-11");
  await page.goto(employerCandidateUrl);
  await page.getByLabel("导入为").selectOption("income");
  await expect(
    page.getByLabel("Link to recurring occurrence (optional)"),
  ).toHaveValue("");
  await page
    .getByLabel("Link to recurring occurrence (optional)")
    .selectOption({ index: 1 });
  await page
    .getByLabel("备注（可选）")
    .fill("User confirmed automation metadata");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "导入到 Talli" }).click();
  await expect(
    page.getByRole("heading", { name: `编辑${projectedPayee}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "此事件来自明确导入" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "查看 file candidate" }),
  ).toBeVisible();

  const afterImport = await backupCounts(page);
  expect(afterImport.ledgerEvents).toBe(afterCommit.ledgerEvents + 1);
  expect(afterImport.importLinks).toBe(afterCommit.importLinks + 1);
  expect(afterImport.matchLinks).toBe(afterCommit.matchLinks);
  expect(afterImport.recurringOccurrenceLinks).toBe(
    afterCommit.recurringOccurrenceLinks + 1,
  );

  await page.goto("/import?queue=imported");
  await expect(
    page
      .locator(".import-candidate-row")
      .filter({ hasText: accountName })
      .filter({ hasText: "Employer" })
      .getByRole("link"),
  ).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("OFX closing balance remains an observation until explicit reconcile", async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const suffix = testInfo.project.name;
  const accountName = `${suffix}-V5-OFX-USD`;
  const profileName = `${suffix}-OFX-profile`;
  await page.goto("/accounts/new");
  await page.getByLabel("账户名称").fill(accountName);
  await page.getByLabel("账户类型").selectOption("bank");
  await page.getByLabel("资产").selectOption("seed-asset-usd");
  await page.getByLabel("初始余额（可选）").fill("0.00");
  await page.getByRole("button", { name: "创建账户" }).click();
  await page.getByRole("link", { name: "Import statement" }).click();
  await page.getByLabel("Profile name").fill(profileName);
  await page.getByLabel("Statement format").selectOption("ofx");
  await page
    .getByRole("button", { name: "Create explicit import profile" })
    .click();
  await expect(
    page.getByText(profileName, { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel("Import profile").selectOption({
    label: `${profileName} · ${accountName} · USD`,
  });

  const beforeCommit = await backupCounts(page);
  await page
    .getByLabel("Statement file")
    .setInputFiles(
      join(
        process.cwd(),
        "docs/v5-financial-file-import/fixtures/sample_bank_ofx1.ofx",
      ),
    );
  await page.getByRole("button", { name: "Preview file" }).click();
  await expect(
    page
      .locator(".statement-fingerprint")
      .getByText("••••6789", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Closing closing_ledger: 1465.25 USD/),
  ).toBeVisible();
  await page
    .getByLabel(/I explicitly confirm account ••••6789 and USD/)
    .check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Create review candidates" }).click();
  await expect(page.getByText(/No Ledger event was created/)).toBeVisible();

  const afterCommit = await backupCounts(page);
  expect(afterCommit.ledgerEvents).toBe(beforeCommit.ledgerEvents);
  expect(afterCommit.snapshots).toBe(beforeCommit.snapshots);
  expect(afterCommit.fileBatches).toBe(beforeCommit.fileBatches + 1);

  const observation = page.locator(".observation-card").filter({
    hasText: accountName,
  });
  await expect(observation).toContainText("1465.25 USD");
  page.once("dialog", (dialog) => dialog.accept());
  await observation.getByRole("button", { name: "调整账本为外部余额" }).click();
  await expect(
    observation.getByRole("button", { name: "已创建余额快照" }),
  ).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  const afterReconcile = await backupCounts(page);
  expect(afterReconcile.ledgerEvents).toBe(afterCommit.ledgerEvents);
  expect(afterReconcile.snapshots).toBe(afterCommit.snapshots + 1);
  expect(consoleErrors).toEqual([]);
});
