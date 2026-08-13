import { describe, expect, it } from "vitest";
import { resolveDemoPresentation } from "./presentation";

describe("resolveDemoPresentation", () => {
  it.each(["查一下我的快递", "外卖到哪了", "今天会下雨吗"])(
    "routes quick status request %s to anchored",
    (input) => expect(resolveDemoPresentation(input).mode).toBe("anchored"),
  );

  it("routes Pupu order status to its own anchored card", () => {
    expect(resolveDemoPresentation("查一下我的朴朴订单")).toMatchObject({
      mode: "anchored",
      kind: "pupu_order",
    });
  });

  it.each(["朴朴帮我买", "两个人今晚吃火锅，预算 120 元", "买牛奶和鸡蛋"])(
    "routes %s to the Pupu purchase canvas",
    (input) => {
      expect(resolveDemoPresentation(input)).toMatchObject({
        mode: "canvas",
        kind: "pupu_purchase",
      });
    },
  );

  it.each(["今晚吃什么", "帮我做采购方案", "安排三个人的火锅"])(
    "routes multi-step request %s to canvas",
    (input) => expect(resolveDemoPresentation(input).mode).toBe("canvas"),
  );

  it.each(["确认退款", "帮我付款", "提交这个订单"])(
    "routes high-risk request %s to sheet",
    (input) => expect(resolveDemoPresentation(input).mode).toBe("sheet"),
  );

  it("defaults unknown requests to canvas", () => {

    expect(resolveDemoPresentation("帮我处理一下").mode).toBe("canvas");
  });
});
