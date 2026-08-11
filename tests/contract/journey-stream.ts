import type { Page } from "@playwright/test";

type ContractOutcome = "success" | "error";

function dataPart(data: unknown): string {
  return `data: ${JSON.stringify({ type: "data-journey", data })}\n\n`;
}

export async function installJourneyContractRoute(
  page: Page,
  outcome: ContractOutcome = "success",
): Promise<void> {
  await page.route("**/api/pupu/login/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ phase: "connected" }),
    });
  });
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as { requestId?: string };
    const requestId = body.requestId || "contract-request";
    const runId = "contract-run";
    let stream = dataPart({
      type: "stream.started",
      requestId,
      runId,
    });

    if (outcome === "success") {
      stream += dataPart({
        type: "presentation.updated",
        requestId,
        presentation: {
          capability: "pupu",
          component: "pupu.purchase-plan",
          mode: "canvas",
          dataSource: "demo",
          payload: {
            stage: "cart_ready",
            title: "Contract 朴朴商品结果",
            summary: "受控浏览器契约数据",
            meal: "商品查询",
            people: 1,
            constraints: ["浏览器 contract fixture"],
            decisionSummary: "仅用于验证 UI 协议，不代表真实 Pupu 数据。",
            products: [
              {
                productId: "contract-product",
                name: "Contract 牛奶",
                specification: "950ml",
                unitPrice: 12.9,
                quantity: 1,
                currency: "CNY",
                stockStatus: "in_stock",
                collectedAt: "2026-08-11T00:00:00.000Z",
              },
            ],
            estimatedTotal: 12.9,
            currency: "CNY",
            cartVersion: 0,
            estimatedDelivery: "contract only",
          },
        },
      });
      stream += dataPart({
        type: "stream.finished",
        requestId,
        result: {
          title: "Contract 朴朴商品结果",
          summary: "受控浏览器契约完成",
          totalAmount: 12.9,
          currency: "CNY",
          items: [
            {
              id: "contract-product",
              name: "Contract 牛奶",
              detail: "950ml",
              price: 12.9,
            },
          ],
        },
      });
    } else {
      stream += dataPart({
        type: "stream.failed",
        requestId,
        error: {
          kind: "provider",
          message: "受控 transport 失败。",
        },
      });
    }

    stream += "data: [DONE]\n\n";
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: stream,
    });
  });
}
