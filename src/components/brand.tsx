import Link from 'next/link';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`brand ${compact ? 'brandCompact' : ''}`} aria-label="PRISM home">
      <img
        src="/logo.png"
        alt=""
        width={compact ? 42 : 54}
        height={compact ? 29 : 37}
        className="brandLogo"
      />
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
