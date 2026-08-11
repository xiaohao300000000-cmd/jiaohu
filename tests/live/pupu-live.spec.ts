import { expect, test } from "@playwright/test";

test("real Hermes run returns a live Pupu presentation and reaches ready", async ({
  page,
}) => {
  const chatResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/chat") &&
      response.request().method() === "POST",
  );

  await page.goto("/");
  await page
    .getByRole("textbox", { name: "输入生活指令" })
    .fill(
      "请使用 pupu_search_catalog 只读工具，在朴朴搜索牛奶。必须依据本次工具结果回答，不要猜测。",
    );
  await page.getByRole("button", { name: "发送指令" }).click();

  expect((await chatResponse).status()).toBe(200);

  const card = page.locator('[data-component="pupu.purchase-plan"]');
  const providerError = page.getByRole("alert");
  await expect(card.or(providerError)).toBeVisible({ timeout: 60_000 });

  if (await providerError.isVisible()) {
    await expect(page.getByTestId("journey-origin")).toHaveAttribute(
      "data-journey-state",
      "error",
    );
    await expect(page.getByText("Agent 决策已完成")).toHaveCount(0);
    throw new Error(
      `Live Pupu provider did not return success: ${await providerError.innerText()}`,
    );
  }

  await expect(card).toHaveAttribute("data-source", "live", {
    timeout: 60_000,
  });
  await expect(card).toHaveAttribute("data-run-id", /.+/);
  await expect(page.getByTestId("journey-origin")).toHaveAttribute(
    "data-journey-state",
    "ready",
  );
  await expect(page.getByText("Agent 决策已完成")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("示例数据")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "加入购物车" })).toHaveCount(0);

  const evidence = page.getByRole("button", {
    name: /查看商品证据（[1-9]\d* 件）/,
  });
  await expect(evidence).toBeVisible();
  await evidence.click();
  expect(await page.locator(".pupu-product").count()).toBeGreaterThan(0);
});
