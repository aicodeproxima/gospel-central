import type { Metadata, Viewport } from 'next';

// Isolated demo route. Has its OWN viewport export (the root layout has none)
// so the phone gets viewport-fit=cover + safe-area support and no zoom-lock.
export const metadata: Metadata = {
  title: 'Tree3D Mobile UX Demo',
  description: 'Isolated demo of two mobile interaction models for the org tree.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#05091f',
};

export default function TreeDemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
