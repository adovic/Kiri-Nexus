'use client';

export const dynamic = "force-dynamic";

import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import PageHeader from "../components/PageHeader";
import { useRole } from "@/lib/hooks/useRole";

const members = [
  { name: "You", role: "owner" },
  { name: "Teammate", role: "member" },
];

export default function TeamPage() {
  const { role, isAdmin } = useRole();

  return (
    <div className="form-grid">
      <PageHeader
        title="Team"
        description="Invite collaborators and assign roles. Owners and admins manage billing, routing, and user permissions."
        actions={<Button disabled={!isAdmin}>Invite teammate</Button>}
      />

      <Card title="Members">
        <table className="app-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.name}>
                <td>{m.name}</td>
                <td>{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 12 }}>
          {isAdmin ? "Invites send from your email with a workspace link." : "Only owners/admins can invite teammates."}
        </p>
        <Button variant="ghost" style={{ marginTop: 12 }} disabled={!isAdmin}>
          Invite member (placeholder)
        </Button>
      </Card>

      <Card title="Access controls">
        <p className="muted">
          Role-based permissions are coming soon. Your current role is <strong>{role}</strong>. Actions restricted to owners
          and admins will be disabled automatically.
        </p>
      </Card>
    </div>
  );
}
