export const COLLECTIONS = {
  users: "users", // users/{uid}
  tenants: "tenants", // tenants/{tenantId}
  govTenants: "govTenants", // govTenants/{tenantId} — Government SaaS tenants
  stripeCustomers: "stripeCustomers", // stripeCustomers/{uid}
  stripeEvents: "stripeEvents", // stripeEvents/{eventId}
  partners: "partners", // partners/{partnerId}
  referrals: "referrals", // referrals/{referralId}
  superAdmins: "superAdmins", // superAdmins/{email} — Sovereign audit access
} as const;

export const SUBCOLLECTIONS = {
  members: "members",
  receptionist: "receptionist",
  intakeForms: "intakeForms",
  conversations: "conversations",
  events: "events",
  jobs: "jobs",
  integrations: "integrations",
  billing: "billing",
  settings: "settings",
  calls: "calls",
  leads: "leads",
  documents: "documents",
} as const;

// =============================================================================
// USER SETTINGS TYPES
// =============================================================================

export type UserProfile = {
  businessName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  updatedAt: number;
};

export type NotificationSettings = {
  emailNotifications: boolean;
  smsNotifications: boolean;
  missedCallAlerts: boolean;
  dailyDigest: boolean;
  updatedAt: number;
};

export type PhoneSettings = {
  forwardingNumber: string;
  maxCallDuration: number; // in seconds
  voicemailEnabled: boolean;
  autoAnswerDelay: number; // rings before AI picks up
  transferEnabled: boolean;
  transferNumber: string;
  updatedAt: number;
};

export type VoiceSettings = {
  voiceId: string; // e.g., 'professional', 'friendly', 'warm'
  language: string; // e.g., 'en-US', 'es-MX'
  speakingRate: number; // 0.5 to 2.0
  greetingMessage: string;
  goodbyeMessage: string;
  updatedAt: number;
};

export type BusinessHours = {
  timezone: string;
  schedule: {
    monday: { enabled: boolean; open: string; close: string };
    tuesday: { enabled: boolean; open: string; close: string };
    wednesday: { enabled: boolean; open: string; close: string };
    thursday: { enabled: boolean; open: string; close: string };
    friday: { enabled: boolean; open: string; close: string };
    saturday: { enabled: boolean; open: string; close: string };
    sunday: { enabled: boolean; open: string; close: string };
  };
  afterHoursMessage: string;
  updatedAt: number;
};

export type TenantRole = "owner" | "admin" | "member";

export type IntakeField =
  | { key: string; label: string; type: "string"; required?: boolean }
  | { key: string; label: string; type: "enum"; options: string[]; required?: boolean };

export type IntakeForm = {
  name: string;
  active: boolean;
  fields: IntakeField[];
  createdAt: number;
  updatedAt: number;
};

export type Tenant = {
  name: string;
  ownerUid: string;
  timezone?: string;
  createdAt: number;
  plan?: "trial" | "starter" | "pro";
  status?: "active" | "past_due" | "canceled";
};

export type TenantMember = {
  role: TenantRole;
  createdAt: number;
};

export type ReceptionistProfile = {
  name: string;
  tone: string;
  greeting: string;
  businessDescription?: string;
  escalationRules?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

// ── Government SaaS Tenant ───────────────────────────────────────────────────

export type GovTenantStatus = "active" | "suspended" | "provisioning";

export type GovTenant = {
  agency_name: string;
  jurisdiction_state: string;
  vapi_secret: string;
  vapi_assistant_id: string;
  vapi_public_key: string;
  server_url: string;
  agent_nhi: string;
  status: GovTenantStatus;
  owner_uid: string;
  authorized_emails: string[];
};

// ── Super Admin (Sovereign Data Protection) ──────────────────────────────────
// Document ID = email address. Only SUPER_ADMINs can access cross-tenant
// audit logs. Every access is logged as an [AUDIT_SHIELD] entry.

export type SuperAdmin = {
  name: string;
  role: "SUPER_ADMIN";
  granted_at: number;
  granted_by: string;
};
