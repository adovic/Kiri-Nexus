import AuthPage from '@/components/auth/AuthPage';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
