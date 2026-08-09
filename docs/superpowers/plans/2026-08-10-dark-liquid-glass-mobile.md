# Dark Liquid Glass Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the drifted warm-white mobile canvas with the approved dark, continuous, source-anchored glass task surface while preserving every existing Agent and Pupu behavior.

**Architecture:** Keep the current React component boundaries and shared layout IDs. Make `JourneyOriginSurface` the single glass task object, make Pupu content transparent inside it, and give the page scene enough neutral luminance variation for static backdrop transmission to be visible. Use CSS custom properties for static material presets; Motion continues to animate only transform and opacity.

**Tech Stack:** React 19, TypeScript, Motion 12, CSS, Vitest, Testing Library, Playwright Chromium mobile viewport.

## Global Constraints

- Work only in `/home/pupu/vercel ai sdk` on `pupu-vps`.
- The 390 x 844 screenshot is the primary target; 320 x 720 is the compact target.
- Use a fixed neutral dark theme with no neon or colored ambient light.
- Canvas has no border, radius, fill, or shadow.
- The large glass surface is `journey-origin`, not a page mother card.
- Preserve every shared layout ID and all Journey states.
- Motion may animate only `transform` and `opacity`.
- Do not add WebGL, Canvas shaders, dynamic blur, or new dependencies.
- Preserve the external Pupu CLI provider boundary and demo-data disclosure.

---

### Task 1: Lock the dark material contract with failing browser assertions

**Files:**
- Modify: `tests/source-anchored-visual.spec.ts`
- Modify: `src/components/home/FloatingComposer.test.tsx`

**Interfaces:**
- Consumes: existing `data-testid="journey-origin"`, `data-testid="floating-composer"`, `.canvas-shell`.
- Produces: executable color, transparency, blur, geometry, and fallback requirements.

- [ ] **Step 1: Add the failing Playwright material assertions**

Add this after entering the Pupu canvas:

```ts
const material = await page.evaluate(() => {
  const body = getComputedStyle(document.body);
  const canvas = getComputedStyle(document.querySelector(".canvas-shell")!);
  const origin = getComputedStyle(document.querySelector('[data-testid="journey-origin"]')!);
  const composer = getComputedStyle(document.querySelector('[data-testid="floating-composer"]')!);
  return {
    bodyBackground: body.backgroundColor,
    canvasBackground: canvas.backgroundColor,
    canvasRadius: canvas.borderRadius,
    originBackground: origin.backgroundColor,
    originBackdrop: origin.backdropFilter || origin.webkitBackdropFilter,
    composerBackground: composer.backgroundColor,
    composerBackdrop: composer.backdropFilter || composer.webkitBackdropFilter,
  };
});

expect(material.bodyBackground).toBe("rgb(19, 20, 20)");
expect(material.canvasBackground).toBe("rgba(0, 0, 0, 0)");
expect(material.canvasRadius).toBe("0px");
expect(material.originBackground).toMatch(/^rgba\(31, 32, 32, 0\.[4-7]\)$/);
expect(material.originBackdrop).toContain("blur(28px)");
expect(material.composerBackground).toMatch(/^rgba\(31, 32, 32, 0\.[3-6]\)$/);
expect(material.composerBackdrop).toContain("blur(30px)");
```

- [ ] **Step 2: Add the fallback contract assertion**

Read the stylesheet text in the existing unit test and assert:

```ts
expect(css).toContain("@supports not ((backdrop-filter: blur(1px))");
expect(css).toContain("prefers-reduced-transparency: reduce");
```

- [ ] **Step 3: Run the focused tests and prove RED**

Run:

```bash
npx playwright test tests/source-anchored-visual.spec.ts --grep "Pupu decision"
npm test -- src/components/home/FloatingComposer.test.tsx
```

Expected: FAIL because the current body is warm white, the task origin has no 28px backdrop material, and the composer uses the old light preset.

### Task 2: Build the neutral dark scene and foreground composer

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `isCanvas`, `resetHome`, `activeTask`, `.app-header`, `.task-scroll-space`, `.floating-composer`.
- Produces: fixed dark canvas scene, canvas-specific status chrome, and a readable foreground glass composer.

- [ ] **Step 1: Add a failing canvas-chrome test**

After starting Pupu, assert the canvas status chrome replaces the home brand chrome:

```ts
expect(screen.getByText("Agent 决策已完成")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "返回首页" })).toBeInTheDocument();
```

- [ ] **Step 2: Prove the unit test fails**

Run `npm test -- src/App.test.tsx`.

Expected: FAIL because the current header still renders `Pupu` and `前端交互模板` in canvas mode.

- [ ] **Step 3: Render canvas-specific header content**

In `App.tsx`, preserve the home header and render this when `isCanvas`:

```tsx
<span className="app-header__canvas-status">Agent 决策已完成</span>
<button className="app-header__return" type="button" onClick={resetHome}>
  返回首页
</button>
```

- [ ] **Step 4: Replace the light scene tokens and composer material**

In `src/index.css`, set the scene to `#131414`, add only neutral low-contrast radial luminance fields, make the header transparent, and set composer material to:

```css
background: rgba(31, 32, 32, 0.46);
border: 1px solid rgba(255, 255, 255, 0.11);
backdrop-filter: blur(30px) saturate(1.14) contrast(1.05);
box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.09),
  inset 0 -1px 0 rgba(0, 0, 0, 0.22),
  0 22px 64px rgba(0, 0, 0, 0.36);
```

Remove the warm opaque fade behind composer. Replace it with a transparent dark fade that still lets moving content remain visible.

- [ ] **Step 5: Run the focused unit and material tests**

Run `npm test -- src/App.test.tsx src/components/home/FloatingComposer.test.tsx` and the focused Playwright command from Task 1.

Expected: header tests PASS; material assertions progress to the missing origin material only.

### Task 3: Make the source, decision, evidence, and action one glass object

**Files:**
- Modify: `src/components/journey/liquid-journey.css`
- Modify: `src/components/pupu/pupu-purchase.css`
- Modify: `src/components/pupu/PupuPurchaseCard.tsx`
- Modify: `src/components/pupu/PupuPurchaseCard.test.tsx`

**Interfaces:**
- Consumes: `.journey-origin`, `.journey-origin__source`, `.pupu-purchase-card`, `payload.products`.
- Produces: one continuous smoke-glass surface and compact numbered evidence rows.

- [ ] **Step 1: Add a failing numbered-evidence test**

Open evidence and assert:

```ts
expect(screen.getByText("01")).toBeInTheDocument();
expect(screen.getByText("02")).toBeInTheDocument();
expect(screen.getByText("03")).toBeInTheDocument();
```

- [ ] **Step 2: Prove the component test fails**

Run `npm test -- src/components/pupu/PupuPurchaseCard.test.tsx`.

Expected: FAIL because the current evidence rows do not render indices.

- [ ] **Step 3: Render stable evidence indices without removing image support**

Change the product map to receive `index` and add:

```tsx
<span className="pupu-product__index" aria-hidden="true">
  {String(index + 1).padStart(2, "0")}
</span>
```

Keep the trusted `imageUrl` path in the DOM, but make the neutral numbered list the primary mobile hierarchy. Images remain an optional compact evidence detail, not the row anchor.

- [ ] **Step 4: Apply glass to the actual journey origin**
