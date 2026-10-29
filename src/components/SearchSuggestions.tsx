'use client';

import { useLayoutEffect, useRef, useState, type RefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { suggestionPlacement } from '@/lib/suggestionPlacement';

export function SearchSuggestions({ anchor, open, floating, activeId, onDismiss, children }: {
  anchor: RefObject<HTMLInputElement | null>; open: boolean; floating: boolean;
  activeId?: string; onDismiss: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const [placement, setPlacement] = useState<ReturnType<typeof suggestionPlacement> | null>(null);
  const [root, setRoot] = useState<Element | null>(null);

  useLayoutEffect(() => {
    if (!open || !floating || !anchor.current) return;
    const measure = () => {
      if (!anchor.current) return;
      const viewport = window.visualViewport;
      setRoot(document.fullscreenElement || document.body);
      const next = suggestionPlacement(anchor.current.getBoundingClientRect(), {
        left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
        width: viewport?.width || window.innerWidth, height: viewport?.height || window.innerHeight,
        layoutHeight: window.innerHeight,
      });
      setPlacement(previous => previous && previous.left === next.left && previous.width === next.width && previous.maxHeight === next.maxHeight && previous.top === next.top && previous.bottom === next.bottom ? previous : next);
    };
    const outside = (event: Event) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target) && !panel.current?.contains(event.target)) dismiss.current();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Tab' || event.key === 'Escape') dismiss.current();
    };
    // Follow the input through panel entrance animations, scrolling and keyboard resize.
    let frame = 0;
    const follow = () => { measure(); frame = requestAnimationFrame(follow); };
    measure();
    frame = requestAnimationFrame(follow);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', keyboard);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', keyboard);
    };
  }, [anchor, open, floating]);

  useLayoutEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId, open, placement]);

  if (!open) return null;
  if (!floating) return children;
  if (!root || !placement || placement.maxHeight < 1) return null;
  return createPortal(<div ref={panel} className="search-suggestions-popover" style={placement}>{children}</div>, root);
}
