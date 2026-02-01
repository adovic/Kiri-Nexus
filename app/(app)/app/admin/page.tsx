'use client';

export const dynamic = "force-dynamic";

import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import PageHeader from "../components/PageHeader";
import { useRole } from "@/lib/hooks/useRole";

export default function AdminPage() {
  const { isAdmin, role } = useRole();

  if (!isAdmin) {
    return (
      <div className="form-grid">
        <PageHeader title="Admin" description="Only owners and admins can access these controls." />
        <Card title="Not authorized">
          <p className="muted">You are signed in as a {role}. Ask an owner to grant admin access to view this page.</p>
          <Button variant="ghost" disabled>
            Request access (coming soon)
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="form-grid">
      <PageHeader
        title="Admin (debug)"
        description="Internal tools for tenant bootstrap, feature toggles, and configuration inspection."
        actions={<Button variant="ghost">Run bootstrap</Button>}
      />
      <Card title="Debug panels">
        <p className="muted">
          This page is for internal debug. Add toggles or raw data views here. Hide the link for non-admin users.
        </p>
        <ul className="feature-list">
          <li>Tenant bootstrap</li>
          <li>Feature flag overrides</li>
          <li>Raw config preview</li>
        </ul>
      </Card>
    </div>
  );
}
