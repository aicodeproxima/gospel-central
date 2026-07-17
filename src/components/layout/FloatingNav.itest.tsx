import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react';
import { UserRole } from '@/lib/types/user';
import type { User } from '@/lib/types/user';
import { usePreferencesStore } from '@/lib/stores/preferences-store';
import { useDockGlide } from '@/lib/hooks/use-dock-glide';
import { FloatingNav } from './FloatingNav';

/**
 * Rendering + ARIA contract for the Dock and Glide navigation. The state
 * machine itself is covered by use-dock-glide.itest.tsx; here we assert what
 * the menu actually exposes to users and assistive tech.
 */

const mockPathname = vi.hoisted(() => ({ current: '/dashboard' }));
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// useAuth() hydrates from the backend on mount, which would replace whatever
// viewer we inject with the seeded one. Stub it so these tests pin the exact
// role/profile under test rather than racing a fetch.
const mockAuth = vi.hoisted(() => ({
  user: null as User | null,
  logout: (() => {}) as () => void,
}));
vi.mock('@/lib/hooks/use-auth', () => ({
  useAuth: () => ({
    user: mockAuth.user,
    isAuthenticated: Boolean(mockAuth.user),
    login: vi.fn(),
    logout: () => mockAuth.logout(),
  }),
}));

const mockAlerts = vi.hoisted(() => ({ unseen: 0 }));
vi.mock('@/lib/hooks/use-alerts', () => ({
  useAlerts: () => ({ entries: [], loading: false, unseen: mockAlerts.unseen, markSeen: vi.fn() }),
}));

vi.mock('@/lib/version', () => ({ APP_VERSION: { version: '1.0.0', shortCommit: 'abc1234' } }));

function Harness() {
  const dock = useDockGlide();
  return <FloatingNav dock={dock} />;
}

function setUser(role: UserRole) {
  mockAuth.user = {
    id: 'u-1',
    username: 'michael',
    firstName: 'Michael',
    lastName: 'Adeyemi',
    email: 'michael@diamond.org',
    role,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as User;
}

const nav = () => screen.getByTestId('floating-nav');
const body = () => screen.getByTestId('floating-nav-body');
const toggle = () => screen.getByRole('button', { name: /navigation/i });
/**
 * Hover the launcher AND wait out the dwell: hovering opens the dock only for a
 * pointer that RESTS on it (req 7's hover intent — a mere transit opens
 * nothing, so a sweep can never fling the panel across the page).
 */
const hoverOpen = () => {
  fireEvent.pointerOver(nav(), { pointerType: 'mouse', pointerId: 1, relatedTarget: null });
  act(() => void vi.advanceTimersByTime(200));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  mockPathname.current = '/dashboard';
  mockAlerts.unseen = 0;
  mockAuth.logout = () => {};
  act(() => {
    usePreferencesStore.setState({ profilePhotoBase64: null, language: 'en' });
  });
  setUser(UserRole.DEV);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('FloatingNav', () => {
  it('hides collapsed content from pointer, keyboard and assistive tech (req 17)', () => {
    render(<Harness />);

    expect(body()).toHaveAttribute('inert');
    expect(body()).toHaveAttribute('aria-hidden', 'true');
    // aria-hidden content is excluded from the accessibility tree entirely.
    expect(screen.queryByRole('link', { name: 'Contacts' })).toBeNull();

    hoverOpen();

    expect(body()).not.toHaveAttribute('inert');
    expect(body()).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByRole('link', { name: 'Contacts' })).toBeInTheDocument();
  });

  it('marks the active route with aria-current, including nested routes (req 18)', () => {
    mockPathname.current = '/contacts';
    render(<Harness />);
    hoverOpen();

    expect(screen.getByRole('link', { name: 'Contacts' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Calendar' })).not.toHaveAttribute('aria-current');

    cleanup();
    mockPathname.current = '/contacts/c-70';
    render(<Harness />);
    hoverOpen();
    expect(screen.getByRole('link', { name: 'Contacts' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the hamburger label, tooltip, expanded and pressed state in sync (req 19)', () => {
    render(<Harness />);

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(toggle()).toHaveAttribute('aria-label', 'Pin navigation open');
    expect(toggle()).toHaveAttribute('title', 'Pin navigation open');

    fireEvent.click(toggle(), { detail: 1 });

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(toggle()).toHaveAttribute('aria-label', 'Unpin and close navigation');
    expect(toggle()).toHaveAttribute('title', 'Unpin and close navigation');
  });

  it('reports a hover preview as expanded but not pressed (reqs 7, 19)', () => {
    render(<Harness />);
    hoverOpen();

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('gates Reports and Admin by role', () => {
    setUser(UserRole.MEMBER);
    render(<Harness />);
    hoverOpen();

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reports' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();

    cleanup();
    setUser(UserRole.BRANCH_LEADER);
    render(<Harness />);
    hoverOpen();

    expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('signals unread alerts on the COLLAPSED launcher, not just inside the panel', () => {
    // The dock's default state is collapsed, and the panel (where the real
    // badge lives) is inert + aria-hidden until opened — so without this dot
    // md+ users would have no unread cue at all.
    mockAlerts.unseen = 4;
    render(<Harness />);
    expect(screen.getByTestId('floating-nav-unread-dot')).toBeInTheDocument();

    // Once open, the Alerts row's own badge carries the count — no double signal.
    hoverOpen();
    expect(screen.queryByTestId('floating-nav-unread-dot')).toBeNull();
    expect(screen.getByLabelText('4 unread alerts')).toBeInTheDocument();

    cleanup();
    mockAlerts.unseen = 0;
    render(<Harness />);
    expect(screen.queryByTestId('floating-nav-unread-dot')).toBeNull();
  });

  it('caps the alert badge at 9+ while announcing the true count', () => {
    mockAlerts.unseen = 12;
    render(<Harness />);
    hoverOpen();

    const badge = screen.getByLabelText('12 unread alerts');
    expect(badge).toHaveTextContent('9+');

    cleanup();
    mockAlerts.unseen = 3;
    render(<Harness />);
    hoverOpen();
    expect(screen.getByLabelText('3 unread alerts')).toHaveTextContent('3');

    cleanup();
    mockAlerts.unseen = 0;
    render(<Harness />);
    hoverOpen();
    expect(screen.queryByLabelText(/unread alerts/)).toBeNull();
  });

  it('shows the profile, role label and build version', () => {
    render(<Harness />);
    hoverOpen();

    expect(screen.getByText('Michael Adeyemi')).toBeInTheDocument();
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText('abc1234')).toBeInTheDocument();
  });

  it('prefers the saved profile photo over initials', () => {
    render(<Harness />);
    hoverOpen();
    expect(screen.getByText('MA')).toBeInTheDocument(); // initials fallback

    act(() => {
      usePreferencesStore.setState({ profilePhotoBase64: 'data:image/png;base64,iVBORw0KGgo=' });
    });

    expect(screen.queryByText('MA')).toBeNull();
    expect(nav().querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=');
  });

  it('translates every label, including the hamburger', () => {
    act(() => {
      usePreferencesStore.setState({ language: 'es' });
    });
    render(<Harness />);
    hoverOpen();

    expect(screen.getByRole('link', { name: 'Calendario' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fijar la navegación abierta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cerrar Sesión/ })).toBeInTheDocument();
  });

  it('signs out without pinning the menu (reqs 10, 11)', () => {
    const logout = vi.fn();
    mockAuth.logout = logout;
    render(<Harness />);
    hoverOpen();

    fireEvent.click(screen.getByRole('button', { name: /Sign Out/ }), { detail: 1 });

    expect(logout).toHaveBeenCalledTimes(1);
    expect(nav()).toHaveAttribute('data-pinned', 'false');
    expect(nav()).toHaveAttribute('data-open', 'false');
  });
});
