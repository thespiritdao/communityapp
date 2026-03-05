'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Home, Vote, Bell, HeartHandshake } from 'lucide-react';
import { useUnifiedNotifications } from '@/context/UnifiedNotificationContext';

type Item = {
  href: string;
  label: string;
  match?: 'exact' | 'startsWith';
  icon: JSX.Element;
};

const NAV_ITEMS: Item[] = [
  {
    href: '/home',
    label: 'Home',
    match: 'startsWith',
    icon: <Home size={36} />,
  },
  {
    href: '/faucet',
    label: 'Donate',
    match: 'startsWith',
    icon: <HeartHandshake size={36} />,
  },
  {
    href: '/governance',
    label: 'Govern',
    match: 'startsWith',
    icon: <Vote size={36} />,
  },
  {
    href: '/notifications',
    label: 'Alerts',
    match: 'startsWith',
    icon: <Bell size={36} />,
  },
];

// Wrapper component with error boundary
function MobileBottomNavContent() {
  const pathname = usePathname() || '/';
  const [mounted, setMounted] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const { unreadCounts } = useUnifiedNotifications();

  useEffect(() => setMounted(true), []);

  // publish exact nav height → body padding uses it so content isn't hidden
  const syncHeightVar = () => {
    const h = navRef.current?.offsetHeight ?? 0;
    document.documentElement.style.setProperty('--bottom-nav-height', `${h}px`);
  };
  useLayoutEffect(() => {
    syncHeightVar();
    const onResize = () => syncHeightVar();
    const ro = new ResizeObserver(onResize);
    if (navRef.current) ro.observe(navRef.current);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const isActive = (href: string, match: Item['match'] = 'exact') => {
    if (!mounted) return false;
    return match === 'startsWith'
      ? pathname === href || pathname.startsWith(href + '/')
      : pathname === href;
  };

  return (
    <nav
      ref={navRef}
      role="navigation"
      aria-label="Primary"
      className="mobile-bottom-nav"
      style={{
        // ALWAYS VISIBLE - NEVER HIDDEN
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        display: 'flex',
        opacity: 1,
        visibility: 'visible',
        pointerEvents: 'auto',
        transform: 'none',
        zIndex: 2147483647,
        background: '#f5f4ed',
        borderTop: '1px solid rgba(0,0,0,0.1)',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.08)',
        paddingTop: '8px',
        paddingBottom: 'env(safe-area-inset-bottom, 8px)', // Fallback for Android
        minHeight: '60px',
        boxSizing: 'border-box',
      }}
      data-testid="mobile-bottom-nav"
      data-tour="bottom-nav"
    >
      <ul
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'stretch',
          width: '100%',
          height: '100%',
          margin: 0,
          padding: '0 16px',
          listStyle: 'none',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.match);
          const ALIGN: Record<string, 'flex-start' | 'center' | 'flex-end'> = {
            '/home': 'flex-start',
            '/notifications': 'flex-end',
          };
          return (
            <li
              key={item.href}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxWidth: '150px',
              }}
            >
              <Link
                href={item.href}
                prefetch={true}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: ALIGN[item.href] ?? 'center',
                  padding: '8px 12px',
                  textDecoration: 'none',
                  color: active ? '#2563EB' : '#374151',
                  minHeight: '40px',
                  width: '100%',
                  borderRadius: '8px',
                  transition: 'background-color 0.2s ease',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {item.icon}
                  {item.href === '/notifications' && unreadCounts.total > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '-8px',
                        backgroundColor: '#EF4444',
                        color: 'white',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        minWidth: '20px',
                        border: '2px solid #f5f4ed',
                      }}
                    >
                      {unreadCounts.total > 99 ? '99+' : unreadCounts.total}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Simplified wrapper - just export the content directly
export default function MobileBottomNav() {
  return <MobileBottomNavContent />;
}
