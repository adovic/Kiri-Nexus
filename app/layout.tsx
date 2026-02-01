'use client';

import './globals.css';
import Nav from '@/app/components/Nav';
import SupportChat from '@/components/SupportChat';
import { OnboardingProvider } from '@/context/OnboardingContext';
import { AuthProvider } from '@/lib/auth/context';

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <OnboardingProvider>
            <Nav />
            {children}
            <SupportChat />
          </OnboardingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
