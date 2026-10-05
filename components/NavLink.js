'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Top bar link that highlights when you're on its page.
export default function NavLink({ href, live = false, children }) {
  const path = usePathname() || '/';
  const active =
    href === '/'
      ? path === '/' || path.startsWith('/applicants')
      : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={`${active ? 'nav-active' : ''} ${live ? 'nav-live' : ''}`} aria-current={active ? 'page' : undefined}>
      {live && <span className="nav-dot" aria-hidden="true" />}
      {children}
    </Link>
  );
}
