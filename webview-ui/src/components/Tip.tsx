import { useId, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

/**
 * A reliable hover tooltip for the webview. Native `title` tooltips are clipped by
 * the panel's scroll container, so we render a fixed-position bubble (relative to
 * the viewport) that can't be clipped. Trigger shows a subtle dotted underline.
 */
export function Tip({ text, children }: { text: string; children: ComponentChildren }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const tooltipId = useId();

  const show = (el: HTMLElement): void => {
    const r = el.getBoundingClientRect();
    const estimatedWidth = Math.min(240, Math.max(0, window.innerWidth - 16));
    const x = Math.max(8, Math.min(r.left, window.innerWidth - estimatedWidth - 8));
    const estimatedHeight = 96;
    const y =
      r.bottom + 6 + estimatedHeight <= window.innerHeight
        ? r.bottom + 6
        : Math.max(8, r.top - estimatedHeight - 6);
    setPos({ x, y });
  };

  return (
    <span
      class="tip"
      onMouseEnter={(e) => show(e.currentTarget as HTMLElement)}
      onMouseLeave={() => setPos(null)}
      onFocusIn={(e) => show(e.currentTarget as HTMLElement)}
      onFocusOut={() => setPos(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setPos(null);
      }}
      tabIndex={0}
      aria-describedby={pos ? tooltipId : undefined}
    >
      {children}
      {pos && (
        <span
          id={tooltipId}
          class="tip-bubble"
          role="tooltip"
          style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
