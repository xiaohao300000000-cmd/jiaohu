import { expect, test } from "@playwright/test";
import { installJourneyContractRoute } from "./journey-stream";

test("home promises only current Pupu read-only capabilities", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "今天想让我做什么？" }),
  ).toBeVisible();
  await expect(page.getByText("直接告诉我你的需求。")).toBeVisible();
  for (const label of ["朴朴搜索商品", "查看朴朴商品详情", "查看朴朴购物车"]) {
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  }
  await expect(page.getByText(/快递|外卖|确认退款/)).toHaveCount(0);
});

test("controlled success stream renders the PostgreSQL TaskSnapshot FinalPlan", async ({
  page,
}) => {
  await installJourneyContractRoute(page, "success");
  await page.goto("/");
  await page.getByRole("button", { name: "朴朴搜索商品" }).click();

  const card = page.locator('[data-component="pupu.purchase-plan"]');
  await expect(card).toHaveAttribute("data-source", "task-snapshot");
  await expect(page.getByText("Agent 选定的采购方案")).toBeVisible();
  await expect(page.getByTestId("journey-origin")).toHaveAttribute(
    "data-journey-state",
    "ready",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("示例数据")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "加入购物车", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "确认加入朴朴购物车", exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "查看已选商品（1 件）" }).click();
  await expect(page.getByText("Contract 牛奶")).toBeVisible();
});

test("controlled provider failure is an explicit error outcome, never success", async ({
  page,
}) => {
  await installJourneyContractRoute(page, "error");
  await page.goto("/");
  await page.getByRole("button", { name: "朴朴搜索商品" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeEnabled();
  await expect(
    page.locator('[data-component="pupu.purchase-plan"]'),
  ).toHaveCount(0);
  await expect(page.getByText("Agent 决策已完成")).toHaveCount(0);
});

test("reduced motion keeps the controlled canvas actionable", async ({
  page,
}) => {
  await installJourneyContractRoute(page, "success");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "查看朴朴购物车" }).click();

  await expect(page.getByTestId("floating-composer")).toBeVisible();
  await expect(page.getByRole("button", { name: "返回首页" })).toBeEnabled();
});
