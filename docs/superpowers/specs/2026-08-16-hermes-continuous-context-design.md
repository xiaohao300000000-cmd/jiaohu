# Hermes Continuous Context Design

## Goal

Keep every follow-up in one real Hermes Agent session while restoring Hermes' native Memory, User profile, Skills, and session search beside the complete Pupu CLI connection.

## Identity lifecycles

- `requestId` identifies one frontend turn and changes on every submission.
- `sessionId` identifies one continuous Hermes conversation. Follow-ups reuse it; returning home/resetting creates a new one.
- `Session-Key` identifies the longer-lived user memory scope. It is stored in the browser and remains stable across Hermes session resets.

These identifiers must not be substituted for one another.

## Data flow

For each turn the frontend sends `requestId`, `sessionId`, and `sessionKey` to the app server. The server reads the existing transcript from Hermes' native session API, then starts `/v1/runs` with that transcript and the same `session_id`. It sends `X-Hermes-Session-Key` on both requests so Hermes owns the conversation and long-term memory scopes.

The existing `/v1/runs` event stream remains in use because it returns the complete Pupu CLI tool result consumed by the existing generative UI cards. The frontend still renders only Hermes events and results.

## Native Hermes capabilities

The API Server exposes these Hermes toolsets directly:

- `pupu_cli`
- `memory`
- `skills`
- `session_search`

Hermes' built-in `memory.memory_enabled` and `memory.user_profile_enabled` remain enabled. The application does not implement a parallel memory store, user profile, skill router, or session search service.

## Reset behavior

Reset clears the visible journey and rotates only `sessionId`. It does not clear or rotate `Session-Key`, Hermes Memory, User profile, or installed Skills.

## Verification

Tests must prove stable session reuse across follow-ups, session rotation on reset, stable Session-Key across resets, native Hermes history forwarding, the Session-Key header, and the four configured toolsets. Existing card and event tests must remain green.
