---
name: pupu-grocery
description: Use for Pupu grocery, cart, coupon, checkout, order, or invite-pay requests.
version: 1.0.0
---

# Pupu CLI command guide

Use the complete `pupu_cli(operation, arguments)` connection directly. Do not
rediscover documented commands with `capabilities` or `--help`.

## Login first

For every Pupu business request, call this once before the requested operation:

- operation: `login`
- arguments: `["status", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--accounts-root", "/home/pupu/.local/share/jiaohu/pupu-accounts", "--json"]`

If the result status is `auth_required`, stop immediately. Do not call any more
Pupu commands in that run. Tell LiquidJourney that login is required; the app
will collect the phone, captcha, and SMS code through its existing login card.
Never ask for a phone number or SMS code in ordinary chat.

## Exact command forms after login is ready

- Catalog search: operation `catalog`, arguments `["search", "--query", "<keyword>", "--size", "20", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--request-id", "<unique>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Catalog detail: operation `catalog`, arguments beginning with `["detail", ...]`
- Cart: operation `cart`, arguments beginning with `["read" | "add" | "remove", ...]`
- Coupons: operation `coupon`, arguments beginning with `["list" | "claim", ...]`
- Checkout: operation `checkout`, arguments beginning with `["preview" | "create-invite-pay", ...]`
- Order detail: operation `order`, arguments beginning with `["detail", ...]`
- Invite-pay: operation `invite-pay`, arguments beginning with `["detail" | "share", ...]`

CLI output is the source of truth. Creating invite-pay does not execute payment.
