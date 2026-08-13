import { describe, expect, it } from "vitest";
import { validateOfficialPaymentTarget } from "./payment-link";
describe("validateOfficialPaymentTarget", () => {
  it("accepts an invite-bound Pupu deep link", () => {
    expect(validateOfficialPaymentTarget("pupumall://login.pupumall.com/invite_pay/detail?invite_pay_id=abc-1", "abc-1")).toContain("abc-1");
  });
  it.each([
    ["https://evil.example/pay?invite_pay_id=abc-1", "abc-1"],
    ["pupumall://login.pupumall.com/invite_pay/detail?invite_pay_id=other", "abc-1"],
    ["javascript:alert(1)", "abc-1"],
  ])("rejects unsafe targets", (target, inviteId) => {
    expect(() => validateOfficialPaymentTarget(target, inviteId)).toThrow("payment");
  });
});
