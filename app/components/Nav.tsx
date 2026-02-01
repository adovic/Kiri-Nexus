'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';

// =============================================================================
// COMMERCIAL NAVIGATION - LOCKED SPEC
// =============================================================================
// Left links: Home, How It Works, Demo, FAQ, Government
// Logged out: Login (/login), Sign Up (/signup), Get Started (/pricing)
// Logged in: Dashboard (/dashboard), Sign Out
// =============================================================================

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/demo/setup', label: 'Demo' },
  { href: '/faq', label: 'FAQ' },
  { href: '/government', label: 'Government', isSpecial: true },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isLoggedIn = !!user && !loading;

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      // Silent fail - user will see they're still logged in
    }
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav style={styles.nav}>
      <div style={styles.navInner}>
        {/* Logo */}
        <Link href="/" style={styles.logo}>
          <div style={styles.logoIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
            </svg>
          </div>
          <span style={styles.logoText}>AI Receptionist</span>
        </Link>

        {/* Desktop Navigation Links */}
        <div style={styles.navLinks} className="nav-links-desktop">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                ...styles.navLink,
                ...(isActive(link.href) ? styles.navLinkActive : {}),
                ...(link.isSpecial ? styles.navLinkSpecial : {}),
                ...(link.isSpecial && isActive(link.href) ? styles.navLinkSpecialActive : {}),
              }}
            >
              {link.label}
              {link.isSpecial && <span style={styles.govBadge}>GOV</span>}
              {isActive(link.href) && <span style={styles.activeIndicator} />}
            </Link>
          ))}
        </div>

        {/* Desktop Actions */}
        <div style={styles.navActions} className="nav-actions-desktop">
          {loading ? (
            <div style={styles.loadingDot} />
          ) : isLoggedIn ? (
            <>
              <button onClick={handleSignOut} style={styles.signOutBtn}>
                Sign Out
              </button>
              <Link href="/dashboard" style={styles.dashboardBtn}>
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" style={styles.loginBtn}>
                Login
              </Link>
              <Link href="/signup" style={styles.signUpBtn}>
                Sign Up
              </Link>
              <Link href="/pricing" style={styles.getStartedBtn}>
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          style={styles.mobileMenuBtn}
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div style={styles.mobileMenu} className="mobile-menu">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                ...styles.mobileNavLink,
                ...(isActive(link.href) ? styles.mobileNavLinkActive : {}),
                ...(link.isSpecial ? styles.mobileNavLinkSpecial : {}),
              }}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
              {link.isSpecial && <span style={styles.govBadgeMobile}>GOV</span>}
            </Link>
          ))}
          <div style={styles.mobileActions}>
            {isLoggedIn ? (
              <>
                <button
                  onClick={() => {
                    handleSignOut();
                    setMobileMenuOpen(false);
                  }}
                  style={styles.mobileSignOutBtn}
                >
                  Sign Out
                </button>
                <Link
                  href="/dashboard"
                  style={styles.mobileDashboardBtn}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  style={styles.mobileLoginBtn}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  style={styles.mobileSignUpBtn}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign Up
                </Link>
                <Link
                  href="/pricing"
                  style={styles.mobileGetStartedBtn}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles: { [key: string]: React.CSSProperties } = {
  nav: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    background: 'rgba(2, 6, 23, 0.95)',
    backdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(6, 182, 212, 0.15)',
  },
  navInner: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    textDecoration: 'none',
  },
  logoIcon: {
    width: '36px',
    height: '36px',
    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)',
  },
  logoText: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#F8FAFC',
    letterSpacing: '-0.02em',
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navLink: {
    position: 'relative',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'rgba(248, 250, 252, 0.7)',
    textDecoration: 'none',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
  },
  navLinkActive: {
    color: '#22d3ee',
    background: 'rgba(6, 182, 212, 0.1)',
  },
  navLinkSpecial: {
    border: '1px solid rgba(30, 64, 175, 0.3)',
    background: 'rgba(30, 64, 175, 0.1)',
    color: '#93C5FD',
  },
  navLinkSpecialActive: {
    border: '1px solid rgba(59, 130, 246, 0.5)',
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#60A5FA',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: '4px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '20px',
    height: '2px',
    background: 'linear-gradient(90deg, #06b6d4, #22d3ee)',
    borderRadius: '2px',
  },
  govBadge: {
    marginLeft: '6px',
    padding: '2px 6px',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: '#3B82F6',
    background: 'rgba(59, 130, 246, 0.15)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '4px',
  },
  navActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  loadingDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#64748B',
  },
  loginBtn: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'rgba(248, 250, 252, 0.8)',
    textDecoration: 'none',
    borderRadius: '8px',
    background: 'transparent',
    transition: 'all 0.2s ease',
  },
  signUpBtn: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#F8FAFC',
    textDecoration: 'none',
    borderRadius: '8px',
    background: 'transparent',
    border: '1px solid rgba(248, 250, 252, 0.2)',
    transition: 'all 0.2s ease',
  },
  getStartedBtn: {
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    textDecoration: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
    boxShadow: '0 0 20px rgba(6, 182, 212, 0.3)',
    transition: 'all 0.2s ease',
  },
  signOutBtn: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#94A3B8',
    background: 'transparent',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  dashboardBtn: {
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    textDecoration: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
    boxShadow: '0 0 20px rgba(6, 182, 212, 0.3)',
    transition: 'all 0.2s ease',
  },
  // Mobile styles
  mobileMenuBtn: {
    display: 'none',
    padding: '8px',
    background: 'transparent',
    border: 'none',
    color: '#F8FAFC',
    cursor: 'pointer',
  },
  mobileMenu: {
    display: 'none',
    flexDirection: 'column',
    padding: '16px 24px 24px',
    background: 'rgba(2, 6, 23, 0.98)',
    borderTop: '1px solid rgba(6, 182, 212, 0.15)',
  },
  mobileNavLink: {
    padding: '14px 16px',
    fontSize: '16px',
    fontWeight: 500,
    color: 'rgba(248, 250, 252, 0.7)',
    textDecoration: 'none',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
  },
  mobileNavLinkActive: {
    color: '#22d3ee',
    background: 'rgba(6, 182, 212, 0.1)',
  },
  mobileNavLinkSpecial: {
    border: '1px solid rgba(30, 64, 175, 0.3)',
    background: 'rgba(30, 64, 175, 0.1)',
    color: '#93C5FD',
  },
  govBadgeMobile: {
    marginLeft: '8px',
    padding: '3px 8px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: '#3B82F6',
    background: 'rgba(59, 130, 246, 0.15)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '4px',
  },
  mobileActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid rgba(6, 182, 212, 0.15)',
  },
  mobileLoginBtn: {
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: 500,
    color: 'rgba(248, 250, 252, 0.8)',
    textDecoration: 'none',
    textAlign: 'center' as const,
    borderRadius: '10px',
    background: 'transparent',
  },
  mobileSignUpBtn: {
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: 500,
    color: '#F8FAFC',
    textDecoration: 'none',
    textAlign: 'center' as const,
    borderRadius: '10px',
    background: 'transparent',
    border: '1px solid rgba(248, 250, 252, 0.2)',
  },
  mobileGetStartedBtn: {
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    textDecoration: 'none',
    textAlign: 'center' as const,
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
  },
  mobileSignOutBtn: {
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: 500,
    color: '#94A3B8',
    textAlign: 'center' as const,
    borderRadius: '10px',
    background: 'transparent',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    cursor: 'pointer',
  },
  mobileDashboardBtn: {
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    textDecoration: 'none',
    textAlign: 'center' as const,
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
  },
};

// =============================================================================
// RESPONSIVE MEDIA QUERIES
// =============================================================================

if (typeof window !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.id = 'nav-responsive-styles';
  styleEl.textContent = `
    @media (max-width: 768px) {
      .nav-links-desktop { display: none !important; }
      .nav-actions-desktop { display: none !important; }
      .mobile-menu-btn { display: flex !important; }
      .mobile-menu { display: flex !important; }
    }
  `;
  if (!document.getElementById('nav-responsive-styles')) {
    document.head.appendChild(styleEl);
  }
}
