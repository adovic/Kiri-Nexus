'use client';

export const dynamic = "force-dynamic";

import { useState } from "react";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import PageHeader from "../components/PageHeader";

export default function KnowledgePage() {
  const [about, setAbout] = useState("");
  const [services, setServices] = useState("");
  const [policies, setPolicies] = useState("");

  return (
    <div className="form-grid">
      <PageHeader
        title="Knowledge"
        description="Share the facts the receptionist needs to respond accurately: services, pricing, and policies."
        actions={<Button>Save updates</Button>}
      />

      <Card title="About the business" actions={<Button variant="ghost">Save</Button>}>
        <textarea value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Who you are, what you do" />
      </Card>
      <Card title="Services" actions={<Button variant="ghost">Save</Button>}>
        <textarea value={services} onChange={(e) => setServices(e.target.value)} placeholder="Services, pricing notes" />
      </Card>
      <Card title="Policies" actions={<Button variant="ghost">Save</Button>}>
        <textarea
          value={policies}
          onChange={(e) => setPolicies(e.target.value)}
          placeholder="Cancellation, eligibility, etc."
        />
      </Card>
      <Card title="Uploads">
        <p className="muted">File uploads coming soon. Drop PDFs, DOCs, or knowledge base links.</p>
        <Button variant="ghost">Upload placeholder</Button>
      </Card>
    </div>
  );
}
