import { expect, test } from "@playwright/test";
import { installJourneyContractRoute } from "./journey-stream";

const longRequest =
  "今晚两个人吃什么，希望清淡一点，不要香菜，控制在一百二十元以内，而且最好三十分钟左右可以准备好";
test.beforeEach(async ({ page }) => {
  await installJourneyContractRoute(page);
});

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

test("a long controlled request stays attached behind the fixed composer", async ({
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
  await expect(page.locator('.journey-origin [style*="filter"]')).toHaveCount(
    0,
  );

  const sourceSize = await source.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    height: node.getBoundingClientRect().height,
  }));
  expect(sourceSize.scrollWidth).toBeLessThanOrEqual(sourceSize.clientWidth);
  expect(sourceSize.height).toBeGreaterThan(20);
});

test("controlled canvas preserves glass materials and exposes no mutation actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "朴朴搜索商品" }).click();

  const material = await page.evaluate(() => {
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
      originBackground: origin.backgroundColor,
      originBackdrop: origin.backdropFilter,
      composerBackground: composer.backgroundColor,
      composerBackdrop: composer.backdropFilter,
      css,
    };
  });

  expect(material.originBackground).toMatch(
    /^rgba\(31, 32, 32, 0\.[4-7]\d?\)$/,
  );
  expect(material.originBackdrop).toContain("blur(28px)");
  expect(material.composerBackground).toMatch(
    /^rgba\(31, 32, 32, 0\.[3-6]\d?\)$/,
  );
  expect(material.composerBackdrop).toContain("blur(30px)");
  expect(material.css).toContain("prefers-reduced-transparency: reduce");
  await expect(page.getByRole("button", { name: "加入购物车" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "同步到朴朴购物车" }),
  ).toHaveCount(0);
});
