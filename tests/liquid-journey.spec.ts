import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
}

test("home discloses the real read-only Hermes channel", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "今天想让我做什么？" }),
    ).toBeVisible();
    await expect(page.getByText("Hermes 实时只读")).toHaveCount(1);
    await expect(
      page.getByText("Hermes 实时通道 · 朴朴首版只读模式"),
    ).toBeVisible();
    await expect(page.getByText("示例数据")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  }
});

test("free-form requests enter the live journey canvas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("输入生活指令").fill("查一下朴朴购物车");
  await page.getByRole("button", { name: "发送指令" }).click();

  await expect(
    page.getByRole("heading", { name: "把需求变成一份可执行的方案" }),
  ).toBeVisible();
  await expect(page.getByText("来自你的输入")).toBeVisible();
  await expect(page.getByText("查一下朴朴购物车", { exact: true })).toBeVisible();
  await expect(page.getByTestId("floating-composer")).toBeVisible();
  await expect(page.getByRole("button", { name: "返回首页" })).toBeEnabled();
  await expect(page.getByText("示例数据")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "加入购物车" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "同步到朴朴购物车" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("every example uses the same live adapter without mock results", async ({
  page,
}) => {
  for (const label of ["今晚吃什么", "朴朴帮我买", "确认退款"]) {
    await page.goto("/");
    await page.getByRole("button", { name: label }).click();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByTestId("journey-origin")).toBeVisible();
    await expect(page.getByText("示例数据")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "加入购物车" })).toHaveCount(0);
    await page.getByRole("button", { name: "返回首页" }).click();
    await expect(
      page.getByRole("heading", { name: "今天想让我做什么？" }),
    ).toBeVisible();
  }
});

test("provider outcomes remain explicit without fabricated data", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "朴朴帮我买" }).click();

  await expect
    .poll(
      async () =>
        (await page.getByRole("alert").count()) +
        (await page.getByText("方案已准备好", { exact: true }).count()) +
        (await page.locator(".pupu-purchase-card").count()),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  if (await page.getByRole("alert").count()) {
    await expect(page.getByRole("button", { name: "重试" })).toBeEnabled();
  }
  await expect(page.getByText("示例数据")).toHaveCount(0);
  await expect(page.getByText("谷饲肥牛卷")).toHaveCount(0);
  await expect(page.getByText("¥74.60 / ¥120")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "加入购物车" })).toHaveCount(0);
});

test("reduced motion keeps the live canvas actionable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "今晚吃什么" }).click();

  await expect(page.getByTestId("floating-composer")).toBeVisible();
  await expect(page.getByRole("button", { name: "返回首页" })).toBeEnabled();
});
