import { expect, test } from "@playwright/test";

const longRequest =
  "今晚两个人吃什么，希望清淡一点，不要香菜，控制在一百二十元以内，而且最好三十分钟左右可以准备好";

test("home keeps the same neutral dark glass foundation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const material = await page.locator(".home-composer").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      backdrop: style.backdropFilter,
    };
  });

  expect(material.background).toMatch(/^rgba\(31, 32, 32, 0\.[4-7]\d?\)$/);
  expect(material.backdrop).toContain("blur(24px)");
  await expect(page).toHaveScreenshot("agent-home-dark.png", {
    animations: "disabled",
  });
});

test("a long request stays attached while the task grows behind the composer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("输入生活指令").fill(longRequest);
  await page.getByRole("button", { name: "发送指令" }).click();

  const origin = page.getByTestId("journey-origin");
  const source = origin.getByText(longRequest, { exact: true });
  const floatingLayer = page.locator(".floating-composer-layer");
  await expect(origin).toHaveAttribute("data-layout-id", "journey-origin");
  await expect(source).toBeVisible();
  await expect(floatingLayer).toHaveCSS("position", "fixed");
  await expect(page.locator('.journey-origin [style*="filter"]')).toHaveCount(0);

  const sourceSize = await source.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    height: node.getBoundingClientRect().height,
  }));
  expect(sourceSize.scrollWidth).toBeLessThanOrEqual(sourceSize.clientWidth);
  expect(sourceSize.height).toBeGreaterThan(20);

  await expect(page.getByRole("button", { name: "查看采购方案" })).toBeVisible();
  await expect(page).toHaveScreenshot("source-anchored-ready.png", {
    animations: "disabled",
    fullPage: false,
  });

  await page.getByRole("button", { name: "查看采购方案" }).scrollIntoViewIfNeeded();
  const actionBox = await page.getByRole("button", { name: "查看采购方案" }).boundingBox();
  const composerBox = await floatingLayer.boundingBox();
  expect(actionBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(composerBox!.y);

});

test("Pupu decision screenshots preserve collapsed and expanded evidence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "朴朴帮我买" }).click();

  await expect(page.getByText("¥74.60 / ¥120")).toBeVisible();
  await expect(page.getByText("谷饲肥牛卷")).toHaveCount(0);

  const material = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const canvas = getComputedStyle(document.querySelector(".canvas-shell")!);
    const origin = getComputedStyle(
      document.querySelector('[data-testid="journey-origin"]')!,
    );
    const composer = getComputedStyle(
      document.querySelector('[data-testid="floating-composer"]')!,
    );
    const css = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules, (rule) => rule.cssText))
      .join("\\n");
    return {
      bodyBackground: body.backgroundColor,
      canvasBackground: canvas.backgroundColor,
      canvasRadius: canvas.borderRadius,
      originBackground: origin.backgroundColor,
      originBackdrop: origin.backdropFilter,
      composerBackground: composer.backgroundColor,
      composerBackdrop: composer.backdropFilter,
      css,
    };
  });

  expect(material.bodyBackground).toBe("rgb(19, 20, 20)");
  expect(material.canvasBackground).toBe("rgba(0, 0, 0, 0)");
  expect(material.canvasRadius).toBe("0px");
  expect(material.originBackground).toMatch(
    /^rgba\(31, 32, 32, 0\.[4-7]\d?\)$/,
  );
  expect(material.originBackdrop).toContain("blur(28px)");
  expect(material.composerBackground).toMatch(
    /^rgba\(31, 32, 32, 0\.[3-6]\d?\)$/,
  );
  expect(material.composerBackdrop).toContain("blur(30px)");
  expect(material.css).toContain("prefers-reduced-transparency: reduce");
  await expect(page).toHaveScreenshot("pupu-decision-collapsed.png", {
    animations: "disabled",
  });

  await page.getByRole("button", { name: "查看商品证据（3 件）" }).click();
  await expect(page.getByText("谷饲肥牛卷")).toBeVisible();
  await expect(page).toHaveScreenshot("pupu-decision-expanded.png", {
    animations: "disabled",
  });

  await page.getByRole("button", { name: "加入购物车" }).click();
  await expect(page.getByText("已加入助手购物车")).toBeVisible();
  await expect(page).toHaveScreenshot("pupu-assistant-cart.png", {
    animations: "disabled",
  });
});

test("approval sheet traps focus and restores its source action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "确认退款" });
  await trigger.click();

  const sheetMaterial = await page.locator(".task-sheet").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      backdrop: style.backdropFilter,
    };
  });
  expect(sheetMaterial.background).toMatch(
    /^rgba\(31, 32, 32, 0\.[7-9]\d?\)$/,
  );
  expect(sheetMaterial.backdrop).toContain("blur(26px)");
  const close = page.getByRole("button", { name: "关闭确认面板" });
  await expect(close).toBeFocused();
  await expect(page.locator(".app-shell")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "需要你的确认" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
