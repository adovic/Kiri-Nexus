'use client';

// TODO: Add server component wrapper (page.tsx -> SettingsClient.tsx pattern)
// to verify session server-side before rendering, matching dashboard/page.tsx pattern.
// Current protection relies on middleware cookie-existence check only.

import { useState, useEffect } from 'react';
import { Settings, User, Phone, Bell, Shield, Globe, Mic, Clock, ChevronRight, Save, Loader2, Check, AlertCircle } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

type SettingsData = {
  profile: ProfileData | null;
  notifications: NotificationData | null;
  phone: PhoneData | null;
  voice: VoiceData | null;
  hours: HoursData | null;
};

type ProfileData = {
  businessName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type NotificationData = {
  emailNotifications: boolean;
  smsNotifications: boolean;
  missedCallAlerts: boolean;
  dailyDigest: boolean;
};

type PhoneData = {
  forwardingNumber: string;
  maxCallDuration: number;
  voicemailEnabled: boolean;
  autoAnswerDelay: number;
  transferEnabled: boolean;
  transferNumber: string;
};

type VoiceData = {
  voiceId: string;
  language: string;
  speakingRate: number;
  greetingMessage: string;
  goodbyeMessage: string;
};

type DaySchedule = { enabled: boolean; open: string; close: string };

type HoursData = {
  timezone: string;
  schedule: {
    monday: DaySchedule;
    tuesday: DaySchedule;
    wednesday: DaySchedule;
    thursday: DaySchedule;
    friday: DaySchedule;
    saturday: DaySchedule;
    sunday: DaySchedule;
  };
  afterHoursMessage: string;
};

// =============================================================================
// SETTINGS SECTIONS
// =============================================================================

const SETTINGS_SECTIONS = [
  { id: 'profile', name: 'Profile', icon: User, description: 'Your account information' },
  { id: 'phone', name: 'Phone Settings', icon: Phone, description: 'Call handling preferences' },
  { id: 'notifications', name: 'Notifications', icon: Bell, description: 'Email and SMS alerts' },
  { id: 'voice', name: 'Voice & Language', icon: Mic, description: 'AI personality settings' },
  { id: 'hours', name: 'Business Hours', icon: Clock, description: 'Operating schedule' },
];

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const DEFAULT_PROFILE: ProfileData = {
  businessName: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
};

const DEFAULT_NOTIFICATIONS: NotificationData = {
  emailNotifications: true,
  smsNotifications: false,
  missedCallAlerts: true,
  dailyDigest: true,
};

const DEFAULT_PHONE: PhoneData = {
  forwardingNumber: '',
  maxCallDuration: 300,
  voicemailEnabled: true,
  autoAnswerDelay: 2,
  transferEnabled: false,
  transferNumber: '',
};

const DEFAULT_VOICE: VoiceData = {
  voiceId: 'professional',
  language: 'en-US',
  speakingRate: 1.0,
  greetingMessage: 'Hello, thank you for calling. How can I help you today?',
  goodbyeMessage: 'Thank you for calling. Have a great day!',
};

const DEFAULT_DAY: DaySchedule = { enabled: true, open: '09:00', close: '17:00' };
const DEFAULT_WEEKEND: DaySchedule = { enabled: false, open: '10:00', close: '14:00' };

const DEFAULT_HOURS: HoursData = {
  timezone: 'America/Los_Angeles',
  schedule: {
    monday: { ...DEFAULT_DAY },
    tuesday: { ...DEFAULT_DAY },
    wednesday: { ...DEFAULT_DAY },
    thursday: { ...DEFAULT_DAY },
    friday: { ...DEFAULT_DAY },
    saturday: { ...DEFAULT_WEEKEND },
    sunday: { ...DEFAULT_WEEKEND },
  },
  afterHoursMessage: "We're currently closed. Please leave a message and we'll get back to you during business hours.",
};

// =============================================================================
// COMPONENTS
// =============================================================================

function SettingsNav({ activeSection, onSelect }: { activeSection: string; onSelect: (id: string) => void }) {
  return (
    <nav style={styles.settingsNav}>
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = activeSection === section.id;
        return (
          <button
            key={section.id}
            style={{ ...styles.navItem, ...(isActive ? styles.navItemActive : {}) }}
            onClick={() => onSelect(section.id)}
          >
            <div style={{ ...styles.navIcon, ...(isActive ? styles.navIconActive : {}) }}>
              <Icon size={18} />
            </div>
            <div style={styles.navContent}>
              <span style={styles.navName}>{section.name}</span>
              <span style={styles.navDesc}>{section.description}</span>
            </div>
            <ChevronRight size={16} style={{ color: isActive ? '#3B82F6' : '#475569' }} />
          </button>
        );
      })}
    </nav>
  );
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      style={{ ...styles.toggle, ...(enabled ? styles.toggleEnabled : {}) }}
      onClick={() => onChange(!enabled)}
    >
      <div style={{ ...styles.toggleKnob, ...(enabled ? styles.toggleKnobEnabled : {}) }} />
    </button>
  );
}

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div style={{ ...styles.toast, ...(type === 'error' ? styles.toastError : {}) }}>
      {type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
      {message}
    </div>
  );
}

function SaveButton({ onClick, loading, disabled }: { onClick: () => void; loading: boolean; disabled?: boolean }) {
  return (
    <button style={styles.saveButton} onClick={onClick} disabled={loading || disabled}>
      {loading ? (
        <>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          Saving...
        </>
      ) : (
        <>
          <Save size={16} />
          Save Changes
        </>
      )}
    </button>
  );
}

// =============================================================================
// PROFILE SECTION
// =============================================================================

function ProfileSection({ data, onSave, saving }: { data: ProfileData; onSave: (data: ProfileData) => void; saving: boolean }) {
  const [form, setForm] = useState(data);

  useEffect(() => { setForm(data); }, [data]);

  return (
    <div style={styles.sectionContent}>
      <h2 style={styles.sectionTitle}>Profile Settings</h2>
      <p style={styles.sectionDesc}>Manage your account information</p>

      <div style={styles.formGroup}>
        <label style={styles.label}>Business Name</label>
        <input
          type="text"
          value={form.businessName}
          onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          placeholder="Your Business Name"
          style={styles.input}
        />
      </div>

      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.label}>First Name</label>
          <input
            type="text"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            placeholder="John"
            style={styles.input}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Last Name</label>
          <input
            type="text"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            placeholder="Doe"
            style={styles.input}
          />
        </div>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Email Address</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="you@company.com"
          style={styles.input}
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Phone Number</label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="(555) 123-4567"
          style={styles.input}
        />
      </div>

      <SaveButton onClick={() => onSave(form)} loading={saving} />
    </div>
  );
}

// =============================================================================
// NOTIFICATIONS SECTION
// =============================================================================

function NotificationsSection({ data, onSave, saving }: { data: NotificationData; onSave: (data: NotificationData) => void; saving: boolean }) {
  const [form, setForm] = useState(data);

  useEffect(() => { setForm(data); }, [data]);

  const items = [
    { key: 'emailNotifications' as const, name: 'Email Notifications', desc: 'Receive updates via email' },
    { key: 'smsNotifications' as const, name: 'SMS Notifications', desc: 'Get text alerts for urgent matters' },
    { key: 'missedCallAlerts' as const, name: 'Missed Call Alerts', desc: 'Notify when a call is missed' },
    { key: 'dailyDigest' as const, name: 'Daily Digest', desc: 'Daily summary of all activity' },
  ];

  return (
    <div style={styles.sectionContent}>
      <h2 style={styles.sectionTitle}>Notification Preferences</h2>
      <p style={styles.sectionDesc}>Choose how you want to be notified</p>

      {items.map((item) => (
        <div key={item.key} style={styles.settingItem}>
          <div style={styles.settingInfo}>
            <h4 style={styles.settingName}>{item.name}</h4>
            <p style={styles.settingDesc}>{item.desc}</p>
          </div>
          <ToggleSwitch
            enabled={form[item.key]}
            onChange={(val) => setForm({ ...form, [item.key]: val })}
          />
        </div>
      ))}

      <SaveButton onClick={() => onSave(form)} loading={saving} />
    </div>
  );
}

// =============================================================================
// PHONE SETTINGS SECTION
// =============================================================================

function PhoneSection({ data, onSave, saving }: { data: PhoneData; onSave: (data: PhoneData) => void; saving: boolean }) {
  const [form, setForm] = useState(data);

  useEffect(() => { setForm(data); }, [data]);

  return (
    <div style={styles.sectionContent}>
      <h2 style={styles.sectionTitle}>Phone Settings</h2>
      <p style={styles.sectionDesc}>Configure how calls are handled</p>

      <div style={styles.formGroup}>
        <label style={styles.label}>Forwarding Number</label>
        <input
          type="tel"
          value={form.forwardingNumber}
          onChange={(e) => setForm({ ...form, forwardingNumber: e.target.value })}
          placeholder="(555) 123-4567"
          style={styles.input}
        />
        <span style={styles.hint}>Calls will be forwarded here when transferred</span>
      </div>

      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Max Call Duration (seconds)</label>
          <input
            type="number"
            value={form.maxCallDuration}
            onChange={(e) => setForm({ ...form, maxCallDuration: parseInt(e.target.value) || 300 })}
            min={60}
            max={1800}
            style={styles.input}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Auto-Answer Delay (rings)</label>
          <input
            type="number"
            value={form.autoAnswerDelay}
            onChange={(e) => setForm({ ...form, autoAnswerDelay: parseInt(e.target.value) || 2 })}
            min={1}
            max={10}
            style={styles.input}
          />
        </div>
      </div>

      <div style={styles.settingItem}>
        <div style={styles.settingInfo}>
          <h4 style={styles.settingName}>Voicemail</h4>
          <p style={styles.settingDesc}>Enable voicemail for missed or dropped calls</p>
        </div>
        <ToggleSwitch
          enabled={form.voicemailEnabled}
          onChange={(val) => setForm({ ...form, voicemailEnabled: val })}
        />
      </div>

      <div style={styles.settingItem}>
        <div style={styles.settingInfo}>
          <h4 style={styles.settingName}>Call Transfer</h4>
          <p style={styles.settingDesc}>Allow AI to transfer calls to your team</p>
        </div>
        <ToggleSwitch
          enabled={form.transferEnabled}
          onChange={(val) => setForm({ ...form, transferEnabled: val })}
        />
      </div>

      {form.transferEnabled && (
        <div style={styles.formGroup}>
          <label style={styles.label}>Transfer Number</label>
          <input
            type="tel"
            value={form.transferNumber}
            onChange={(e) => setForm({ ...form, transferNumber: e.target.value })}
            placeholder="(555) 123-4567"
            style={styles.input}
          />
        </div>
      )}

      <SaveButton onClick={() => onSave(form)} loading={saving} />
    </div>
  );
}

// =============================================================================
// VOICE & LANGUAGE SECTION
// =============================================================================

function VoiceSection({ data, onSave, saving }: { data: VoiceData; onSave: (data: VoiceData) => void; saving: boolean }) {
  const [form, setForm] = useState(data);

  useEffect(() => { setForm(data); }, [data]);

  const voices = [
    { id: 'professional', name: 'Professional', desc: 'Clear and business-like' },
    { id: 'friendly', name: 'Friendly', desc: 'Warm and approachable' },
    { id: 'confident', name: 'Confident', desc: 'Assertive and direct' },
  ];

  const languages = [
    { id: 'en-US', name: 'English (US)' },
    { id: 'en-GB', name: 'English (UK)' },
    { id: 'es-MX', name: 'Spanish (Mexico)' },
    { id: 'es-ES', name: 'Spanish (Spain)' },
    { id: 'fr-FR', name: 'French' },
  ];

  return (
    <div style={styles.sectionContent}>
      <h2 style={styles.sectionTitle}>Voice & Language</h2>
      <p style={styles.sectionDesc}>Customize how your AI receptionist sounds</p>

      <div style={styles.formGroup}>
        <label style={styles.label}>Voice Personality</label>
        <div style={styles.radioGroup}>
          {voices.map((voice) => (
            <label key={voice.id} style={styles.radioCard}>
              <input
                type="radio"
                name="voice"
                checked={form.voiceId === voice.id}
                onChange={() => setForm({ ...form, voiceId: voice.id })}
                style={styles.radioInput}
              />
              <div style={styles.radioContent}>
                <span style={styles.radioName}>{voice.name}</span>
                <span style={styles.radioDesc}>{voice.desc}</span>
              </div>
              {form.voiceId === voice.id && <Check size={16} style={{ color: '#3B82F6' }} />}
            </label>
          ))}
        </div>
      </div>

      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Language</label>
          <select
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value })}
            style={styles.select}
          >
            {languages.map((lang) => (
              <option key={lang.id} value={lang.id}>{lang.name}</option>
            ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Speaking Rate</label>
          <div style={styles.sliderWrapper}>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={form.speakingRate}
              onChange={(e) => setForm({ ...form, speakingRate: parseFloat(e.target.value) })}
              style={styles.slider}
            />
            <span style={styles.sliderValue}>{form.speakingRate.toFixed(1)}x</span>
          </div>
        </div>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Greeting Message</label>
        <textarea
          value={form.greetingMessage}
          onChange={(e) => setForm({ ...form, greetingMessage: e.target.value })}
          placeholder="Hello, thank you for calling..."
          style={styles.textarea}
          rows={3}
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Goodbye Message</label>
        <textarea
          value={form.goodbyeMessage}
          onChange={(e) => setForm({ ...form, goodbyeMessage: e.target.value })}
          placeholder="Thank you for calling. Have a great day!"
          style={styles.textarea}
          rows={2}
        />
      </div>

      <SaveButton onClick={() => onSave(form)} loading={saving} />
    </div>
  );
}

// =============================================================================
// BUSINESS HOURS SECTION
// =============================================================================

function HoursSection({ data, onSave, saving }: { data: HoursData; onSave: (data: HoursData) => void; saving: boolean }) {
  const [form, setForm] = useState(data);

  useEffect(() => { setForm(data); }, [data]);

  const days = [
    { key: 'monday' as const, name: 'Monday' },
    { key: 'tuesday' as const, name: 'Tuesday' },
    { key: 'wednesday' as const, name: 'Wednesday' },
    { key: 'thursday' as const, name: 'Thursday' },
    { key: 'friday' as const, name: 'Friday' },
    { key: 'saturday' as const, name: 'Saturday' },
    { key: 'sunday' as const, name: 'Sunday' },
  ];

  const timezones = [
    { id: 'America/Los_Angeles', name: 'Pacific Time (PT)' },
    { id: 'America/Denver', name: 'Mountain Time (MT)' },
    { id: 'America/Chicago', name: 'Central Time (CT)' },
    { id: 'America/New_York', name: 'Eastern Time (ET)' },
  ];

  const updateDay = (day: keyof typeof form.schedule, field: keyof DaySchedule, value: string | boolean) => {
    setForm({
      ...form,
      schedule: {
        ...form.schedule,
        [day]: { ...form.schedule[day], [field]: value },
      },
    });
  };

  return (
    <div style={styles.sectionContent}>
      <h2 style={styles.sectionTitle}>Business Hours</h2>
      <p style={styles.sectionDesc}>Set your operating schedule</p>

      <div style={styles.formGroup}>
        <label style={styles.label}>Timezone</label>
        <select
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          style={styles.select}
        >
          {timezones.map((tz) => (
            <option key={tz.id} value={tz.id}>{tz.name}</option>
          ))}
        </select>
      </div>

      <div style={styles.scheduleGrid}>
        {days.map((day) => (
          <div key={day.key} style={styles.dayRow}>
            <div style={styles.dayToggle}>
              <ToggleSwitch
                enabled={form.schedule[day.key].enabled}
                onChange={(val) => updateDay(day.key, 'enabled', val)}
              />
              <span style={{
                ...styles.dayName,
                opacity: form.schedule[day.key].enabled ? 1 : 0.5,
              }}>
                {day.name}
              </span>
            </div>
            {form.schedule[day.key].enabled && (
              <div style={styles.dayTimes}>
                <input
                  type="time"
                  value={form.schedule[day.key].open}
                  onChange={(e) => updateDay(day.key, 'open', e.target.value)}
                  style={styles.timeInput}
                />
                <span style={styles.timeSep}>to</span>
                <input
                  type="time"
                  value={form.schedule[day.key].close}
                  onChange={(e) => updateDay(day.key, 'close', e.target.value)}
                  style={styles.timeInput}
                />
              </div>
            )}
            {!form.schedule[day.key].enabled && (
              <span style={styles.closedLabel}>Closed</span>
            )}
          </div>
        ))}
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>After-Hours Message</label>
        <textarea
          value={form.afterHoursMessage}
          onChange={(e) => setForm({ ...form, afterHoursMessage: e.target.value })}
          placeholder="We're currently closed. Please leave a message..."
          style={styles.textarea}
          rows={3}
        />
      </div>

      <SaveButton onClick={() => onSave(form)} loading={saving} />
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile');
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Save settings handler
  const handleSave = async (section: string, data: any) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, data }),
      });

      if (res.ok) {
        const result = await res.json();
        setSettings((prev) => prev ? { ...prev, [section]: result.data } : prev);
        showToast('Settings saved successfully', 'success');
      } else {
        showToast('Failed to save settings', 'error');
      }
    } catch (error) {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Render the active section
  const renderSection = () => {
    if (loading) {
      return (
        <div style={styles.loadingState}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#3B82F6' }} />
          <p>Loading settings...</p>
        </div>
      );
    }

    const profile = settings?.profile || DEFAULT_PROFILE;
    const notifications = settings?.notifications || DEFAULT_NOTIFICATIONS;
    const phone = settings?.phone || DEFAULT_PHONE;
    const voice = settings?.voice || DEFAULT_VOICE;
    const hours = settings?.hours || DEFAULT_HOURS;

    switch (activeSection) {
      case 'profile':
        return <ProfileSection data={profile} onSave={(data) => handleSave('profile', data)} saving={saving} />;
      case 'notifications':
        return <NotificationsSection data={notifications} onSave={(data) => handleSave('notifications', data)} saving={saving} />;
      case 'phone':
        return <PhoneSection data={phone} onSave={(data) => handleSave('phone', data)} saving={saving} />;
      case 'voice':
        return <VoiceSection data={voice} onSave={(data) => handleSave('voice', data)} saving={saving} />;
      case 'hours':
        return <HoursSection data={hours} onSave={(data) => handleSave('hours', data)} saving={saving} />;
      default:
        return null;
    }
  };

  return (
    <div style={styles.page}>
      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Settings</h1>
        <p style={styles.subtitle}>Manage your account and preferences</p>
      </div>

      {/* Settings Layout */}
      <div style={styles.settingsLayout}>
        <SettingsNav activeSection={activeSection} onSelect={setActiveSection} />
        <div style={styles.settingsMain}>
          {renderSection()}
        </div>
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
    position: 'relative',
  },
  header: {
    marginBottom: '32px',
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
  settingsLayout: {
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    gap: '24px',
  },
  settingsNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 16px',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '12px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s ease',
  },
  navItemActive: {
    background: 'rgba(59, 130, 246, 0.08)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
  },
  navIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#64748B',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  navIconActive: {
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#3B82F6',
  },
  navContent: {
    flex: 1,
  },
  navName: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#F8FAFC',
  },
  navDesc: {
    display: 'block',
    fontSize: '12px',
    color: '#64748B',
    marginTop: '2px',
  },
  settingsMain: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '20px',
    padding: '32px',
    minHeight: '500px',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '300px',
    gap: '16px',
    color: '#94A3B8',
  },
  sectionContent: {},
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#F8FAFC',
    margin: '0 0 4px',
  },
  sectionDesc: {
    fontSize: '14px',
    color: '#64748B',
    margin: '0 0 28px',
  },
  formGroup: {
    marginBottom: '20px',
    flex: 1,
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: '#94A3B8',
    marginBottom: '8px',
  },
  hint: {
    display: 'block',
    fontSize: '12px',
    color: '#64748B',
    marginTop: '6px',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '14px',
    color: '#F8FAFC',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '14px',
    color: '#F8FAFC',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    outline: 'none',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '14px',
    color: '#F8FAFC',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    outline: 'none',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  saveButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    marginTop: '8px',
  },
  settingItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  settingInfo: {
    flex: 1,
  },
  settingName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#F8FAFC',
    margin: '0 0 4px',
  },
  settingDesc: {
    fontSize: '13px',
    color: '#64748B',
    margin: 0,
  },
  toggle: {
    width: '48px',
    height: '26px',
    borderRadius: '13px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.2s ease',
  },
  toggleEnabled: {
    background: '#3B82F6',
  },
  toggleKnob: {
    position: 'absolute',
    top: '3px',
    left: '3px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.2s ease',
  },
  toggleKnobEnabled: {
    left: '25px',
  },
  toast: {
    position: 'fixed',
    top: '100px',
    right: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 20px',
    background: 'rgba(34, 197, 94, 0.15)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '12px',
    color: '#22c55e',
    fontSize: '14px',
    fontWeight: 500,
    zIndex: 1000,
    animation: 'slideIn 0.3s ease',
  },
  toastError: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  radioCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    cursor: 'pointer',
  },
  radioInput: {
    display: 'none',
  },
  radioContent: {
    flex: 1,
  },
  radioName: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#F8FAFC',
  },
  radioDesc: {
    display: 'block',
    fontSize: '12px',
    color: '#64748B',
    marginTop: '2px',
  },
  sliderWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  slider: {
    flex: 1,
    height: '6px',
    borderRadius: '3px',
    background: 'rgba(255, 255, 255, 0.1)',
    appearance: 'none',
    cursor: 'pointer',
  },
  sliderValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#3B82F6',
    minWidth: '40px',
  },
  scheduleGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '24px',
  },
  dayRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '10px',
  },
  dayToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '150px',
  },
  dayName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#F8FAFC',
  },
  dayTimes: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  timeInput: {
    padding: '8px 12px',
    fontSize: '14px',
    color: '#F8FAFC',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    outline: 'none',
  },
  timeSep: {
    fontSize: '13px',
    color: '#64748B',
  },
  closedLabel: {
    fontSize: '14px',
    color: '#64748B',
    fontStyle: 'italic',
  },
};
