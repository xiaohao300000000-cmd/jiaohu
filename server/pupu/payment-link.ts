const OFFICIAL_HTTPS_HOSTS = new Set(["www.pupumall.com", "pupumall.com", "login.pupumall.com"]);
export function validateOfficialPaymentTarget(value: string, invitePayId: string): string {
  let target: URL;
  try { target = new URL(value); }
  catch { throw new Error("Official Pupu payment target is invalid"); }
  const boundId = target.searchParams.get("invite_pay_id") || target.searchParams.get("invitePayId");
  if (boundId !== invitePayId) throw new Error("Official Pupu payment target is not bound to this invite");
  if (target.protocol === "pupumall:" && target.hostname === "login.pupumall.com" &&
      target.pathname === "/invite_pay/detail") return target.toString();
  if (target.protocol === "https:" && OFFICIAL_HTTPS_HOSTS.has(target.hostname)) return target.toString();
  throw new Error("Official Pupu payment target is not allowlisted");
}
