import { expect, test } from "@playwright/test";

test("renders the V1 engineering shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "多资产个人账本" }),
  ).toBeVisible();
  await expect(page.getByText("不接入行情、汇率或统一估值")).toBeVisible();
});
