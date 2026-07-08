import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

/**
 * A reliable hover tooltip for the webview. Native `title` tooltips are clipped by
 * the panel's scroll container, so we render a fixed-position bubble (relative to
 * the viewport) that can't be clipped. Trigger shows a subtle dotted underline.
 */
export function Tip({ text, children }: { text: string; children: ComponentChildren }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = (el: HTMLElement): void => {
    const r = el.getBoundingClientRect();
    setPos({ x: r.left, y: r.bottom + 6 });
  };

  return (
    <span
      class="tip"
      onMouseEnter={(e) => show(e.currentTarget as HTMLElement)}
      onMouseLeave={() => setPos(null)}
      onFocusIn={(e) => show(e.currentTarget as HTMLElement)}
      onFocusOut={() => setPos(null)}
      tabIndex={0}
    >
      {children}
      {pos && (
        <span class="tip-bubble" role="tooltip" style={{ left: `${pos.x}px`, top: `${pos.y}px` }}>
          {text}
        </span>
      )}
    </span>
  );
}
