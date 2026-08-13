# Scoped Cart Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove only the products added by the failed nine-candidate checkout test, then resume a strict three-SKU checkout.

**Architecture:** Add `cart scoped-remove` beside existing scoped read/add commands. Reuse account refresh, address-binding validation, approval issuance, and cart-service readback. The cleanup runner intersects captured test SKUs with the current scoped cart and processes them sequentially.

**Tech Stack:** Python 3.12, Typer, Pydantic, pytest, Pupu CLI, React/Vitest safety gate.

## Global Constraints

- All project writes and live commands run on the VPS.
- Do not log out or modify saved addresses.
- Do not remove cart lines outside the captured test-run SKU set.
- Do not retry an ambiguous mutation.
- Do not click or execute payment.

### Task 1: Scoped remove command

**Files:**
- Modify: `/home/pupu/providers/pupu-cli/src/pupu_assistant/entrypoints/cli/main.py`
- Modify: `deploy/pupu/address-command.patch`
- Test: existing Pupu CLI entrypoint tests plus a focused scoped-remove test

- [ ] Write a failing command test asserting binding options and verified removal.
- [ ] Run the focused pytest and confirm missing command behavior.
- [ ] Implement `cart scoped-remove` by validating the saved receiver binding, issuing a short-lived `cart_write` approval, and calling `remove_and_verify`.
- [ ] Run focused and provider tests.
- [ ] Regenerate the tracked provider patch.

### Task 2: Exact cleanup and checkout rerun

**Files:**
- No repository source files; live state only.

- [ ] Read the current scoped cart and intersect it with the nine captured test SKUs.
- [ ] Remove each intersecting SKU once with a unique request ID.
- [ ] Read the cart again and prove all targeted SKUs are absent.
