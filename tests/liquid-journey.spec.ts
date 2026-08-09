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

test("universal home anchors lightweight answers below the composer", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "今天想让我做什么？" }),
    ).toBeVisible();
    await page.getByLabel("输入生活指令").fill("查一下我的快递");
    await page.getByRole("button", { name: "发送指令" }).click();

    const composer = page.getByTestId("home-composer");
    const result = page.getByTestId("anchored-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("你的包裹正在派送");
    await expect(result).toContainText("示例数据");

    const composerBox = await composer.boundingBox();
    const resultBox = await result.boundingBox();
    expect(composerBox).not.toBeNull();
    expect(resultBox).not.toBeNull();
    expect(resultBox!.y).toBeGreaterThanOrEqual(
      composerBox!.y + composerBox!.height,
    );
    await expectNoHorizontalOverflow(page);
  }
});

test("complex requests take over the canvas without clipping the final action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "今晚吃什么" }).click();

  await expect(
    page.getByRole("heading", { name: "把需求变成一份可执行的方案" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "查看采购方案" })).toBeVisible();

  const resultsBox = await page
    .locator('[data-journey-region="results"]')
    .boundingBox();
  const actionBox = await page
    .locator('[data-journey-region="action"]')
    .boundingBox();
  const composerBox = await page.locator(".canvas-composer").boundingBox();
  expect(resultsBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(actionBox!.y).toBeGreaterThanOrEqual(resultsBox!.y + resultsBox!.height);
  expect(composerBox!.y).toBeGreaterThanOrEqual(actionBox!.y + actionBox!.height);
  await expectNoHorizontalOverflow(page);
});

test("Pupu purchase becomes an assistant cart before real-cart approval", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "朴朴帮我买" }).click();

    const plan = page.locator(".pupu-purchase-card");
    await expect(
      page.getByRole("heading", { name: "今晚的火锅采购方案" }),
    ).toBeVisible();
    await expect(plan).toContainText("示例数据");
    await expect(plan.locator("img").first()).toBeVisible();
    await expect
      .poll(() => plan.locator("img").first().evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);

    const planBox = await plan.boundingBox();
    const composerBox = await page.locator(".canvas-composer").boundingBox();
    expect(planBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    expect(composerBox!.y).toBeGreaterThanOrEqual(planBox!.y + planBox!.height);
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "加入购物车" }).click();
    await expect(page.getByText("已加入助手购物车")).toBeVisible();
    await expect(page.getByText("购物车版本 v1")).toBeVisible();

    await page.getByRole("button", { name: "同步到朴朴购物车" }).click();
    const sheet = page.getByRole("dialog", { name: "需要你的确认" });
    await expect(sheet).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "确认同步到朴朴购物车" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "长按确认" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("high-risk requests rise in a dismissible bottom sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "确认退款" }).click();

  const sheet = page.getByRole("dialog", { name: "需要你的确认" });
  await expect(sheet).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "今天想让我做什么？" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "确认退款申请" })).toBeVisible();

  const sheetBox = await sheet.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(844);
  const approval = page.getByRole("button", { name: "长按确认" });
  await approval.hover();
  await page.mouse.down();
  await page.waitForTimeout(950);
  await page.mouse.up();
  await expect(sheet).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("reduced motion keeps every presentation actionable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "今晚吃什么" }).click();
  await expect(page.getByRole("button", { name: "查看采购方案" })).toBeEnabled();
});
