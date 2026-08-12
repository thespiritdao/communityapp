'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUnifiedNotifications } from '@/context/UnifiedNotificationContext';
import { BOTTOM_NAV_ITEMS, type NavItemDef } from '@/config/moduleRegistry';
import { NavSlotIcon } from '@/components/SlotIcon';

// Wrapper component with error boundary
function MobileBottomNavContent() {
  const pathname = usePathname() || '/';
  const [mounted, setMounted] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const { unreadCounts } = useUnifiedNotifications();

  useEffect(() => setMounted(true), []);

  // Hide the nav while a text field is focused on small screens: the soft
  // keyboard already claims the bottom of the screen, and with the nav gone
  // --bottom-nav-height collapses to 0 so fixed inputs (chat composer) sit
  // directly above the keyboard instead of behind the nav.
  useEffect(() => {
    const isTextField = (el: EventTarget | null): boolean => {
      const t = el as HTMLElement | null;
      if (!t || !t.tagName) return false;
      if (t.tagName === 'TEXTAREA' || t.isContentEditable) return true;
      if (t.tagName !== 'INPUT') return false;
      const type = (t as HTMLInputElement).type;
      return !['checkbox', 'radio', 'button', 'submit', 'range', 'file', 'color'].includes(type);
    };
    const mq = window.matchMedia('(max-width: 768px)');
    const onFocusIn = (e: FocusEvent) => {
      if (mq.matches && isTextField(e.target)) setKeyboardOpen(true);
    };
    const onFocusOut = () => setKeyboardOpen(false);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  // publish exact nav height → body padding uses it so content isn't hidden
  const syncHeightVar = () => {
    const h = navRef.current?.offsetHeight ?? 0;
    document.documentElement.style.setProperty('--bottom-nav-height', `${h}px`);
  };
  useLayoutEffect(() => {
    if (keyboardOpen) {
      document.documentElement.style.setProperty('--bottom-nav-height', '0px');
      return;
    }
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
  }, [keyboardOpen]);

  const isActive = (href: string, match: NavItemDef['match'] = 'exact') => {
    if (!mounted) return false;
    return match === 'startsWith'
      ? pathname === href || pathname.startsWith(href + '/')
      : pathname === href;
  };

  // Unmounting (rather than display:none) is required: index.css forces the
  // nav visible with !important rules that inline styles cannot override.
  if (keyboardOpen) return null;

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
        background: 'hsl(var(--background))',
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
        {BOTTOM_NAV_ITEMS.map((item) => {
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
                  color: active
                    ? 'hsl(var(--primary))'
                    : 'var(--face-nav-inactive)',
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
                  <NavSlotIcon
                    slot={item.slot}
                    defaultIcon={item.defaultIcon}
                    size={36}
                    active={active}
                  />
                  {item.href === '/notifications' && unreadCounts.total > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '-8px',
                        backgroundColor: 'hsl(var(--destructive))',
                        color: 'hsl(var(--destructive-foreground))',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        minWidth: '20px',
                        border: '2px solid hsl(var(--background))',
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
