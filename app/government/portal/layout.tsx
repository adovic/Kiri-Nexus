'use client';

import { GovAuthProvider } from '@/context/GovAuthContext';

// =============================================================================
// GOVERNMENT PORTAL LAYOUT
// =============================================================================
// This layout wraps all /government/portal/* pages with the GovAuthProvider
// context, enabling authentication and authorization for government users.
// =============================================================================

export default function GovernmentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GovAuthProvider>{children}</GovAuthProvider>;
}
