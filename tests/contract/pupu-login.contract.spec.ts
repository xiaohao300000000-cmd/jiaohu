import { expect, test, type Page, type Request } from "@playwright/test";

interface LoginContract {
  chatRequests: Request[];
  cancelRequests: Request[];
}

async function installLoginTransitions(page: Page): Promise<LoginContract> {
  const chatRequests: Request[] = [];
  const cancelRequests: Request[] = [];

  await page.route("**/api/chat", async (route) => {
    const request = route.request();
    chatRequests.push(request);
    const body = request.postDataJSON() as { requestId?: string };
    const requestId = body.requestId || "login-contract-request";
    const task = {
      taskId: "login-contract-task",
      version: 1,
      requestText: "朴朴任务",
      domain: "commerce",
      goal: "find_products",
      phase: "awaiting_login",
      context: {
        dietaryRequirements: [],
        requirements: [],
        selectedProducts: [],
      },
      requestedCapabilities: ["commerce.catalog.search"],
      allowedCapabilities: [],
      nextActions: ["login_pupu"],
    };
    const event = (data: unknown) =>
      `data: ${JSON.stringify({ type: "data-journey", data })}\n\n`;
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body:
        event({ type: "task.updated", requestId, task }) +
        event({
          type: "presentation.updated",
          requestId,
          presentation: {
            capability: "pupu",
            component: "pupu.login",
            mode: "anchored",
            dataSource: "live",
            payload: { phase: "phone" },
          },
        }) +
        "data: [DONE]\n\n",
    });
  });
  await page.route("**/api/pupu/login/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/api/pupu/login/status") {
      await route.fulfill({ json: { phase: "auth_required" } });
      return;
    }
    if (path === "/api/pupu/login/start") {
      await route.fulfill({
        json: {
          phase: "captcha",
          attemptId: "attempt-contract",
          captchaUrl: "/api/pupu/login/captcha/attempt-contract/",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      });
      return;
    }
    if (path === "/api/pupu/login/captcha/attempt-contract/") {
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Contract captcha</title><p>slider boundary</p>",
      });
      return;
    }
    if (
      path === "/api/pupu/login/captcha/complete" ||
      path === "/api/pupu/login/resend" ||
      path === "/api/pupu/login/verify"
    ) {
      await route.fulfill({
        json: {
          phase: "sms",
          attemptId: "attempt-contract",
          retryAfterSeconds: 0,
          expiresAt: "2099-01-01T00:00:00.000Z",
          ...(path.endsWith("/verify")
            ? {
                error: {
                  code: "invalid_code",
                  message: "验证码未通过，请重新输入。",
                  retryable: true,
                },
              }
            : {}),
        },
      });
      return;
    }
    if (path === "/api/pupu/login/cancel") {
      cancelRequests.push(request);
      await route.fulfill({ json: { phase: "auth_required" } });
      return;
    }
    await route.abort();
  });

  return { chatRequests, cancelRequests };
}

test("first Pupu use stays inside Journey through phone, captcha, and SMS", async ({
  page,
}) => {
  const contract = await installLoginTransitions(page);
  await page.goto("/");
  await page.getByRole("button", { name: "朴朴搜索商品" }).click();

  await expect(page.getByText("等待朴朴安全登录")).toBeVisible();
  await page.getByLabel("手机号").fill("13000000000");
  await page.getByRole("button", { name: /继续验证/ }).click();

  await expect(page.getByTitle("朴朴安全验证")).toBeVisible();
  await page.getByRole("button", { name: /我已完成验证/ }).click();
  await expect(page.getByRole("form", { name: "短信验证" })).toBeVisible();

  await page.getByLabel("短信验证码").fill("123456");
  await page.getByRole("button", { name: "验证并继续" }).click();
  await expect(page.getByRole("form", { name: "短信验证" })).toBeVisible();
  await expect(page.locator('[data-component="pupu.purchase-plan"]')).toHaveCount(0);
  expect(contract.chatRequests).toHaveLength(1);
});

test("cancel clears the transient login flow without starting Hermes", async ({
  page,
}) => {
  const contract = await installLoginTransitions(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "查看朴朴购物车" }).click();
  await expect(page.getByRole("form", { name: "朴朴登录" })).toBeVisible();

  await page.getByRole("button", { name: "取消本次登录" }).click();

  await expect(page.getByTestId("journey-origin")).toHaveAttribute(
    "data-journey-state",
    "interrupted",
  );
  expect(contract.cancelRequests).toHaveLength(1);
  expect(contract.chatRequests).toHaveLength(1);
  await expect(page.locator('[data-component="pupu.purchase-plan"]')).toHaveCount(0);
});
