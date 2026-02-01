'use client';

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import PageHeader from "../components/PageHeader";

type Question = { id: string; label: string; required: boolean };
type Escalation = { enabled: boolean; phoneNumber: string; urgencyThreshold: number };
type ReceptionistConfig = {
  businessName: string;
  businessHours: string;
  greeting: string;
  questions: Question[];
  escalation: Escalation;
  updatedAt?: number | null;
};

const emptyConfig: ReceptionistConfig = {
  businessName: "",
  businessHours: "",
  greeting: "",
  questions: [],
  escalation: { enabled: false, phoneNumber: "", urgencyThreshold: 0 },
  updatedAt: null,
};

export default function ReceptionistPage() {
  const [form, setForm] = useState<ReceptionistConfig>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const mounted = useRef(true);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await apiFetch("/api/receptionist/config");
      if (!res.ok) throw new Error("Failed to fetch config");
      const data = (await res.json()) as Partial<ReceptionistConfig>;
      if (!mounted.current) return;
      setForm({
        ...emptyConfig,
        ...data,
        questions: data.questions ?? [],
        escalation: { ...emptyConfig.escalation, ...(data.escalation ?? {}) },
      });
    } catch (err) {
      console.error(err);
      if (mounted.current) setStatus("Could not load receptionist settings");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    return () => {
      mounted.current = false;
    };
  }, [loadConfig]);

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        businessName: form.businessName,
        businessHours: form.businessHours,
        greeting: form.greeting,
        questions: form.questions,
        escalation: form.escalation,
      };
      const res = await apiFetch("/api/receptionist/config", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      const saved = (await res.json()) as ReceptionistConfig;
      setForm({
        ...emptyConfig,
        ...saved,
        questions: saved.questions ?? [],
        escalation: { ...emptyConfig.escalation, ...(saved.escalation ?? {}) },
      });
      setStatus("Saved");
    } catch (err) {
      console.error(err);
      setStatus("Unable to save right now");
    } finally {
      setSaving(false);
    }
  }

  function updateQuestion(idx: number, field: keyof Question, value: string | boolean) {
    setForm((prev) => {
      const nextQuestions = [...prev.questions];
      nextQuestions[idx] = { ...nextQuestions[idx], [field]: value } as Question;
      return { ...prev, questions: nextQuestions };
    });
  }

  function addQuestion() {
    setForm((prev) => ({
      ...prev,
      questions: [...prev.questions, { id: `custom-${Date.now()}`, label: "New question", required: false }],
    }));
  }

  return (
    <div className="form-grid">
      <PageHeader
        title="Receptionist"
        description="Tune the AI receptionist persona, greeting, and escalation rules. Changes save to your tenant configuration."
        actions={
          <>
            <Button variant="ghost" onClick={loadConfig}>
              Refresh
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      />

      {status ? <p className="muted">{status}</p> : null}

      <Card title="Business profile" actions={<Button variant="ghost" onClick={handleSave}>Save</Button>}>
        <label>
          Business name
          <input
            value={form.businessName}
            onChange={(e) => setForm((prev) => ({ ...prev, businessName: e.target.value }))}
            placeholder="Acme Clinic"
            disabled={loading}
          />
        </label>
        <label>
          Business hours
          <input
            value={form.businessHours}
            onChange={(e) => setForm((prev) => ({ ...prev, businessHours: e.target.value }))}
            placeholder="Mon–Fri 8a–6p local"
            disabled={loading}
          />
        </label>
        <label>
          Greeting
          <textarea
            value={form.greeting}
            onChange={(e) => setForm((prev) => ({ ...prev, greeting: e.target.value }))}
            placeholder="Hi! Thanks for calling. How can I help today?"
            disabled={loading}
          />
        </label>
      </Card>

      <Card
        title="Intake questions"
        actions={
          <Button variant="ghost" onClick={addQuestion} disabled={loading}>
            Add question
          </Button>
        }
      >
        <div className="form-grid">
          {form.questions.length === 0 ? (
            <p className="muted">No questions yet. Add the fields you want captured on every call.</p>
          ) : (
            form.questions.map((q, idx) => (
              <div key={q.id} className="card" style={{ padding: 12 }}>
                <label>
                  Prompt
                  <input
                    value={q.label}
                    onChange={(e) => updateQuestion(idx, "label", e.target.value)}
                    disabled={loading}
                  />
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(idx, "required", e.target.checked)}
                    disabled={loading}
                    style={{ width: "auto" }}
                  />
                  Required
                </label>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card title="Escalation rules" actions={<Button variant="ghost" onClick={handleSave}>Save</Button>}>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.escalation.enabled}
            onChange={(e) => setForm((prev) => ({ ...prev, escalation: { ...prev.escalation, enabled: e.target.checked } }))}
            disabled={loading}
            style={{ width: "auto" }}
          />
          Enable live transfer on urgent calls
        </label>
        <label>
          Transfer number
          <input
            value={form.escalation.phoneNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, escalation: { ...prev.escalation, phoneNumber: e.target.value } }))}
            placeholder="+1 (555) 555-1212"
            disabled={loading}
          />
        </label>
        <label>
          Urgency threshold (0-10)
          <input
            type="number"
            min={0}
            max={10}
            value={form.escalation.urgencyThreshold}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                escalation: { ...prev.escalation, urgencyThreshold: Number(e.target.value) },
              }))
            }
            disabled={loading}
          />
        </label>
        <p className="muted" style={{ margin: 0 }}>
          The receptionist will escalate calls that exceed the urgency score and transfer to the number above.
        </p>
      </Card>
    </div>
  );
}
