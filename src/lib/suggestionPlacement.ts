type Anchor = { left: number; top: number; bottom: number; width: number };
type Viewport = { left: number; top: number; width: number; height: number; layoutHeight: number };
type Placement = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

/** Fixed-position geometry, including the visible area above a mobile keyboard. */
export function suggestionPlacement(anchor: Anchor, viewport: Viewport): Placement {
  const edge = 8, gap = 6;
  const top = viewport.top + edge;
  const bottom = Math.max(top, viewport.top + viewport.height - edge);
  const anchorTop = Math.max(top, Math.min(anchor.top, bottom));
  const anchorBottom = Math.max(top, Math.min(anchor.bottom, bottom));
  const above = Math.max(0, anchorTop - top - gap);
  const below = Math.max(0, bottom - anchorBottom - gap);
  const up = above > below;
  const width = Math.max(0, Math.min(anchor.width, viewport.width - edge * 2));
  return {
    left: Math.max(viewport.left + edge, Math.min(anchor.left, viewport.left + viewport.width - edge - width)),
    width,
    maxHeight: Math.min(480, up ? above : below),
    ...(up ? { bottom: viewport.layoutHeight - anchorTop + gap } : { top: anchorBottom + gap }),
  };
}
