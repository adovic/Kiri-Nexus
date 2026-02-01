export const dynamic = "force-dynamic";

import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import PageHeader from "../components/PageHeader";

export default function SupportPage() {
  return (
    <div className="form-grid">
      <PageHeader
        title="Support"
        description="Find answers to common questions or reach the team directly. We respond within one business day."
        actions={<Button>Contact support</Button>}
      />

      <Card title="Help resources">
        <ul className="feature-list">
          <li>Getting started guide</li>
          <li>Routing & escalation tips</li>
          <li>CRM integration setup</li>
        </ul>
        <Button variant="ghost">View docs (coming soon)</Button>
      </Card>
      <Card title="Contact support">
        <p className="muted">Email us at support@example.com</p>
        <Button variant="primary">Email support</Button>
      </Card>
    </div>
  );
}
