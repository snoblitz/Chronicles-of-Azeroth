// ============================================================================
// Reveal — wraps children in a div that animates in when scrolled into view.
//
// Leaf module: only React imports. Both LandingPage and the App import this,
// so it MUST NOT pull in any landing- or app-specific code (verified by
// the build smoke check: App chunk should not contain LandingPage strings).
//
// Behavior:
//   - Single IntersectionObserver per <Reveal />, disconnects after first hit
//   - Honors prefers-reduced-motion: renders children visible immediately
//   - Feature-detect IntersectionObserver: falls back to visible-immediately
//     so SSR / very-old browsers never get an invisible page
//   - After the reveal fires, removes `will-change` (via class swap) so long
//     lists of revealed elements don't keep compositor pressure forever
//
// CSS contract lives in src/index.css under `.at-reveal*` rules.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';

export type RevealVariant = 'up' | 'in' | 'left' | 'right' | 'scale';

export function Reveal({
  children,
  variant = 'up',
  delay = 0,
  className = '',
  style,
  threshold = 0.15,
}: {
  children: ReactNode;
  variant?: RevealVariant;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Start visible if we know motion is disabled or IO is unavailable — that
  // way a broken-JS path or very-old browser still renders content.
  const [visible, setVisible] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof window === 'undefined') {
      setVisible(true);
      setSettled(true);
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      setSettled(true);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      // Old browsers / non-standard runtimes: just show it.
      setVisible(true);
      setSettled(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [threshold]);

  // After the reveal transition has had time to play out, drop `will-change`
  // by switching to `at-reveal-settled` so the compositor isn't asked to
  // hold a layer for an element that will never animate again.
  useEffect(() => {
    if (!visible || settled) return;
    // Transitions in index.css run ~600ms; give a small cushion.
    const t = window.setTimeout(() => setSettled(true), 900);
    return () => window.clearTimeout(t);
  }, [visible, settled]);

  const cls =
    `at-reveal at-reveal-${variant}` +
    (visible ? ' at-reveal-in' : '') +
    (settled ? ' at-reveal-settled' : '') +
    (className ? ` ${className}` : '');

  return (
    <div
      ref={ref}
      className={cls}
      style={{ ...(style ?? {}), transitionDelay: delay ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  );
}
