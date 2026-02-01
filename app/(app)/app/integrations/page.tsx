export const dynamic = "force-dynamic";

import Link from "next/link";
import { Lock, Calendar, Users, MessageSquare, Mail, ArrowRight } from "lucide-react";

// =============================================================================
// INTEGRATIONS PAGE
// =============================================================================
// Placeholder integrations with Coming Soon badges and disabled controls.
// Each integration shows expected ship phase and offers Request Access.

type Integration = {
  name: string;
  description: string;
  icon: typeof Users;
  phase: string;
  category: "CRM" | "Calendar" | "Communication";
};

const integrations: Integration[] = [
  {
    name: "HubSpot",
    description: "Sync leads, contacts, and call notes automatically",
    icon: Users,
    phase: "Phase 2",
    category: "CRM",
  },
  {
    name: "Salesforce",
    description: "Push call outcomes and lead data to your Salesforce org",
    icon: Users,
    phase: "Phase 2",
    category: "CRM",
  },
  {
    name: "GoHighLevel",
    description: "Connect with your GHL workflows and pipelines",
    icon: Users,
    phase: "Phase 3",
    category: "CRM",
  },
  {
    name: "Google Calendar",
    description: "Let your AI schedule appointments directly",
    icon: Calendar,
    phase: "Phase 2",
    category: "Calendar",
  },
  {
    name: "Calendly",
    description: "Book meetings through your Calendly scheduling links",
    icon: Calendar,
    phase: "Phase 2",
    category: "Calendar",
  },
  {
    name: "Slack",
    description: "Get real-time call alerts and summaries in Slack",
    icon: MessageSquare,
    phase: "Phase 3",
    category: "Communication",
  },
];

function IntegrationCard({ integration }: { integration: Integration }) {
  const Icon = integration.icon;

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.iconWrapper}>
          <Icon size={20} />
        </div>
        <span style={styles.phaseBadge}>
          <Lock size={10} />
          {integration.phase}
        </span>
      </div>
      <h3 style={styles.cardTitle}>{integration.name}</h3>
      <p style={styles.cardDesc}>{integration.description}</p>
      <button
        style={styles.connectBtn}
        disabled
        title={`Integrations ship in ${integration.phase}`}
      >
        Connect
      </button>
    </div>
  );
}

export default function IntegrationsPage() {
  const crmIntegrations = integrations.filter((i) => i.category === "CRM");
  const calendarIntegrations = integrations.filter((i) => i.category === "Calendar");
  const commIntegrations = integrations.filter((i) => i.category === "Communication");

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Integrations</h1>
          <p style={styles.subtitle}>
            Connect your tools to automate lead capture, scheduling, and notifications
          </p>
        </div>
      </div>

      {/* Coming Soon Notice */}
      <div style={styles.noticeBanner}>
        <div style={styles.noticeIcon}>
          <Lock size={18} />
        </div>
        <div style={styles.noticeContent}>
          <strong>Integrations Coming Soon</strong>
          <p style={styles.noticeText}>
            CRM, calendar, and communication integrations are in active development.
            Request early access below to be notified when your preferred integration ships.
          </p>
        </div>
        <a href="mailto:integrations@aireceptionist.com?subject=Integration%20Early%20Access%20Request" style={styles.requestBtn}>
          <Mail size={14} />
          Request Access
        </a>
      </div>

      {/* CRM Section */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>CRM Integrations</h2>
          <span style={styles.sectionBadge}>Phase 2-3</span>
        </div>
        <div style={styles.grid}>
          {crmIntegrations.map((integration) => (
            <IntegrationCard key={integration.name} integration={integration} />
          ))}
        </div>
      </section>

      {/* Calendar Section */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Calendar Integrations</h2>
          <span style={styles.sectionBadge}>Phase 2</span>
        </div>
        <div style={styles.grid}>
          {calendarIntegrations.map((integration) => (
            <IntegrationCard key={integration.name} integration={integration} />
          ))}
        </div>
      </section>

      {/* Communication Section */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Communication</h2>
          <span style={styles.sectionBadge}>Phase 3</span>
        </div>
        <div style={styles.grid}>
          {commIntegrations.map((integration) => (
            <IntegrationCard key={integration.name} integration={integration} />
          ))}
        </div>
      </section>

      {/* Demo CTA */}
      <div style={styles.demoCta}>
        <p style={styles.demoText}>
          While integrations are in development, try the demo to see the AI in action
        </p>
        <Link href="/demo/setup" style={styles.demoLink}>
          Try Demo Call
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    padding: 0,
  },
  header: {
    marginBottom: "24px",
  },
  title: {
    fontSize: "28px",
    fontWeight: 700,
    color: "#F8FAFC",
    margin: "0 0 4px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#94A3B8",
    margin: 0,
  },
  noticeBanner: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "20px 24px",
    background: "rgba(245, 158, 11, 0.08)",
    border: "1px solid rgba(245, 158, 11, 0.2)",
    borderRadius: "16px",
    marginBottom: "32px",
  },
  noticeIcon: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    background: "rgba(245, 158, 11, 0.15)",
    color: "#f59e0b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  noticeContent: {
    flex: 1,
  },
  noticeText: {
    fontSize: "13px",
    color: "#94A3B8",
    margin: "4px 0 0",
    lineHeight: 1.5,
  },
  requestBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 20px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#f59e0b",
    textDecoration: "none",
    background: "rgba(245, 158, 11, 0.1)",
    border: "1px solid rgba(245, 158, 11, 0.3)",
    borderRadius: "8px",
    whiteSpace: "nowrap",
  },
  section: {
    marginBottom: "32px",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "16px",
  },
  sectionTitle: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#F8FAFC",
    margin: 0,
  },
  sectionBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#64748B",
    padding: "4px 10px",
    background: "rgba(100, 116, 139, 0.15)",
    borderRadius: "100px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  },
  card: {
    padding: "24px",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "16px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
  },
  iconWrapper: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    background: "rgba(59, 130, 246, 0.1)",
    color: "#3B82F6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  phaseBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "10px",
    fontWeight: 600,
    color: "#64748B",
    padding: "4px 8px",
    background: "rgba(100, 116, 139, 0.1)",
    borderRadius: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  cardTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#F8FAFC",
    margin: "0 0 8px",
  },
  cardDesc: {
    fontSize: "13px",
    color: "#94A3B8",
    margin: "0 0 16px",
    lineHeight: 1.5,
  },
  connectBtn: {
    width: "100%",
    padding: "10px 16px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#64748B",
    background: "rgba(100, 116, 139, 0.1)",
    border: "1px solid rgba(100, 116, 139, 0.2)",
    borderRadius: "8px",
    cursor: "not-allowed",
    opacity: 0.6,
  },
  demoCta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    padding: "20px",
    background: "rgba(59, 130, 246, 0.05)",
    border: "1px solid rgba(59, 130, 246, 0.1)",
    borderRadius: "12px",
  },
  demoText: {
    fontSize: "14px",
    color: "#94A3B8",
    margin: 0,
  },
  demoLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#3B82F6",
    textDecoration: "none",
  },
};
