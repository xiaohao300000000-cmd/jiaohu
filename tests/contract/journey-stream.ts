import type { Page } from "@playwright/test";

type ContractOutcome = "success" | "error";

function dataPart(data: unknown): string {
  return `data: ${JSON.stringify({ type: "data-journey", data })}\n\n`;
}

export async function installJourneyContractRoute(
  page: Page,
  outcome: ContractOutcome = "success",
): Promise<void> {
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
        type: "task.updated",
        requestId,
        task: {
          taskId: "contract-task",
          version: 4,
          requestText: "朴朴搜索商品",
          domain: "commerce",
          goal: "prepare_cart",
          phase: "awaiting_cart_confirmation",
          context: {
            dietaryRequirements: [],
            requirements: ["浏览器 contract fixture"],
            selectedProducts: [{
              productId: "contract-product",
              name: "Contract 牛奶",
              quantity: 1,
              unitPriceCents: 1290,
              source: "pupu_live",
            }],
          },
          finalPlan: {
            planId: "contract-plan",
            version: 1,
            title: "Contract 朴朴商品结果",
            explanation: "结构化 TaskSnapshot 浏览器契约数据",
            totalCents: 1290,
            currency: "CNY",
          },
          requestedCapabilities: ["commerce.catalog.search"],
          allowedCapabilities: ["commerce.cart.prepare"],
          nextActions: ["confirm_cart"],
        },
      });
      stream += dataPart({
        type: "stream.finished",
        requestId,
        result: {
          title: "Contract 朴朴商品结果",
          summary: "受控浏览器契约完成",
          totalAmount: 0,
          currency: "CNY",
          items: [],
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
