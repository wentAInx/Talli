import { expect, test } from "@playwright/test";

test("renders the native-asset dashboard shell", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("资产总览 | Talli");
  await expect(page.getByRole("heading", { name: "资产总览" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "记一笔" }).first(),
  ).toBeVisible();
  await expect(page.getByText(/种资产 · .*个活跃账户/)).toBeVisible();
  await expect(page.getByText(/总资产[：:]/)).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeVisible();
});
