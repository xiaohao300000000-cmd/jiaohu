# Pupu Mobile Reliability and Latency Design

## Problem

The public mobile flow correctly gates the first Pupu request behind phone, captcha, SMS, and saved-address selection. After login, natural shopping language such as “帮我看看大瓶的牛奶” can still fail because the browser and server classify Pupu intent independently. The browser resumes the held task, but the server may not issue a scoped read ticket. Hermes then receives a typed scope error, explores `pupu_capabilities`, and the UI can reopen reasoning after an error, appearing permanently stuck.

The same run performs avoidable model/tool discovery turns, and saved-address reads repeatedly pay the provider startup cost.

## Approved Design

1. Treat authenticated session plus a selected server-side address binding as the authoritative authorization trigger for read-only Pupu scope. The chat server no longer guesses Chinese shopping intent before issuing a short-lived read ticket.
2. Keep the browser login gate. A first Pupu search still calls login status first and cannot reach Hermes until the user has completed login and selected an address.
3. Once a Pupu artifact produces a terminal failure, ignore later tool trace events from the same Hermes run. The UI must remain in a retryable error state rather than returning to reasoning.
4. Add deterministic Hermes execution contracts:
   - complex meal request: exactly one meal catalog call;
   - cart-read request: exactly one cart read;
   - ordinary Pupu search: exactly one catalog search;
   - never call auth status or capabilities after the browser has already established scope.
5. Cache redacted saved-address results server-side for five minutes per account. Selection remains explicit for each new browser flow; the cache only removes repeated provider reads.
6. Long operations must announce their current stage. No mock data or simulated completion is allowed.

## Security

- Scope remains bound to a verified browser session, account, saved receiver, store, and place.
- The model cannot choose account or address identifiers.
- Tickets remain short-lived, mode 0600, and are deleted after the run.
- All Pupu tools remain read-only until separate cart/order confirmation paths.
- No phone, token, receiver identifier, or address details are exposed to the model.

## Verification

- Unit tests prove the server issues scope for a selected authenticated session even when the phrase is missed by the old classifier.
- Unit tests prove no scope is issued without a session and selected address.
- Reducer/adapter tests prove a terminal Pupu failure cannot be reopened by later trace events.
- Prompt contract tests prove one direct tool path for search/cart/meal.
- Address controller tests prove cache hit, expiration, and account isolation.
- Public mobile browser validation performs a real read-only product search after login and must reach either a live product result or an explicit terminal provider error, never an indefinite capability trace.

