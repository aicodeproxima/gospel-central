import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/shared/Providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Diamond — Bible Study Room Booking',
  description: 'Comprehensive Bible study room booking and management system',
};

// Mobile foundation. None of these affect the desktop (≥1280) render:
// viewportFit:'cover' only matters on notched/gesture-bar phones (enables
// env(safe-area-inset-*)); interactiveWidget tunes the on-screen keyboard;
// themeColor only tints the mobile browser chrome. width/initialScale are
// the browser defaults made explicit. Zoom is intentionally NOT disabled (a11y).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="h-full font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
