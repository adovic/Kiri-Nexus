'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, Calendar, ArrowUpRight, ExternalLink, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import type { SessionUser, UserSubscription } from '@/lib/auth/session';
import { PLANS, STACKS } from '@/lib/stripe/products';

// =============================================================================
// TYPES
// =============================================================================

type Props = {
  user: SessionUser;
  subscription: UserSubscription;
  billingEnabled?: boolean;
};

// =============================================================================
// USAGE BAR COMPONENT
// =============================================================================

function UsageBar({ used, total }: { used: number; total: number }) {
  const percentage = total > 0 ? Math.round((used / total) * 100) : 0;
  const isWarning = percentage >= 80;

  return (
    <div style={styles.usageBarWrapper}>
      <div style={styles.usageBarBg}>
        <div
          style={{
            ...styles.usageBarFill,
            width: `${percentage}%`,
            background: isWarning
              ? 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)'
              : 'linear-gradient(90deg, #3B82F6 0%, #6366F1 100%)',
          }}
        />
      </div>
      <div style={styles.usageLabels}>
        <span style={styles.usageUsed}>{used} min used</span>
        <span style={styles.usageTotal}>{total} min total</span>
      </div>
    </div>
  );
}

// =============================================================================
// BILLING NOT ENABLED STATE
// =============================================================================

function BillingNotEnabled() {
  return (
    <div style={styles.noSubCard}>
      <div style={{ ...styles.noSubIcon, background: 'linear-gradient(135deg, rgba(100, 116, 139, 0.2) 0%, rgba(71, 85, 105, 0.2) 100%)' }}>
        <CreditCard size={32} />
      </div>
      <h2 style={styles.noSubTitle}>Billing Coming Soon</h2>
      <p style={styles.noSubDesc}>
        Billing and subscription management is not yet enabled. We&apos;re currently in development mode.
      </p>
      <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', maxWidth: '400px' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#F8FAFC' }}>What&apos;s Coming</h4>
        <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: '13px', color: '#94A3B8', lineHeight: 1.8 }}>
          <li>Multiple subscription tiers</li>
          <li>Usage-based billing</li>
          <li>Invoice management</li>
          <li>Payment method updates</li>
        </ul>
      </div>
      <Link href="/demo/setup" style={{ ...styles.noSubCta, marginTop: '24px', background: 'rgba(59, 130, 246, 0.2)', boxShadow: 'none' }}>
        Try the Demo
        <ArrowUpRight size={18} />
      </Link>
    </div>
  );
}

// =============================================================================
// NO SUBSCRIPTION STATE
// =============================================================================

function NoSubscription() {
  return (
    <div style={styles.noSubCard}>
      <div style={styles.noSubIcon}>
        <Sparkles size={32} />
      </div>
      <h2 style={styles.noSubTitle}>No Active Subscription</h2>
      <p style={styles.noSubDesc}>
        Subscribe to a plan to start using AI Receptionist and manage your billing here.
      </p>
      <Link href="/pricing/plans" style={styles.noSubCta}>
        View Plans
        <ArrowUpRight size={18} />
      </Link>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function BillingClient({ user, subscription, billingEnabled = false }: Props) {
  const router = useRouter();
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [error, setError] = useState('');

  // Show billing not enabled state
  if (!billingEnabled) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <h1 style={styles.title}>Billing</h1>
          <p style={styles.subtitle}>Manage your subscription and payment methods</p>
        </div>
        <BillingNotEnabled />
      </div>
    );
  }

  // Get plan and stack names
  const planInfo = subscription.planId ? PLANS[subscription.planId as keyof typeof PLANS] : null;
  const stackInfo = subscription.stackId ? STACKS[subscription.stackId as keyof typeof STACKS] : null;

  const planName = planInfo?.name || 'Unknown Plan';
  const stackName = stackInfo?.name || '';
  const displayName = stackName ? `${planName} (${stackName})` : planName;

  // Calculate price (in real app, this would come from subscription)
  const price = planInfo && stackInfo
    ? Math.ceil((planInfo.basePrice * stackInfo.multiplier) / 10) * 10 - 1
    : 0;

  // Format next billing date
  const nextBillingDate = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // Usage data (would come from Firestore in real app)
  const usedMinutes = 0;
  const totalMinutes = subscription.usageLimitMinutes || 0;

  // Handle opening customer portal
  const handleManageBilling = async () => {
    setError('');
    setIsLoadingPortal(true);

    try {
      const response = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to open billing portal');
      }
    } catch (err) {
      setError('Failed to connect to billing service');
    } finally {
      setIsLoadingPortal(false);
    }
  };

  // Show no subscription state
  if (subscription.status === 'none') {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <h1 style={styles.title}>Billing</h1>
          <p style={styles.subtitle}>Manage your subscription and payment methods</p>
        </div>
        <NoSubscription />
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Billing</h1>
          <p style={styles.subtitle}>Manage your subscription and payment methods</p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={styles.errorBanner}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Past Due Warning */}
      {subscription.status === 'past_due' && (
        <div style={styles.warningBanner}>
          <AlertCircle size={18} />
          <span>Your payment failed. Please update your payment method to avoid service interruption.</span>
          <button onClick={handleManageBilling} style={styles.warningButton}>
            Update Payment
          </button>
        </div>
      )}

      {/* Current Plan */}
      <div style={styles.planCard}>
        <div style={styles.planHeader}>
          <div>
            <span style={styles.planLabel}>Current Plan</span>
            <h2 style={styles.planName}>{displayName}</h2>
            <span style={{
              ...styles.statusBadge,
              background: subscription.status === 'active' ? 'rgba(34, 197, 94, 0.1)' :
                subscription.status === 'trialing' ? 'rgba(59, 130, 246, 0.1)' :
                'rgba(245, 158, 11, 0.1)',
              color: subscription.status === 'active' ? '#22c55e' :
                subscription.status === 'trialing' ? '#3B82F6' :
                '#f59e0b',
            }}>
              {subscription.status === 'active' ? 'Active' :
               subscription.status === 'trialing' ? 'Trial' :
               subscription.status === 'past_due' ? 'Past Due' :
               subscription.status}
            </span>
          </div>
          {price > 0 && (
            <div style={styles.planPrice}>
              <span style={styles.priceAmount}>${price}</span>
              <span style={styles.pricePeriod}>/month</span>
            </div>
          )}
        </div>

        <div style={styles.planUsage}>
          <h4 style={styles.usageTitle}>Minutes Usage</h4>
          <UsageBar used={usedMinutes} total={totalMinutes} />
        </div>

        <div style={styles.planFooter}>
          {nextBillingDate && (
            <div style={styles.nextBilling}>
              <Calendar size={16} />
              <span>Next billing: {nextBillingDate}</span>
            </div>
          )}
          <button
            onClick={handleManageBilling}
            style={styles.manageBillingBtn}
            disabled={isLoadingPortal}
          >
            {isLoadingPortal ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Loading...
              </>
            ) : (
              <>
                <ExternalLink size={16} />
                Manage Billing
              </>
            )}
          </button>
        </div>
      </div>

      {/* Billing Portal Info */}
      <div style={styles.infoSection}>
        <h3 style={styles.infoTitle}>Billing Portal</h3>
        <p style={styles.infoText}>
          Click &quot;Manage Billing&quot; to access the Stripe Customer Portal where you can:
        </p>
        <ul style={styles.infoList}>
          <li>Update payment methods</li>
          <li>View and download invoices</li>
          <li>Change or cancel your subscription</li>
          <li>Update billing information</li>
        </ul>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    padding: '0',
  },
  header: {
    marginBottom: '28px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#94A3B8',
    margin: 0,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 20px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '12px',
    color: '#ef4444',
    fontSize: '14px',
    marginBottom: '20px',
  },
  warningBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 20px',
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    borderRadius: '12px',
    color: '#f59e0b',
    fontSize: '14px',
    marginBottom: '20px',
  },
  warningButton: {
    marginLeft: 'auto',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#f59e0b',
    background: 'rgba(245, 158, 11, 0.15)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  // No subscription state
  noSubCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 32px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '20px',
    textAlign: 'center',
  },
  noSubIcon: {
    width: '72px',
    height: '72px',
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#60a5fa',
    marginBottom: '24px',
  },
  noSubTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: '0 0 12px',
  },
  noSubDesc: {
    fontSize: '15px',
    color: '#94A3B8',
    margin: '0 0 28px',
    maxWidth: '400px',
  },
  noSubCta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 28px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    textDecoration: 'none',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
    boxShadow: '0 0 30px rgba(59, 130, 246, 0.3)',
  },
  // Plan card
  planCard: {
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    borderRadius: '20px',
    padding: '28px',
    marginBottom: '24px',
  },
  planHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  planLabel: {
    fontSize: '13px',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  planName: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: '4px 0 8px',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: 600,
    borderRadius: '100px',
    textTransform: 'capitalize',
  },
  planPrice: {
    textAlign: 'right',
  },
  priceAmount: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#F8FAFC',
  },
  pricePeriod: {
    fontSize: '14px',
    color: '#64748B',
  },
  planUsage: {
    marginBottom: '24px',
  },
  usageTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#94A3B8',
    margin: '0 0 12px',
  },
  usageBarWrapper: {},
  usageBarBg: {
    height: '10px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '5px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  usageBarFill: {
    height: '100%',
    borderRadius: '5px',
    transition: 'width 0.3s ease',
  },
  usageLabels: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  usageUsed: {
    fontSize: '13px',
    color: '#F8FAFC',
    fontWeight: 500,
  },
  usageTotal: {
    fontSize: '13px',
    color: '#64748B',
  },
  planFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  },
  nextBilling: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#94A3B8',
  },
  manageBillingBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
  },
  // Info section
  infoSection: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '16px',
    padding: '24px',
  },
  infoTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#F8FAFC',
    margin: '0 0 12px',
  },
  infoText: {
    fontSize: '14px',
    color: '#94A3B8',
    margin: '0 0 16px',
  },
  infoList: {
    margin: 0,
    padding: '0 0 0 20px',
    fontSize: '14px',
    color: '#64748B',
    lineHeight: 1.8,
  },
};
