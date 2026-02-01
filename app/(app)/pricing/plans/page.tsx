'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Zap, Sparkles, Brain, ArrowRight, ArrowLeft, Clock, Phone, Users, Building2, Info, X, Check } from 'lucide-react';

// ===========================================
// TYPES
// ===========================================
type StackId = 'velocity' | 'presence' | 'oracle';

interface StackInfo {
  id: StackId;
  name: string;
  color: string;
  gradient: string;
  multiplier: number;
  icon: React.ReactNode;
}

interface Plan {
  id: string;
  name: string;
  basePrice: number;
  minutes: number;
  approxCalls: number;
  bestFor: string;
  description: string;
  highlighted: boolean;
  badge?: string;
  features: string[];
  overage: number;
}

// ===========================================
// STACK CONFIGURATIONS
// ===========================================
const STACKS: Record<StackId, StackInfo> = {
  velocity: {
    id: 'velocity',
    name: 'Velocity',
    color: '#22d3ee',
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)',
    multiplier: 1.0,
    icon: <Zap size={20} strokeWidth={2} />,
  },
  presence: {
    id: 'presence',
    name: 'Presence',
    color: '#f472b6',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)',
    multiplier: 1.4,
    icon: <Sparkles size={20} strokeWidth={2} />,
  },
  oracle: {
    id: 'oracle',
    name: 'Oracle',
    color: '#a78bfa',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
    multiplier: 2.5,
    icon: <Brain size={20} strokeWidth={2} />,
  },
};

// ===========================================
// STANDARD FEATURES (included in all plans)
// ===========================================
const STANDARD_FEATURES = [
  'Smart Call Routing',
  'Instant Text Notifications',
  '24/7 Availability',
  'Call Recording & Transcripts',
  'Custom Greeting Scripts',
  'Spam Call Filtering',
];

// ===========================================
// STANDARD PLANS (Tiers 1-4)
// ===========================================
const STANDARD_PLANS: Plan[] = [
  {
    id: 'foundation',
    name: 'Foundation',
    basePrice: 149,
    minutes: 750,
    approxCalls: 150,
    bestFor: 'Established Local Businesses',
    description: 'For established local businesses ready to automate.',
    highlighted: true,
    badge: 'Most Popular',
    features: [...STANDARD_FEATURES],
    overage: 0.20,
  },
  {
    id: 'momentum',
    name: 'Momentum',
    basePrice: 299,
    minutes: 1500,
    approxCalls: 300,
    bestFor: 'Growing Teams',
    description: 'For growing teams with daily call volume.',
    highlighted: false,
    features: [...STANDARD_FEATURES, 'Priority Support'],
    overage: 0.20,
  },
  {
    id: 'professional',
    name: 'Professional',
    basePrice: 499,
    minutes: 2500,
    approxCalls: 500,
    bestFor: 'High-Traffic Clinics & Firms',
    description: 'For high-traffic clinics & professional firms.',
    highlighted: false,
    features: [...STANDARD_FEATURES, 'Priority Support', 'Advanced Analytics'],
    overage: 0.20,
  },
  {
    id: 'executive',
    name: 'Executive',
    basePrice: 749,
    minutes: 4000,
    approxCalls: 800,
    bestFor: 'Large Agencies',
    description: 'For large agencies & high volume handling.',
    highlighted: false,
    features: [...STANDARD_FEATURES, 'Priority Support', 'Advanced Analytics', 'Dedicated Account Manager'],
    overage: 0.20,
  },
];

// ===========================================
// HIGH VOLUME & ENTERPRISE PLANS (Tiers 5-7)
// ===========================================
const HIGH_VOLUME_PLANS: Plan[] = [
  {
    id: 'corporate',
    name: 'Corporate',
    basePrice: 999,
    minutes: 5500,
    approxCalls: 1100,
    bestFor: 'Franchises & Regional Operations',
    description: 'For franchises & regional operations.',
    highlighted: false,
    features: [...STANDARD_FEATURES, 'Priority Support', 'Advanced Analytics', 'Dedicated Account Manager', 'Custom Integrations'],
    overage: 0.15,
  },
  {
    id: 'syndicate',
    name: 'Syndicate',
    basePrice: 1299,
    minutes: 7500,
    approxCalls: 1500,
    bestFor: 'Call Centers & Multi-Location',
    description: 'High-volume capacity for call centers.',
    highlighted: true,
    badge: 'Best Value',
    features: [...STANDARD_FEATURES, 'Priority Support', 'Advanced Analytics', 'Dedicated Account Manager', 'Custom Integrations', 'Priority Uptime'],
    overage: 0.15,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    basePrice: 1699,
    minutes: 10000,
    approxCalls: 2000,
    bestFor: 'Maximum Capacity Operations',
    description: 'Maximum capacity. Lowest cost per minute.',
    highlighted: false,
    features: [...STANDARD_FEATURES, 'Priority Support', 'Advanced Analytics', 'Dedicated Account Manager', 'Custom Integrations', 'Priority Uptime', 'White-Label Options'],
    overage: 0.15,
  },
];

// ===========================================
// HELPERS
// ===========================================
/**
 * Calculate dynamic price with psychological pricing
 * Formula: Math.ceil((basePrice * multiplier) / 10) * 10 - 1
 * Example: $149 * 2.5 = 372.5 -> ceil to 380 -> subtract 1 -> $379
 */
function getPrice(basePrice: number, multiplier: number): number {
  return Math.ceil((basePrice * multiplier) / 10) * 10 - 1;
}

function formatMinutes(minutes: number): string {
  if (minutes >= 1000) {
    return `${(minutes / 1000).toFixed(minutes % 1000 === 0 ? 0 : 1)}k`;
  }
  return minutes.toString();
}

function getRestaurantCalls(approxCalls: number): number {
  return Math.round(approxCalls * 2.5);
}

// ===========================================
// PARTICLE FIELD COMPONENT
// ===========================================
function ParticleField() {
  return (
    <div style={styles.particleField}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div
          key={i}
          style={{
            ...styles.particle,
            top: `${10 + i * 10}%`,
            left: `${5 + i * 12}%`,
            animationDelay: `${i * 2}s`,
          }}
        />
      ))}
    </div>
  );
}

// ===========================================
// SELECTED STACK INDICATOR
// ===========================================
function StackIndicator({ stack }: { stack: StackInfo }) {
  return (
    <div style={{ ...styles.stackIndicator, borderColor: `${stack.color}40` }}>
      <div style={{ ...styles.stackIndicatorIcon, background: `${stack.color}20`, color: stack.color }}>
        {stack.icon}
      </div>
      <div>
        <div style={styles.stackIndicatorLabel}>Selected Personality</div>
        <div style={{ ...styles.stackIndicatorName, color: stack.color }}>{stack.name}</div>
      </div>
      <Link href="/pricing" style={styles.stackIndicatorChange}>
        Change
      </Link>
    </div>
  );
}

// ===========================================
// PLAN DETAILS MODAL COMPONENT
// ===========================================
function PlanDetailsModal({
  plan,
  stack,
  isOpen,
  onClose,
}: {
  plan: Plan;
  stack: StackInfo;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const price = getPrice(plan.basePrice, stack.multiplier);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button style={styles.modalClose} onClick={onClose}>
          <X size={20} strokeWidth={2} />
        </button>

        {/* Header */}
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{plan.name}</h2>
          <div style={styles.modalPriceRow}>
            <span style={styles.modalPrice}>${price}</span>
            <span style={styles.modalPeriod}>/month</span>
          </div>
        </div>

        {/* Target Audience */}
        <div style={styles.modalSection}>
          <h4 style={styles.modalSectionTitle}>
            <Users size={16} strokeWidth={2} style={{ color: stack.color }} />
            Target Audience
          </h4>
          <p style={styles.modalSectionText}>{plan.bestFor}</p>
        </div>

        {/* Plan Metrics */}
        <div style={styles.modalMetricsGrid}>
          <div style={styles.modalMetricBox}>
            <Clock size={20} strokeWidth={2} style={{ color: '#3B82F6' }} />
            <div style={styles.modalMetricValue}>{formatMinutes(plan.minutes)}</div>
            <div style={styles.modalMetricLabel}>Minutes/Month</div>
          </div>
          <div style={styles.modalMetricBox}>
            <Phone size={20} strokeWidth={2} style={{ color: '#22c55e' }} />
            <div style={styles.modalMetricValue}>~{plan.approxCalls.toLocaleString()}</div>
            <div style={styles.modalMetricLabel}>Calls/Month</div>
          </div>
        </div>

        {/* Overage Rate */}
        <div style={styles.modalSection}>
          <h4 style={styles.modalSectionTitle}>
            <Info size={16} strokeWidth={2} style={{ color: '#f59e0b' }} />
            Overage Rate
          </h4>
          <p style={styles.modalOverageText}>
            ${plan.overage.toFixed(2)}/minute <span style={styles.modalOverageNote}>for usage beyond included minutes</span>
          </p>
        </div>

        {/* Features */}
        <div style={styles.modalSection}>
          <h4 style={styles.modalSectionTitle}>
            <Check size={16} strokeWidth={2} style={{ color: '#22c55e' }} />
            Included Features
          </h4>
          <ul style={styles.modalFeaturesList}>
            {plan.features.map((feature, idx) => (
              <li key={idx} style={styles.modalFeatureItem}>
                <div style={{ ...styles.modalFeatureCheck, background: `${stack.color}20`, color: stack.color }}>
                  <Check size={12} strokeWidth={3} />
                </div>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// PRICING CARD COMPONENT
// ===========================================
function PricingCard({
  plan,
  stack,
  isHighVolume = false,
}: {
  plan: Plan;
  stack: StackInfo;
  isHighVolume?: boolean;
}) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const price = getPrice(plan.basePrice, stack.multiplier);
  const restaurantCalls = getRestaurantCalls(plan.approxCalls);

  const handleSelect = () => {
    router.push(`/onboarding?plan=${plan.id}&stack=${stack.id}`);
  };

  const tooltipText = `Based on 5-minute average calls. For short-duration businesses (like Restaurants ~2 mins), this plan covers 2.5x more calls (approx ${restaurantCalls.toLocaleString()} calls).`;

  return (
    <>
      <div
        style={{
          ...styles.pricingCard,
          ...(plan.badge ? { paddingTop: '40px' } : {}),
          ...(plan.highlighted ? { ...styles.pricingCardHighlighted, borderColor: `${stack.color}50` } : {}),
          ...(isHighVolume ? styles.highVolumeCard : {}),
        }}
      >
        {plan.badge && (
          <div style={{ ...styles.pricingBadge, background: stack.gradient }}>
            {plan.badge}
          </div>
        )}

        <div style={styles.pricingHeader}>
          <h3 style={styles.pricingName}>{plan.name}</h3>
          <div style={styles.bestForBadge}>
            <Users size={12} strokeWidth={2} />
            {plan.bestFor}
          </div>
        </div>

        <div style={styles.pricingPriceRow}>
          <span style={styles.pricingPrice}>${price}</span>
          <span style={styles.pricingPeriod}>/mo</span>
        </div>

        <div style={styles.metricsContainer}>
          <div style={styles.minutesRow}>
            <Clock size={16} strokeWidth={2} style={{ color: '#3B82F6' }} />
            <span style={styles.minutesText}>{formatMinutes(plan.minutes)} minutes/month</span>
          </div>
          <div style={styles.callsRow}>
            <Phone size={14} strokeWidth={2} style={{ color: '#22c55e' }} />
            <span style={styles.callsText}>~{plan.approxCalls.toLocaleString()} calls/mo</span>
            <div
              style={styles.infoIconWrapper}
              title={tooltipText}
            >
              <Info size={14} strokeWidth={2} style={{ color: '#94A3B8' }} />
            </div>
          </div>
        </div>

        <p style={styles.pricingDesc}>{plan.description}</p>

        {/* Overage indicator */}
        <div style={styles.overageRow}>
          <span style={styles.overageText}>Overage: ${plan.overage.toFixed(2)}/min</span>
        </div>

        <div style={styles.cardActions}>
          <button
            onClick={handleSelect}
            style={{
              ...styles.pricingCta,
              ...(plan.highlighted ? { background: stack.gradient } : {}),
            }}
          >
            Get Started
            <ArrowRight size={18} strokeWidth={2} />
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            style={styles.detailsBtn}
          >
            See Plan Details
          </button>
        </div>
      </div>

      <PlanDetailsModal
        plan={plan}
        stack={stack}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

// ===========================================
// SECTION HEADER COMPONENT
// ===========================================
function SectionHeader({
  title,
  subtitle,
  icon,
  color
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div style={styles.sectionHeader}>
      <div style={{ ...styles.sectionHeaderIcon, background: `${color}15`, color }}>
        {icon}
      </div>
      <div>
        <h3 style={styles.sectionHeaderTitle}>{title}</h3>
        <p style={styles.sectionHeaderSubtitle}>{subtitle}</p>
      </div>
    </div>
  );
}

// ===========================================
// PLANS CONTENT COMPONENT
// ===========================================
function PlansContent() {
  const searchParams = useSearchParams();
  const stackParam = searchParams.get('stack') as StackId | null;
  const stack = STACKS[stackParam || 'velocity'] || STACKS.velocity;

  return (
    <div style={styles.page}>
      {/* Background Effects */}
      <div style={styles.bgGradient} />
      <ParticleField />

      {/* Navigation */}
      <nav style={styles.nav}>
        <Link href="/" style={styles.logo}>
          <div style={styles.logoIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            </svg>
          </div>
          AI Receptionist
        </Link>
        <div style={styles.navLinks}>
          <Link href="/" style={styles.navLink}>Home</Link>
          <Link href="/product" style={styles.navLink}>Product</Link>
          <Link href="/login" style={styles.navCta}>Get Started</Link>
        </div>
      </nav>

      {/* Header */}
      <section style={styles.header}>
        <div style={styles.stepIndicator}>
          <Link href="/pricing" style={styles.stepCompleted}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </Link>
          <div style={{ ...styles.stepLine, background: stack.color }} />
          <div style={{ ...styles.stepActive, background: stack.gradient }}>2</div>
        </div>

        <Link href="/pricing" style={styles.backLink}>
          <ArrowLeft size={16} strokeWidth={2} />
          Change Personality
        </Link>

        <h1 style={styles.headerTitle}>
          Choose Your <span style={styles.headerTitleAccent}>Capacity</span>
        </h1>
        <p style={styles.headerSubtitle}>
          Select the plan that matches your call volume. All plans include your selected AI personality.
        </p>

        {/* Selected Stack Indicator */}
        <StackIndicator stack={stack} />
      </section>

      {/* Standard Plans Section */}
      <section style={styles.pricingSection}>
        <div style={styles.pricingContainer}>
          <SectionHeader
            title="Standard Plans"
            subtitle="For growing businesses with steady call volume"
            icon={<Sparkles size={20} strokeWidth={2} />}
            color="#3B82F6"
          />
          <div style={styles.standardPlansGrid}>
            {STANDARD_PLANS.map((plan) => (
              <PricingCard key={plan.id} plan={plan} stack={stack} />
            ))}
          </div>
        </div>
      </section>

      {/* High Volume & Enterprise Section */}
      <section style={styles.highVolumeSection}>
        <div style={styles.highVolumeSectionInner}>
          <div style={styles.pricingContainer}>
            <SectionHeader
              title="High Volume & Enterprise"
              subtitle="For high-volume operations, call centers, and national brands"
              icon={<Building2 size={20} strokeWidth={2} />}
              color="#10b981"
            />
            <div style={styles.highVolumeGrid}>
              {HIGH_VOLUME_PLANS.map((plan) => (
                <PricingCard key={plan.id} plan={plan} stack={stack} isHighVolume />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <p style={styles.footerText}>
          © {new Date().getFullYear()} AI Receptionist. All rights reserved.
        </p>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes particleDrift {
          0% { transform: translate(0, 0); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translate(80px, -80px); opacity: 0; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 30px rgba(59, 130, 246, 0.3), 0 25px 50px rgba(0,0,0,0.4); }
          50% { box-shadow: 0 0 50px rgba(59, 130, 246, 0.5), 0 25px 50px rgba(0,0,0,0.4); }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ===========================================
// MAIN PAGE COMPONENT (with Suspense)
// ===========================================
export default function PricingPlansPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0F172A' }} />}>
      <PlansContent />
    </Suspense>
  );
}

// ===========================================
// STYLES
// ===========================================
const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: '100vh',
    background: '#0F172A',
    color: '#F8FAFC',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    overflowX: 'hidden',
    position: 'relative',
  },
  bgGradient: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 0,
    background: `
      radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),
      radial-gradient(ellipse 50% 30% at 80% 80%, rgba(99, 102, 241, 0.08) 0%, transparent 40%)
    `,
  },
  particleField: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 1,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    width: '4px',
    height: '4px',
    background: 'rgba(59, 130, 246, 0.5)',
    borderRadius: '50%',
    animation: 'particleDrift 18s infinite ease-in-out',
  },
  nav: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    padding: '20px 40px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  logo: {
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: '#F8FAFC',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    textDecoration: 'none',
  },
  logoIcon: {
    width: '32px',
    height: '32px',
    background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLinks: {
    display: 'flex',
    gap: '32px',
    alignItems: 'center',
  },
  navLink: {
    color: 'rgba(248, 250, 252, 0.7)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
  },
  navCta: {
    background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
    color: '#F8FAFC',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
  },
  header: {
    position: 'relative',
    zIndex: 10,
    textAlign: 'center',
    padding: '140px 40px 40px',
  },
  stepIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0',
    marginBottom: '24px',
  },
  stepCompleted: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#22c55e',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
  },
  stepLine: {
    width: '60px',
    height: '2px',
  },
  stepActive: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 700,
    boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    color: '#94A3B8',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '24px',
  },
  headerTitle: {
    fontSize: '48px',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
    margin: '0 0 16px 0',
    color: '#F8FAFC',
  },
  headerTitleAccent: {
    background: 'linear-gradient(135deg, #3B82F6 0%, #22d3ee 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  headerSubtitle: {
    fontSize: '18px',
    lineHeight: 1.6,
    color: '#94A3B8',
    margin: '0 0 32px 0',
    maxWidth: '550px',
    marginLeft: 'auto',
    marginRight: 'auto',
  },

  // Stack Indicator
  stackIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '16px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid',
    borderRadius: '16px',
    padding: '12px 20px',
  },
  stackIndicatorIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackIndicatorLabel: {
    fontSize: '11px',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  stackIndicatorName: {
    fontSize: '16px',
    fontWeight: 700,
  },
  stackIndicatorChange: {
    fontSize: '13px',
    color: '#60A5FA',
    textDecoration: 'none',
    fontWeight: 500,
    marginLeft: '8px',
  },

  // Pricing Section
  pricingSection: {
    position: 'relative',
    zIndex: 10,
    padding: '40px',
  },
  pricingContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
  },

  // Section Header
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '28px',
  },
  sectionHeaderIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderTitle: {
    fontSize: '22px',
    fontWeight: 700,
    margin: 0,
    color: '#F8FAFC',
  },
  sectionHeaderSubtitle: {
    fontSize: '14px',
    color: '#94A3B8',
    margin: '4px 0 0 0',
  },

  // Standard Plans Grid (4 columns)
  standardPlansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '20px',
  },

  // High Volume Section (VIP Zone)
  highVolumeSection: {
    position: 'relative',
    zIndex: 10,
    padding: '20px 0 60px',
  },
  highVolumeSectionInner: {
    background: 'linear-gradient(135deg, #022c22 0%, #115e59 100%)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '32px',
    margin: '0 40px',
    padding: '40px',
  },

  // High Volume Grid (3 columns, wider cards)
  highVolumeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '24px',
  },

  // High Volume Card styling
  highVolumeCard: {
    background: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },

  // Pricing Card
  pricingCard: {
    position: 'relative',
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
  },
  pricingCardHighlighted: {
    background: 'rgba(59, 130, 246, 0.06)',
    border: '2px solid',
    animation: 'glow 4s infinite ease-in-out',
  },
  pricingBadge: {
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: '100px',
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
    zIndex: 10,
  },
  pricingHeader: {
    marginBottom: '12px',
  },
  pricingName: {
    fontSize: '22px',
    fontWeight: 700,
    margin: '0 0 8px 0',
    color: '#F8FAFC',
  },
  bestForBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    padding: '4px 10px',
    borderRadius: '100px',
    fontSize: '11px',
    fontWeight: 500,
    color: '#60A5FA',
  },
  pricingPriceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '2px',
    marginBottom: '12px',
  },
  pricingPrice: {
    fontSize: '36px',
    fontWeight: 800,
    color: '#F8FAFC',
    letterSpacing: '-0.03em',
  },
  pricingPeriod: {
    fontSize: '16px',
    color: '#94A3B8',
  },
  metricsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '12px',
  },
  minutesRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'rgba(59, 130, 246, 0.08)',
    borderRadius: '8px',
  },
  minutesText: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#F8FAFC',
  },
  callsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    background: 'rgba(34, 197, 94, 0.08)',
    borderRadius: '8px',
  },
  callsText: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#22c55e',
  },
  infoIconWrapper: {
    marginLeft: 'auto',
    cursor: 'help',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px',
    borderRadius: '50%',
    transition: 'background 0.2s ease',
  },
  pricingDesc: {
    fontSize: '13px',
    color: '#94A3B8',
    margin: '0 0 12px 0',
    lineHeight: 1.5,
    flex: 1,
  },
  overageRow: {
    marginBottom: '16px',
    padding: '6px 10px',
    background: 'rgba(245, 158, 11, 0.08)',
    borderRadius: '6px',
    border: '1px solid rgba(245, 158, 11, 0.15)',
  },
  overageText: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#fbbf24',
  },
  cardActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  pricingCta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#F8FAFC',
    padding: '12px 20px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  detailsBtn: {
    background: 'transparent',
    color: '#94A3B8',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 500,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  // Modal Styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    animation: 'modalFadeIn 0.2s ease-out',
  },
  modalContent: {
    position: 'relative',
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '24px',
    padding: '32px',
    maxWidth: '480px',
    width: '90%',
    maxHeight: '85vh',
    overflowY: 'auto',
    animation: 'modalSlideIn 0.3s ease-out',
  },
  modalClose: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#94A3B8',
    transition: 'all 0.2s ease',
  },
  modalHeader: {
    marginBottom: '24px',
    paddingBottom: '20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: '28px',
    fontWeight: 800,
    margin: '0 0 12px 0',
    color: '#F8FAFC',
  },
  modalPriceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  },
  modalPrice: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#F8FAFC',
  },
  modalPeriod: {
    fontSize: '16px',
    color: '#94A3B8',
  },
  modalSection: {
    marginBottom: '20px',
  },
  modalSectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#F8FAFC',
    margin: '0 0 10px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  modalSectionText: {
    fontSize: '15px',
    color: '#94A3B8',
    margin: 0,
    lineHeight: 1.5,
  },
  modalMetricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '24px',
  },
  modalMetricBox: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '16px',
    textAlign: 'center',
  },
  modalMetricValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: '8px 0 4px',
  },
  modalMetricLabel: {
    fontSize: '12px',
    color: '#94A3B8',
  },
  modalOverageText: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fbbf24',
    margin: 0,
  },
  modalOverageNote: {
    fontSize: '13px',
    fontWeight: 400,
    color: '#94A3B8',
  },
  modalFeaturesList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '10px',
  },
  modalFeatureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    color: 'rgba(248, 250, 252, 0.9)',
  },
  modalFeatureCheck: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Footer
  footer: {
    position: 'relative',
    zIndex: 10,
    padding: '40px',
    textAlign: 'center',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  },
  footerText: {
    fontSize: '14px',
    color: 'rgba(248, 250, 252, 0.4)',
    margin: 0,
  },
};
