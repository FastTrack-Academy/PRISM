import type { Metadata } from 'next';
import { SessionProvider } from '@/components/session';
import './globals.css';
export const metadata: Metadata = {
  title: 'PRISM — See every page more clearly',
  description:
    'Private, on-device color accessibility analysis for textbooks. Compare color vision simulations, inspect confusing regions, and preview thoughtful corrections.',
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
