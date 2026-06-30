import { useCallback, useRef, useState } from 'react';
import type { LayoutElement } from '@/services/api';

const MAX_HISTORY = 50;

function cloneElements(els: LayoutElement[]): LayoutElement[] {
  return els.map((e) => ({ ...e }));
}

function elementsEqual(a: LayoutElement[], b: LayoutElement[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((el, i) => {
    const o = b[i];
    return (
      el.id === o.id &&
      el.x === o.x &&
      el.y === o.y &&
      el.width === o.width &&
      el.height === o.height
    );
  });
}

export function useLayoutHistory(initial: LayoutElement[] = []) {
  const [elements, setElementsInternal] = useState<LayoutElement[]>(initial);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const pastRef = useRef<LayoutElement[][]>([]);
  const futureRef = useRef<LayoutElement[][]>([]);
  const interactionStartRef = useRef<LayoutElement[] | null>(null);

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const pushPast = useCallback(
    (snapshot: LayoutElement[]) => {
      pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), cloneElements(snapshot)];
      futureRef.current = [];
      syncFlags();
    },
    [syncFlags]
  );

  const setElements = useCallback(
    (updater: LayoutElement[] | ((prev: LayoutElement[]) => LayoutElement[])) => {
      setElementsInternal((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        pushPast(prev);
        return next;
      });
    },
    [pushPast]
  );

  const setElementsTransient = useCallback((updater: (prev: LayoutElement[]) => LayoutElement[]) => {
    setElementsInternal(updater);
  }, []);

  const beginInteraction = useCallback((snapshot: LayoutElement[]) => {
    interactionStartRef.current = cloneElements(snapshot);
  }, []);

  const endInteraction = useCallback(() => {
    const start = interactionStartRef.current;
    interactionStartRef.current = null;
    if (!start) return;
    setElementsInternal((current) => {
      if (!elementsEqual(start, current)) {
        pushPast(start);
      }
      return current;
    });
  }, [pushPast]);

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    setElementsInternal((current) => {
      const previous = past[past.length - 1];
      pastRef.current = past.slice(0, -1);
      futureRef.current = [cloneElements(current), ...futureRef.current];
      syncFlags();
      return cloneElements(previous);
    });
  }, [syncFlags]);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    setElementsInternal((current) => {
      const next = future[0];
      futureRef.current = future.slice(1);
      pastRef.current = [...pastRef.current, cloneElements(current)];
      syncFlags();
      return cloneElements(next);
    });
  }, [syncFlags]);

  const resetHistory = useCallback(
    (next: LayoutElement[]) => {
      pastRef.current = [];
      futureRef.current = [];
      interactionStartRef.current = null;
      setElementsInternal(next);
      syncFlags();
    },
    [syncFlags]
  );

  return {
    elements,
    setElements,
    setElementsTransient,
    beginInteraction,
    endInteraction,
    undo,
    redo,
    resetHistory,
    canUndo,
    canRedo,
  };
}
