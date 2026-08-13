import { expect, test } from "@playwright/test";

test.skip(process.env.PUPU_LIVE !== "1", "real Pupu acceptance requires an explicit live gate");

test.setTimeout(600_000);

test("real Hermes run returns a live Pupu presentation and reaches ready", async ({
  page,
}) => {
  const chatResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/chat") &&
      response.request().method() === "POST",
    { timeout: 600_000 },
  );

  await page.goto("/");
  await page
    .getByRole("textbox", { name: "输入生活指令" })
    .fill(
      "请使用 pupu_search_catalog 只读工具，在朴朴搜索牛奶。必须依据本次工具结果回答，不要猜测。",
    );
  await page.getByRole("button", { name: "发送指令" }).click();

  const loginForm = page.getByRole("form", { name: "朴朴登录" });
  const needsLogin = await Promise.race([
    loginForm
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false),
    chatResponse.then(() => false),
  ]);

  if (needsLogin) {
    const phone = process.env.PUPU_LIVE_PHONE;
    if (!phone) {
      throw new Error("PUPU_LIVE_PHONE is required for a fresh live login");
    }
    await page.getByLabel("手机号").fill(phone);
    await page.getByRole("button", { name: /继续验证/ }).click();

    const captcha = page.getByTitle("朴朴安全验证");
    const smsForm = page.getByRole("form", { name: "短信验证" });
    await expect(captcha.or(smsForm)).toBeVisible({ timeout: 60_000 });
    if (await captcha.isVisible()) {
      if (process.env.PUPU_LIVE_MANUAL !== "1") {
        throw new Error("fresh captcha requires PUPU_LIVE_MANUAL=1 and an operator");
      }
      await expect(smsForm).toBeVisible({ timeout: 300_000 });
    }

    const otp = process.env.PUPU_LIVE_OTP;
    if (otp) {
      await page.getByLabel("短信验证码").fill(otp);
      await page.getByRole("button", { name: "验证并继续" }).click();
    } else if (process.env.PUPU_LIVE_MANUAL === "1") {
      await expect(page.locator('[data-component="pupu.login"]')).toHaveCount(0, {
        timeout: 300_000,
      });
    } else {
      throw new Error("PUPU_LIVE_OTP or manual operator input is required");
    }
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
