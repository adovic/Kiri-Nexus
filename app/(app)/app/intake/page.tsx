'use client';

export const dynamic = "force-dynamic";

import { useState } from "react";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import PageHeader from "../components/PageHeader";

type Question = { id: string; label: string; required: boolean; type: "text" | "enum" };

export default function IntakePage() {
  const [questions, setQuestions] = useState<Question[]>([
    { id: "name", label: "Caller name", required: true, type: "text" },
    { id: "intent", label: "Reason for calling", required: true, type: "text" },
    { id: "urgency", label: "Urgency (low/medium/high)", required: true, type: "enum" },
    { id: "callback", label: "Best callback number", required: false, type: "text" },
  ]);

  return (
    <div className="form-grid">
      <PageHeader
        title="Intake"
        description="Control which questions the AI receptionist captures before handing the conversation to your team."
        actions={
          <>
            <Button variant="ghost">Preview form</Button>
            <Button>Save intake</Button>
          </>
        }
      />

      <Card title="Intake questions" actions={<Button variant="ghost">Add question</Button>}>
        <div className="form-grid">
          {questions.map((q) => (
            <div key={q.id} className="card" style={{ padding: 12 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <strong>{q.label}</strong>
                <span className="muted">({q.type})</span>
                {q.required && (
                  <span className="pill" style={{ width: 80, height: 26 }}>
                    Required
                  </span>
                )}
              </div>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Captured on every qualified call.
              </p>
            </div>
          ))}
        </div>
        <Button variant="ghost" style={{ marginTop: 12 }}>
          Add question
        </Button>
      </Card>

      <Card title="Hand-off template">
        <p className="muted">Customize how call notes flow to your CRM or inbox. This section is coming soon.</p>
        <Button variant="ghost">Add placeholder</Button>
      </Card>
    </div>
  );
}
