'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Headless state machine for the "Dock and Glide" floating navigation.
 *
 * Ported 1:1 from the audited asset
 * (`Assets/GPT Assets/Floating Menu Concept A - Dock and Glide.html`, script
 * block). The presentation lives in `components/layout/FloatingNav.tsx`; this
 * hook owns only behavior so the machine is testable without a real browser.
 *
 * Two deliberate deviations from the asset, both documented at their site:
 *   1. `hoveredRef` replaces the asset's `host.matches(':hover')`.
 *   2. Escape is ignored once another handler has consumed it.
 */

interface SetOpenOptions {
  /** Bypass the pinned latch. Only the hamburger's own toggle passes this. */
  force?: boolean;
  /** Pull focus back to the hamburger even if focus already left the menu. */
  restoreFocus?: boolean;
}

export interface UseDockGlideResult {
  open: boolean;
  pinned: boolean;
  /**
   * Callback refs, not ref objects: the consumer must be able to attach these
   * during render, and handing out a `.current` to read there is exactly what
   * `react-hooks/refs` (rightly) forbids.
   */
  hostRef: (node: HTMLElement | null) => void;
  bodyRef: (node: HTMLDivElement | null) => void;
  toggleRef: (node: HTMLButtonElement | null) => void;
  hostHandlers: {
    onPointerEnter: (event: React.PointerEvent) => void;
    onPointerLeave: (event: React.PointerEvent) => void;
    onPointerDown: (event: React.PointerEvent) => void;
    onFocus: () => void;
    onBlur: () => void;
  };
  onToggleClick: (event: React.MouseEvent) => void;
  onItemActivated: (event: React.MouseEvent) => void;
}

export function useDockGlide(): UseDockGlideResult {
  const [open, setOpenState] = useState(false);
  const [pinned, setPinnedState] = useState(false);

  // Mirror state into refs: the close timer and the document-level listeners
  // run outside React's render cycle and must read live values, not the values
  // captured when they were registered.
  const openRef = useRef(false);
  const pinnedRef = useRef(false);

  const hostEl = useRef<HTMLElement | null>(null);
  const bodyEl = useRef<HTMLDivElement | null>(null);
  const toggleEl = useRef<HTMLButtonElement | null>(null);

  const hostRef = useCallback((node: HTMLElement | null) => {
    hostEl.current = node;
  }, []);
  const bodyRef = useCallback((node: HTMLDivElement | null) => {
    bodyEl.current = node;
  }, []);
  const toggleRef = useCallback((node: HTMLButtonElement | null) => {
    toggleEl.current = node;
  }, []);

  const activePointersRef = useRef<Set<number>>(new Set());
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressFocusOpenRef = useRef(false);
  // Stands in for the asset's `host.matches(':hover')` guard. Set on
  // pointerenter / cleared on pointerleave, which is precisely the interval
  // during which :hover holds — but readable in a JS DOM, where :hover is not
  // tracked at all.
  const hoveredRef = useRef(false);

  const setPinned = useCallback((next: boolean) => {
    pinnedRef.current = next;
    setPinnedState(next);
  }, []);

  /**
   * Return focus to the hamburger WITHOUT the resulting focusin re-opening the
   * menu we are in the middle of closing.
   */
  const focusToggleWithoutOpening = useCallback(() => {
    suppressFocusOpenRef.current = true;
    toggleEl.current?.focus({ preventScroll: true });
    queueMicrotask(() => {
      suppressFocusOpenRef.current = false;
    });
  }, []);

  const setOpen = useCallback(
    (next: boolean, { force = false, restoreFocus = false }: SetOpenOptions = {}) => {
      if (pinnedRef.current && !next && !force) return;
      if (!next && (restoreFocus || bodyEl.current?.contains(document.activeElement))) {
        focusToggleWithoutOpening();
      }
      openRef.current = next;
      setOpenState(next);
    },
    [focusToggleWithoutOpening],
  );

  const scheduleClose = useCallback(
    (delay = 170, ignoreFocus = false) => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (pinnedRef.current) return;
      closeTimerRef.current = setTimeout(() => {
        if (!hoveredRef.current && (ignoreFocus || !hostEl.current?.contains(document.activeElement))) {
          setOpen(false);
        }
      }, delay);
    },
    [setOpen],
  );

  const onPointerEnter = useCallback(
    (event: React.PointerEvent) => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      hoveredRef.current = true;
      // Capability is read off the EVENT, not a device-wide media query, so a
      // mouse attached to a touchscreen still gets the hover preview and a
      // finger on that same screen does not.
      if (event.pointerType !== 'touch') setOpen(true);
    },
    [setOpen],
  );

  const onPointerLeave = useCallback(
    (event: React.PointerEvent) => {
      hoveredRef.current = false;
      // A pointer still down as it leaves means the user is dragging out of the
      // menu: collapse promptly, and don't let retained focus veto the close.
      const draggingAway = activePointersRef.current.has(event.pointerId);
      scheduleClose(draggingAway ? 30 : 170, draggingAway);
    },
    [scheduleClose],
  );

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    activePointersRef.current.add(event.pointerId);
  }, []);

  // React's onFocus/onBlur ARE focusin/focusout (they bubble), which is what the
  // asset listens for.
  const onFocus = useCallback(() => {
    if (!suppressFocusOpenRef.current) setOpen(true);
  }, [setOpen]);

  const onBlur = useCallback(() => {
    scheduleClose(80);
  }, [scheduleClose]);

  /** The ONLY entry point that may change pin state. */
  const onToggleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const next = !pinnedRef.current;
      setPinned(next);
      setOpen(next, { force: true });
    },
    [setOpen, setPinned],
  );

  /**
   * Page links, profile controls and Sign Out. Never touches pin state: a
   * pointer click dismisses an unpinned preview, while keyboard activation
   * keeps focus (and therefore the menu) so tab order stays continuous.
   */
  const onItemActivated = useCallback(
    (event: React.MouseEvent) => {
      const pointerActivated = event.detail > 0;
      if (!pointerActivated) return;
      (event.currentTarget as HTMLElement).blur();
      if (!pinnedRef.current) setOpen(false);
    },
    [setOpen],
  );

  useEffect(() => {
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const host = hostEl.current;
      if (!host) return;
      if (openRef.current && !pinnedRef.current && !host.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!hostEl.current || !openRef.current) return;
      if (event.key !== 'Escape') return;
      // Dialogs and popovers (z-50) sit above the menu and consume Escape
      // first; without this the same keypress would also silently unpin.
      if (event.defaultPrevented) return;
      setPinned(false);
      setOpen(false, { force: true, restoreFocus: true });
    };

    const releasePointer = (event: PointerEvent) => {
      activePointersRef.current.delete(event.pointerId);
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [setOpen, setPinned]);

  return {
    open,
    pinned,
    hostRef,
    bodyRef,
    toggleRef,
    hostHandlers: { onPointerEnter, onPointerLeave, onPointerDown, onFocus, onBlur },
    onToggleClick,
    onItemActivated,
  };
}
