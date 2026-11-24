import type { Metadata } from 'next';
import { SessionProvider } from '@/components/session';
import './globals.css';
export const metadata: Metadata = {
  title: 'PRISM — Perceptual Color Confusion Index (PCCI)',
  description:
    'Browser-local Perceptual Color Confusion Index (PCCI) analysis for educational images and textbook PDFs across Deuteranopia, Protanopia, and Tritanopia.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skipLink" href="#main">
          Skip to content
        </a>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
