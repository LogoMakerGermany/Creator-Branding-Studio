import type { CSSProperties } from 'react';
import type { LayoutElement } from '@/services/api';

export const MIN_ELEMENT_SIZE = 40;
export const SNAP_THRESHOLD = 8;
export const SNAP_GRID = 8;

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type Rect = { x: number; y: number; width: number; height: number };

export type ResizeModifiers = {
  maintainAspect: boolean;
  fromCenter: boolean;
  disableSnap: boolean;
};

export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

function snapValue(value: number, targets: number[], threshold: number): number {
  for (const t of targets) {
    if (Math.abs(value - t) <= threshold) return t;
  }
  return value;
}

export function clampRect(
  rect: Rect,
  canvasW: number,
  canvasH: number,
  minW = MIN_ELEMENT_SIZE,
  minH = MIN_ELEMENT_SIZE
): Rect {
  let { x, y, width, height } = rect;

  width = Math.max(minW, width);
  height = Math.max(minH, height);

  if (x < 0) {
    width += x;
    x = 0;
  }
  if (y < 0) {
    height += y;
    y = 0;
  }

  width = Math.max(minW, Math.min(width, canvasW - x));
  height = Math.max(minH, Math.min(height, canvasH - y));

  if (x + width > canvasW) {
    if (width > canvasW) {
      x = 0;
      width = canvasW;
    } else {
      x = canvasW - width;
    }
  }
  if (y + height > canvasH) {
    if (height > canvasH) {
      y = 0;
      height = canvasH;
    } else {
      y = canvasH - height;
    }
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function getElementsBounds(elements: LayoutElement[], ids: string[]): Rect | null {
  const selected = elements.filter((e) => ids.includes(e.id));
  if (selected.length === 0) return null;

  const xs = selected.map((e) => e.x);
  const ys = selected.map((e) => e.y);
  const rights = selected.map((e) => e.x + e.width);
  const bottoms = selected.map((e) => e.y + e.height);

  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const right = Math.max(...rights);
  const bottom = Math.max(...bottoms);

  return { x, y, width: right - x, height: bottom - y };
}

export function elementToRect(el: LayoutElement): Rect {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

/** Berechnet neue Größe/Position beim Ziehen eines Resize-Handles. */
export function computeResizedRect(
  startRect: Rect,
  startPointer: { x: number; y: number },
  currentPointer: { x: number; y: number },
  handle: ResizeHandle,
  canvasW: number,
  canvasH: number,
  modifiers: ResizeModifiers
): Rect {
  let dx = currentPointer.x - startPointer.x;
  let dy = currentPointer.y - startPointer.y;
  const aspect = startRect.width / Math.max(startRect.height, 1);

  let x = startRect.x;
  let y = startRect.y;
  let width = startRect.width;
  let height = startRect.height;

  if (modifiers.fromCenter) {
    dx *= 2;
    dy *= 2;
  }

  const affectsW = handle === 'e' || handle === 'ne' || handle === 'se' || handle === 'w' || handle === 'nw' || handle === 'sw';
  const affectsH = handle === 's' || handle === 'se' || handle === 'sw' || handle === 'n' || handle === 'nw' || handle === 'ne';

  if (handle === 'e' || handle === 'ne' || handle === 'se') {
    width = startRect.width + dx;
  }
  if (handle === 'w' || handle === 'nw' || handle === 'sw') {
    width = startRect.width - dx;
    x = startRect.x + dx;
  }
  if (handle === 's' || handle === 'se' || handle === 'sw') {
    height = startRect.height + dy;
  }
  if (handle === 'n' || handle === 'nw' || handle === 'ne') {
    height = startRect.height - dy;
    y = startRect.y + dy;
  }

  if (modifiers.maintainAspect && (affectsW || affectsH)) {
    const isCorner = handle.length === 2;
    const affectsX = handle === 'w' || handle === 'nw' || handle === 'sw';
    const affectsY = handle === 'n' || handle === 'nw' || handle === 'ne';
    if (isCorner) {
      const dw = Math.abs(width - startRect.width);
      const dh = Math.abs(height - startRect.height);
      if (dw >= dh) {
        height = width / aspect;
      } else {
        width = height * aspect;
      }
      if (affectsY) y = startRect.y + startRect.height - height;
      if (affectsX) x = startRect.x + startRect.width - width;
    } else if (handle === 'e' || handle === 'w') {
      height = width / aspect;
      y = startRect.y + (startRect.height - height) / 2;
    } else {
      width = height * aspect;
      x = startRect.x + (startRect.width - width) / 2;
    }
  }

  if (modifiers.fromCenter) {
    const cx = startRect.x + startRect.width / 2;
    const cy = startRect.y + startRect.height / 2;
    x = cx - width / 2;
    y = cy - height / 2;
  }

  let result = clampRect({ x, y, width, height }, canvasW, canvasH);

  if (!modifiers.disableSnap) {
    const snapX = [0, canvasW - result.width];
    const snapY = [0, canvasH - result.height];
    const snapR = [result.x + result.width, canvasW];
    const snapB = [result.y + result.height, canvasH];

    result = {
      ...result,
      x: snapValue(result.x, snapX, SNAP_THRESHOLD),
      y: snapValue(result.y, snapY, SNAP_THRESHOLD),
    };

    const right = result.x + result.width;
    const bottom = result.y + result.height;
    const snappedRight = snapValue(right, snapR, SNAP_THRESHOLD);
    const snappedBottom = snapValue(bottom, snapB, SNAP_THRESHOLD);

    if (snappedRight !== right) result = { ...result, width: snappedRight - result.x };
    if (snappedBottom !== bottom) result = { ...result, height: snappedBottom - result.y };
  }

  return clampRect(result, canvasW, canvasH);
}

/** Skaliert mehrere Elemente relativ zur Gruppen-Bounding-Box. */
export function applyGroupResize(
  elements: LayoutElement[],
  selectedIds: string[],
  startSnapshots: Record<string, Rect>,
  groupStart: Rect,
  groupNext: Rect
): LayoutElement[] {
  const scaleX = groupStart.width > 0 ? groupNext.width / groupStart.width : 1;
  const scaleY = groupStart.height > 0 ? groupNext.height / groupStart.height : 1;

  return elements.map((el) => {
    if (!selectedIds.includes(el.id)) return el;
    const snap = startSnapshots[el.id];
    if (!snap) return el;

    const relX = snap.x - groupStart.x;
    const relY = snap.y - groupStart.y;

    return {
      ...el,
      x: Math.round(groupNext.x + relX * scaleX),
      y: Math.round(groupNext.y + relY * scaleY),
      width: Math.round(Math.max(MIN_ELEMENT_SIZE, snap.width * scaleX)),
      height: Math.round(Math.max(MIN_ELEMENT_SIZE, snap.height * scaleY)),
    };
  });
}

export function applyGroupDrag(
  elements: LayoutElement[],
  selectedIds: string[],
  startSnapshots: Record<string, Rect>,
  dx: number,
  dy: number,
  canvasW: number,
  canvasH: number
): LayoutElement[] {
  return elements.map((el) => {
    if (!selectedIds.includes(el.id)) return el;
    const snap = startSnapshots[el.id];
    if (!snap) return el;
    const nx = Math.round(Math.max(0, Math.min(canvasW - el.width, snap.x + dx)));
    const ny = Math.round(Math.max(0, Math.min(canvasH - el.height, snap.y + dy)));
    return { ...el, x: nx, y: ny };
  });
}

export function handlePosition(handle: ResizeHandle, bounds: Rect, scale: number): CSSProperties {
  const hs = 10;
  const half = hs / 2;
  const left = bounds.x * scale;
  const top = bounds.y * scale;
  const w = bounds.width * scale;
  const h = bounds.height * scale;

  const positions: Record<ResizeHandle, CSSProperties> = {
    nw: { left: left - half, top: top - half },
    n: { left: left + w / 2 - half, top: top - half },
    ne: { left: left + w - half, top: top - half },
    e: { left: left + w - half, top: top + h / 2 - half },
    se: { left: left + w - half, top: top + h - half },
    s: { left: left + w / 2 - half, top: top + h - half },
    sw: { left: left - half, top: top + h - half },
    w: { left: left - half, top: top + h / 2 - half },
  };

  return {
    position: 'absolute',
    width: hs,
    height: hs,
    ...positions[handle],
  };
}
