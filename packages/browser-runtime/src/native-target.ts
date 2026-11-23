import type { Frame, Page } from 'puppeteer-core';

/** Structural evidence only. Never return values, identifiers, JavaScript or URL parameters. */
export function nativeTargetStructure(point?: { x: number; y: number }): {
  hitTag: string | null;
  controlTag: string | null;
  inputType: string | null;
  linkKind: 'none' | 'fragment' | 'script' | 'navigation';
  inlineClick: boolean;
  inlineDoubleClick: boolean;
  formMethod: string | null;
} {
  const hit = point ? document.elementFromPoint(point.x, point.y) : document.activeElement;
  const control = hit?.closest('button,a,input,select,[role="button"]') ?? hit;
  const form = control?.closest('form');
  const href = control?.getAttribute('href');
  return {
    hitTag: hit?.tagName ?? null,
    controlTag: control?.tagName ?? null,
    inputType: control instanceof HTMLInputElement ? control.type : null,
    linkKind: !href
      ? 'none'
      : href.startsWith('#')
        ? 'fragment'
        : /^javascript:/i.test(href)
          ? 'script'
          : 'navigation',
    inlineClick: !!control?.hasAttribute('onclick'),
    inlineDoubleClick: !!control?.hasAttribute('ondblclick'),
    formMethod: form instanceof HTMLFormElement ? form.method : null,
  };
}

/** Resolve browser coordinates or keyboard focus through nested frames, retaining page coordinates
 * for the native mouse. No model selectors or scripts enter this adapter. */
export async function nativeTarget(
  page: Page,
  point?: { x: number; y: number }
): Promise<{ frame: Frame; point: { x: number; y: number } | undefined }> {
  let frame = page.mainFrame();
  let local = point;
  for (let depth = 0; depth < 12; depth++) {
    const handle = await frame.evaluateHandle(
      (position) =>
        position ? document.elementFromPoint(position.x, position.y) : document.activeElement,
      local
    );
    try {
      const element = handle.asElement();
      if (!element) return { frame, point: local };
      const child = await element.contentFrame();
      if (!child) return { frame, point: local };
      if (point) {
        const box = await element.boundingBox();
        if (!box) throw new Error('Browser frame is unavailable');
        local = { x: point.x - box.x, y: point.y - box.y };
      }
      frame = child;
    } finally {
      await handle.dispose();
    }
  }
  throw new Error('Browser frame nesting exceeds supported depth');
}
