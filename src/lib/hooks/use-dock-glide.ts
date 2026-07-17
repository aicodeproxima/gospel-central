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

/**
 * The overlays that own Escape while they are open. Enumerated rather than
 * matched by suffix ([data-slot$="-content"]) because `card-content` and
 * `tabs-content` share that shape without being dismissible popups.
 *
 * `[data-open]` is the load-bearing half: Base UI marks an open popup with
 * data-open and a closed one with data-closed, and it force-mounts closed
 * Select popups — so presence in the DOM is not open-ness.
 *
 * sheet-content cannot currently collide with the dock (ui/sheet.tsx is only
 * used at <md, where the dock does not render) but it is a Base UI Dialog and
 * so owns Escape the moment anyone uses one at md+. Listed for completeness.
 */
const ESCAPE_OWNING_POPUP = [
  'dialog-content',
  'sheet-content',
  'popover-content',
  'select-content',
  'dropdown-menu-content',
]
  .map((slot) => `[data-slot="${slot}"][data-open]`)
  .join(', ');

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

  const activePointersRef = useRef<Set<number>>(new Set());
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressFocusOpenRef = useRef(false);
  // Stands in for the asset's `host.matches(':hover')` guard. Set on
  // pointerenter / cleared on pointerleave, which is precisely the interval
  // during which :hover holds — but readable in a JS DOM, where :hover is not
  // tracked at all.
  const hoveredRef = useRef(false);

  const hostRef = useCallback((node: HTMLElement | null) => {
    hostEl.current = node;
    if (!node) {
      // The dock unmounted while this hook — which lives in the layout — stays
      // alive. Since /groups adopted the dock (2026-07-16) no dashboard route
      // unmounts it anymore — this fires only if the whole layout goes (e.g.
      // logout) or a future route opts out again. (NOT a resize below md: the
      // layout only CSS-hides the dock via `hidden md:block`, so it stays
      // mounted at every width and this callback never fires on a resize.)
      // Two resets, kept because the hook must stay correct without knowing
      // its consumers:
      // 1. `hoveredRef` is edge-triggered; if the host disappears under the
      //    cursor, pointerleave never fires and a stuck `true` would veto
      //    every scheduled close after remount.
      hoveredRef.current = false;
      // 2. A PIN deliberately survives the round-trip; an unpinned hover
      //    preview must not — nothing can dismiss it while the host is gone,
      //    so it would come back open and shove the margin to 284.
      if (!pinnedRef.current && openRef.current) {
        openRef.current = false;
        setOpenState(false);
      }
    }
  }, []);
  const bodyRef = useCallback((node: HTMLDivElement | null) => {
    bodyEl.current = node;
  }, []);
  const toggleRef = useCallback((node: HTMLButtonElement | null) => {
    toggleEl.current = node;
  }, []);

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
      if (event.defaultPrevented) return;
      // Dialogs, popovers, selects and menus (z-50) own Escape while open, but
      // `defaultPrevented` alone cannot detect them: Base UI 1.3 never calls
      // preventDefault on Escape, and this document listener registers at
      // layout mount — before any popup's — so it would fire first regardless.
      // Presence alone is not enough either: Base UI force-mounts closed Select
      // popups, so two sit in /calendar's DOM from first paint. `data-open` is
      // Base UI's own open-state (closed popups carry data-closed instead), so
      // it reads open-ness directly rather than inferring it from layout.
      if (document.querySelector(ESCAPE_OWNING_POPUP)) return;
      setPinned(false);
      setOpen(false, { force: true, restoreFocus: true });
    };

    const releasePointer = (event: PointerEvent) => {
      activePointersRef.current.delete(event.pointerId);
    };

    // If the window loses focus mid-drag, the matching pointerup can land
    // elsewhere and never reach us. A leaked id is not cosmetic: Chromium's
    // mouse pointerId is stably 1, so one stale entry makes every later
    // pointerleave read as a drag-away (30ms close that overrides focus).
    const releaseAllPointers = () => {
      activePointersRef.current.clear();
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    window.addEventListener('blur', releaseAllPointers);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      window.removeEventListener('blur', releaseAllPointers);
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
