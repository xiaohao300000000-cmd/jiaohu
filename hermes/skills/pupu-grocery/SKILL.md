---
name: pupu-grocery
description: Use for Pupu grocery, catalog, cart, coupon, checkout, order, or invite-pay requests.
version: 1.1.0
---

# Pupu CLI command guide

Use the complete `pupu_cli(operation, arguments)` connection directly. The CLI
output is the source of truth. Do not rediscover documented commands with
`capabilities` or `--help`.

## Login first

For every Pupu business request, make one separate login check and wait for its
result before emitting any business command:

- operation: `login`
- arguments: `["status", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`

If the result status is `auth_required`, stop immediately. The app will collect
phone, captcha, and SMS through its existing login card. Never ask for a phone
number or SMS code in ordinary chat.

## Preserve the user's selection

When the user says “第一个和第三个”, “就这两个”, or gives another selection
from the immediately preceding result, use those exact result records and their
IDs/item fields. Do not search broad synonyms again. If the previous CLI output
does not contain the identifier required by the next command, ask for the
missing choice or request a detail for the selected record.

“给我 3 个” means present three candidates. Do not change the cart until the
user explicitly asks to add, remove, or otherwise mutate it.

## Read commands

- Catalog search: operation `catalog`, arguments `["search", "--query", "<keyword>", "--size", "5", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Catalog detail: operation `catalog`, arguments `["detail", "--store-product-id", "<store-product-id>", "--product-id", "<product-id>", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Cart read: operation `cart`, arguments `["read", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Account info: operation `account`, arguments `["info", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Account refresh: operation `account`, arguments `["refresh", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Coupon list: operation `coupon`, arguments `["list", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Checkout preview: operation `checkout`, arguments `["preview", "--lng-x", "<longitude>", "--lat-y", "<latitude>", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Order detail: operation `order`, arguments `["detail", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--order-id", "<order-id>", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Invite-pay detail: operation `invite-pay`, arguments `["detail", "--invite-pay-id", "<invite-pay-id>", "--order-id", "<order-id>", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Invite-pay share: operation `invite-pay`, arguments `["share", "--invite-pay-id", "<invite-pay-id>", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`

## Explicit mutation commands

Only call these after the user explicitly asks for the corresponding action and
the CLI has the required item/approval data. The installed CLI enforces its own
approval-token requirements; do not invent an approval token.

- Cart add: operation `cart`, arguments beginning with `["add", "--item", "<item-json-path>", "--approval-token", "<approval-token>", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--actor-id", "<actor-id>", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Cart remove: operation `cart`, arguments beginning with `["remove", "--item", "<item-json-path>", "--approval-token", "<approval-token>", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--actor-id", "<actor-id>", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Scoped cart add: operation `cart`, arguments beginning with `["scoped-add", "--item", "<item-json-path>", "--account-id", "<account-id>", "--accounts-root", "/home/pupu/.local/share/jiaohu/pupu-accounts", "--store-id", "<store-id>", "--place-id", "<place-id>", "--receiver-id", "<receiver-id>", "--actor-id", "<actor-id>", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Coupon claim: operation `coupon`, arguments beginning with `["claim", "--discount", "<discount>", "--discount-group", "<discount-group>", "--approval-token", "<approval-token>", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--actor-id", "<actor-id>", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`
- Create invite-pay: operation `checkout`, arguments beginning with `["create-invite-pay", "--order-body", "<order-body-json-path>", "--approval-token", "<approval-token>", "--household-id", "household-f3f3b74a55ae8bf60b6c1172", "--actor-id", "<actor-id>", "--request-id", "<unique-id>", "--data-root", "/home/pupu/providers/pupu-cli/.local/private", "--json"]`

Creating invite-pay does not execute payment. Do not claim success unless the
CLI output says it succeeded, and do not claim a cart mutation from a search
result alone.
