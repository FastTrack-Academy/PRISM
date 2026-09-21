import Link from 'next/link';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`brand ${compact ? 'brandCompact' : ''}`} aria-label="PRISM home">
      <svg width="41" height="46" viewBox="0 0 41 46" fill="none" aria-hidden="true">
        <path
          d="M20.5 2 39 36 20.5 44 2 36 20.5 2Z M20.5 2 9 30 39 36 M9 30 20.5 44 M9 30 32 30 20.5 2 M2 36 32 30 20.5 44"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
      <span>PRISM</span>
    </Link>
  );
}
export function SiteHeader({ active = '' }: { active?: string }) {
  return (
    <header className="siteHeader">
      <Brand />
      <nav aria-label="Main navigation">
        <Link aria-current={active === 'analyze' ? 'page' : undefined} href="/">
          Analyze
        </Link>
        <Link aria-current={active === 'methodology' ? 'page' : undefined} href="/methodology/">
          How scoring works
        </Link>
        <Link aria-current={active === 'about' ? 'page' : undefined} href="/about/">
          About
        </Link>
      </nav>
    </header>
  );
}
