import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { useDockGlide } from './use-dock-glide';

/**
 * State-machine tests for the Dock and Glide navigation, mapped to the
 * numbered requirements of the port. The hook is exercised through a minimal
 * harness so the assertions are about behavior, not about FloatingNav's markup
 * (that is covered by FloatingNav.itest.tsx).
 *
 * Timer note: only setTimeout/clearTimeout are faked. `queueMicrotask` (which
 * lifts the focus-open suppression) must stay real, otherwise the suppression
 * would never clear and the guard would look permanent.
 */

function Harness({ showHost = true, hoverOpens = true }: { showHost?: boolean; hoverOpens?: boolean }) {
  // Destructured rather than used as `dock.x` in the JSX — see FloatingNav.
  const { open, pinned, hostRef, bodyRef, toggleRef, hostHandlers, onToggleClick, onItemActivated } =
    useDockGlide({ hoverOpens });
  return (
    <div>
      {/* Mirrors state OUTSIDE the host so the host-unmount scenario — the
          hook alive in the layout while the aside itself is unmounted —
          remains observable after the host disappears. */}
      <div data-testid="probe" data-open={open} data-pinned={pinned} />
      {showHost && (
        <aside data-testid="host" ref={hostRef} data-open={open} data-pinned={pinned} {...hostHandlers}>
          <button data-testid="toggle" type="button" ref={toggleRef} onClick={onToggleClick}>
            Menu
          </button>
          <div data-testid="body" ref={bodyRef}>
            <button data-testid="item" type="button" onClick={onItemActivated}>
              Contacts
            </button>
          </div>
        </aside>
      )}
      <button data-testid="outside" type="button">
        Outside
      </button>
    </div>
  );
}

const host = () => screen.getByTestId('host');
const probe = () => screen.getByTestId('probe');
const isOpen = () => probe().getAttribute('data-open') === 'true';
const isPinned = () => probe().getAttribute('data-pinned') === 'true';

/**
 * React derives onPointerEnter/onPointerLeave from pointerover/pointerout at
 * the root container (EnterLeaveEventPlugin) — dispatching a bare
 * `pointerenter` would never reach the handler. `relatedTarget: null` marks the
 * crossing as coming from outside the document, which is what a real
 * enter/leave of the dock looks like.
 */
const enter = (init: { pointerType?: string; pointerId?: number } = {}) =>
  fireEvent.pointerOver(host(), { pointerType: 'mouse', pointerId: 1, relatedTarget: null, ...init });
const leave = (init: { pointerType?: string; pointerId?: number } = {}) =>
  fireEvent.pointerOut(host(), { pointerType: 'mouse', pointerId: 1, relatedTarget: null, ...init });

// `fireEvent` wraps dispatch in act() for us, but a close timer firing and a
// programmatic focus() both land state updates from outside React — without
// act() the update is scheduled and never flushed, so the DOM would still show
// the previous state and every assertion below would read a stale value.
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const focusEl = (element: HTMLElement) => act(() => element.focus());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDockGlide', () => {
  it('defaults to collapsed and unpinned (req 6)', () => {
    render(<Harness />);
    expect(isOpen()).toBe(false);
    expect(isPinned()).toBe(false);
  });

  it('opens a preview for a hover-capable pointer, ignores touch (reqs 7, 15)', () => {
    render(<Harness />);

    enter({ pointerType: 'mouse' });
    expect(isOpen()).toBe(true);
    expect(isPinned()).toBe(false); // preview is not a pin

    leave();
    advance(200);
    expect(isOpen()).toBe(false);

    enter({ pointerType: 'touch' });
    expect(isOpen()).toBe(false);

    // A pen that reports hover capability is treated like a mouse.
    enter({ pointerType: 'pen' });
    expect(isOpen()).toBe(true);
  });

  describe('hoverOpens: false (immersive pages — /groups)', () => {
    // The dock floats over the 3D canvas the user orbits by dragging, so an
    // incidental sweep must not fling the panel open across their work and
    // swallow the next click (which landed on the toggle and pinned it).
    it('a hover-capable pointer does NOT open the dock', () => {
      render(<Harness hoverOpens={false} />);

      enter({ pointerType: 'mouse' });
      expect(isOpen()).toBe(false);
      enter({ pointerType: 'pen' });
      expect(isOpen()).toBe(false);
    });

    it('still opens on a deliberate click and on keyboard focus', () => {
      render(<Harness hoverOpens={false} />);

      fireEvent.click(screen.getByTestId('toggle'), { detail: 1 });
      expect(isOpen()).toBe(true);
      expect(isPinned()).toBe(true);

      fireEvent.click(screen.getByTestId('toggle'), { detail: 1 });
      expect(isOpen()).toBe(false);

      focusEl(screen.getByTestId('item'));
      expect(isOpen()).toBe(true); // keyboard users keep their way in
    });

    it('still closes on leave once something else opened it', () => {
      // hoveredRef must keep tracking even when hover cannot OPEN, or the
      // close-timer guard would think the pointer never left.
      render(<Harness hoverOpens={false} />);
      focusEl(screen.getByTestId('item'));
      expect(isOpen()).toBe(true);

      enter();
      leave();
      focusEl(screen.getByTestId('outside'));
      advance(200);
      expect(isOpen()).toBe(false);
    });
  });

  it('collapses an unpinned preview 170ms after the pointer leaves (req 8)', () => {
    render(<Harness />);
    enter();
    expect(isOpen()).toBe(true);

    leave();
    advance(169);
    expect(isOpen()).toBe(true);

    advance(1);
    expect(isOpen()).toBe(false);
  });

  it('collapses promptly when a held pointer drags out, even with focus inside (reqs 8, 16)', () => {
    render(<Harness />);
    enter();
    focusEl(screen.getByTestId('item')); // focus retained inside the menu
    expect(isOpen()).toBe(true);

    fireEvent.pointerDown(host(), { pointerId: 7 });
    leave({ pointerId: 7 });

    advance(30);
    expect(isOpen()).toBe(false); // the 30ms path ignores the retained focus
  });

  it('tracks concurrent pointers in a Set (req 16)', () => {
    render(<Harness />);
    enter();
    fireEvent.pointerDown(host(), { pointerId: 1 });
    fireEvent.pointerDown(host(), { pointerId: 2 });

    // Releasing pointer 1 must not clear pointer 2 from the Set.
    fireEvent.pointerUp(window, { pointerId: 1 });
    leave({ pointerId: 2 });
    advance(30);
    expect(isOpen()).toBe(false); // still the drag-away path

    // With every pointer released, a leave takes the leisurely 170ms path.
    enter();
    fireEvent.pointerUp(window, { pointerId: 2 });
    leave({ pointerId: 2 });
    advance(30);
    expect(isOpen()).toBe(true);
    advance(140);
    expect(isOpen()).toBe(false);
  });

  it('drops a cancelled pointer from the Set (req 16)', () => {
    render(<Harness />);
    enter();
    fireEvent.pointerDown(host(), { pointerId: 3 });
    fireEvent.pointerCancel(window, { pointerId: 3 });

    leave({ pointerId: 3 });
    advance(30);
    expect(isOpen()).toBe(true); // no longer a drag-away
    advance(140);
    expect(isOpen()).toBe(false);
  });

  it('pins and unpins from the hamburger only (reqs 9, 10)', () => {
    render(<Harness />);

    fireEvent.click(screen.getByTestId('toggle'), { detail: 1 });
    expect(isPinned()).toBe(true);
    expect(isOpen()).toBe(true);

    fireEvent.click(screen.getByTestId('toggle'), { detail: 1 });
    expect(isPinned()).toBe(false);
    expect(isOpen()).toBe(false);
  });

  it('never lets page links change pin state (req 10)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('toggle'), { detail: 1 });
    expect(isPinned()).toBe(true);

    fireEvent.click(screen.getByTestId('item'), { detail: 1 });
    expect(isPinned()).toBe(true); // pinned navigation stays pinned AND open
    expect(isOpen()).toBe(true);

    fireEvent.click(screen.getByTestId('toggle'), { detail: 1 }); // unpin
    enter();
    fireEvent.click(screen.getByTestId('item'), { detail: 1 });
    expect(isPinned()).toBe(false); // an unpinned preview does not get pinned
    expect(isOpen()).toBe(false);
  });

  it('keeps a pinned menu open against leave and outside clicks (reqs 9, 14)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('toggle'), { detail: 1 });

    leave();
    advance(500);
    expect(isOpen()).toBe(true);

    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(isOpen()).toBe(true);
  });

  it('closes an unpinned preview on pointer-activated links, keeps it for keyboard (reqs 11, 12)', () => {
    render(<Harness />);

    enter();
    fireEvent.click(screen.getByTestId('item'), { detail: 1 }); // pointer
    expect(isOpen()).toBe(false);

    enter();
    fireEvent.click(screen.getByTestId('item'), { detail: 0 }); // keyboard
    expect(isOpen()).toBe(true);
  });

  it('preserves the focus session for keyboard route activation (req 12)', () => {
    render(<Harness />);
    const item = screen.getByTestId('item');

    focusEl(item); // focusin bubbles to the host
    expect(isOpen()).toBe(true);

    fireEvent.click(item, { detail: 0 });
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(item); // focus never left the menu
  });

  it('closes 80ms after focus leaves the menu (req 12)', () => {
    render(<Harness />);
    const item = screen.getByTestId('item');

    focusEl(item);
    expect(isOpen()).toBe(true);

    focusEl(screen.getByTestId('outside'));
    advance(80);
    expect(isOpen()).toBe(false);
  });

  it('keeps the menu open while focus moves between items inside it (req 12)', () => {
    render(<Harness />);
    focusEl(screen.getByTestId('item'));

    // Intra-menu focus moves fire blur→focus pairs; the close must re-check
    // where focus actually landed rather than fire blindly.
    focusEl(screen.getByTestId('toggle'));
    advance(200);
    expect(isOpen()).toBe(true);
  });

  it('Escape closes, clears pin, and restores focus to the hamburger (req 13)', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('toggle'), { detail: 1 });
    focusEl(screen.getByTestId('item'));
    expect(isPinned()).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(isOpen()).toBe(false);
    expect(isPinned()).toBe(false);
    expect(document.activeElement).toBe(screen.getByTestId('toggle'));

    // The focus restore must not immediately re-open the menu it just closed.
    expect(isOpen()).toBe(false);

    // ...and the suppression is momentary, not sticky: a later focus opens again.
    await Promise.resolve();
    focusEl(screen.getByTestId('outside'));
    focusEl(screen.getByTestId('toggle'));
    expect(isOpen()).toBe(true);
  });

  it('ignores an Escape that another handler already consumed (req 13)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('toggle'), { detail: 1 });

    // A dialog above the menu owns this keypress.
    const consumed = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
    consumed.preventDefault();
    fireEvent(document, consumed);

    expect(isOpen()).toBe(true);
    expect(isPinned()).toBe(true);
  });

  /** A Base UI popup as it really appears in the DOM: open ones carry data-open, closed ones data-closed. */
  function mountPopup(slot: string, state: 'open' | 'closed') {
    const popup = document.createElement('div');
    popup.setAttribute('data-slot', slot);
    popup.setAttribute(state === 'open' ? 'data-open' : 'data-closed', '');
    document.body.appendChild(popup);
    return popup;
  }

  const ESCAPE_OWNERS = [
    'dialog-content',
    'sheet-content',
    'popover-content',
    'select-content',
    'dropdown-menu-content',
  ];

  it('leaves Escape to an OPEN dialog/sheet/popover/select/menu and keeps the pin (req 13)', () => {
    // Base UI 1.3 never preventDefaults Escape and registers its document
    // listener after ours, so the dock cannot detect the popup that way. It
    // reads Base UI's own data-open instead.
    render(<Harness />);
    fireEvent.click(screen.getByTestId('toggle'), { detail: 1 });

    for (const slot of ESCAPE_OWNERS) {
      const popup = mountPopup(slot, 'open');

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(isOpen(), `pin must survive Escape while a ${slot} is open`).toBe(true);
      expect(isPinned(), `pin state must survive Escape while a ${slot} is open`).toBe(true);

      popup.remove();
    }

    // With every popup gone, the same keypress reaches the dock again.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(isOpen()).toBe(false);
    expect(isPinned()).toBe(false);
  });

  it('still closes on Escape when a CLOSED popup is force-mounted in the DOM (req 13)', () => {
    // The /calendar shape: Base UI force-mounts closed Select popups, so two sit
    // in the DOM from first paint. A presence-only guard would read those as
    // "a popup is open" and make Escape a permanent dead end on that page.
    render(<Harness />);
    fireEvent.click(screen.getByTestId('toggle'), { detail: 1 });

    const lingering = ESCAPE_OWNERS.map((slot) => mountPopup(slot, 'closed'));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(isOpen(), 'a force-mounted CLOSED popup must not swallow Escape').toBe(false);
    expect(isPinned()).toBe(false);

    lingering.forEach((el) => el.remove());
  });

  it('drops an unpinned preview when the host unmounts, but a pin survives the unmount', () => {
    const { rerender } = render(<Harness />);

    // Unpinned hover preview: nothing could dismiss it while the host is gone,
    // so it must not come back open.
    enter();
    expect(isOpen()).toBe(true);
    rerender(<Harness showHost={false} />);
    expect(isOpen()).toBe(false);
    rerender(<Harness showHost />);
    expect(isOpen()).toBe(false);

    // A deliberate pin is the state the hook is hoisted to preserve.
    fireEvent.click(screen.getByTestId('toggle'), { detail: 1 });
    expect(isPinned()).toBe(true);
    rerender(<Harness showHost={false} />);
    expect(isOpen()).toBe(true);
    expect(isPinned()).toBe(true);
    rerender(<Harness showHost />);
    expect(isOpen()).toBe(true);
    expect(isPinned()).toBe(true);
  });

  it('resets the hover latch when the host unmounts under the cursor', () => {
    const { rerender } = render(<Harness />);

    // pointerleave never fires when the hovered host is unmounted; a stuck
    // hover latch would veto every scheduled close after remount.
    enter();
    rerender(<Harness showHost={false} />);
    rerender(<Harness showHost />);

    focusEl(screen.getByTestId('item'));
    expect(isOpen()).toBe(true);
    focusEl(screen.getByTestId('outside'));
    advance(80);
    expect(isOpen()).toBe(false); // stuck latch would keep this open forever
  });

  it('forgets held pointers when the window loses focus (req 16)', () => {
    render(<Harness />);
    enter();
    fireEvent.pointerDown(host(), { pointerId: 1 });

    // pointerup landed elsewhere — the OS took focus mid-drag.
    fireEvent.blur(window);

    leave({ pointerId: 1 });
    advance(30);
    expect(isOpen()).toBe(true); // not treated as a drag-away…
    advance(140);
    expect(isOpen()).toBe(false); // …just a normal 170ms leave
  });

  it('closes an unpinned preview on outside pointer interaction (req 14)', () => {
    render(<Harness />);
    enter();
    expect(isOpen()).toBe(true);

    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(isOpen()).toBe(false);
  });

  it('ignores pointer interaction inside the menu (req 14)', () => {
    render(<Harness />);
    enter();

    fireEvent.pointerDown(screen.getByTestId('item'));
    expect(isOpen()).toBe(true);
  });
});
