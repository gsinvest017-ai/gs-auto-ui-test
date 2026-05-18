// Playwright action wrappers that paint a highlight ring on the page before
// running the underlying click/fill/check/hover. Pairs with lib/highlight.js's
// initScript-injected window.__uiReplayFlash and window.__uiReplayBanner.

import { installHighlight } from "./highlight.js";

const FLASH_HOLD_MS = 450;
const POST_ACTION_MS = 200;
const BANNER_TOTAL_MS = 2700;

async function flashLocator(loc, kind, label) {
  const box = await loc.boundingBox().catch(() => null);
  if (!box) return;
  const page = loc.page();
  await page.evaluate(
    ({ box, kind, label, fnSrc }) => {
      if (typeof window.__uiReplayFlash !== "function") {
        // initScript may have been lost (rare); re-install on demand
        try { new Function(fnSrc)(); } catch {}
      }
      if (typeof window.__uiReplayFlash === "function") {
        window.__uiReplayFlash(box.x, box.y, box.width, box.height, kind, label);
      }
    },
    { box, kind, label, fnSrc: "(" + installHighlight.toString() + ")()" }
  );
  await page.waitForTimeout(FLASH_HOLD_MS);
}

export async function uiClick(page, selector, label) {
  const loc = page.locator(selector);
  await flashLocator(loc, "click", label || selector);
  await loc.click();
  await page.waitForTimeout(POST_ACTION_MS);
}

export async function uiFill(page, selector, value, label) {
  const loc = page.locator(selector);
  await flashLocator(loc, "type", label || `fill ${selector} = "${value}"`);
  await loc.fill(value);
  await page.waitForTimeout(POST_ACTION_MS);
}

export async function uiCheck(page, selector, label) {
  const loc = page.locator(selector);
  try {
    await flashLocator(loc, "type", label || `check ${selector}`);
    await loc.check({ timeout: 500 });
    await page.waitForTimeout(150);
  } catch {
    /* checkbox may not exist or already checked */
  }
}

export async function uiHover(page, selector, label) {
  const loc = page.locator(selector);
  await flashLocator(loc, "hover", label || `hover ${selector}`);
  await loc.hover();
  await page.waitForTimeout(POST_ACTION_MS);
}

export async function uiSelect(page, selector, value, label) {
  const loc = page.locator(selector);
  await flashLocator(loc, "click", label || `select ${selector} = ${value}`);
  await page.selectOption(selector, value);
  await page.waitForTimeout(POST_ACTION_MS);
}

export async function uiClickLocator(loc, label) {
  await flashLocator(loc, "click", label || "(locator click)");
  await loc.click();
  await loc.page().waitForTimeout(POST_ACTION_MS);
}

// Chapter banner — appears centered at top, animates in/hold/out over ~2.7s.
// Returns after the full animation so the next page.goto doesn't wipe it mid-display.
export async function showBanner(page, tag, title, subtitle) {
  await page.evaluate(
    ({ tag, title, subtitle }) => {
      if (typeof window.__uiReplayBanner === "function") {
        window.__uiReplayBanner(tag, title, subtitle);
      }
    },
    { tag, title, subtitle }
  );
  await page.waitForTimeout(BANNER_TOTAL_MS);
}

export { flashLocator };
