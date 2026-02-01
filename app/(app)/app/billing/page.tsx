export const dynamic = "force-dynamic";

import Link from "next/link";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import PageHeader from "../components/PageHeader";

export default function BillingPage() {
  return (
    <div className="form-grid">
      <PageHeader
        title="Billing"
        description="Manage your subscription, invoices, and usage. Billing updates require owner or admin access."
        actions={<Button>Update payment method</Button>}
      />

      <Card title="Current plan">
        <p className="muted">Plan: Pro • $249/mo</p>
        <Button asChild>
          <Link href="/dashboard/billing">Manage subscription</Link>
        </Button>
      </Card>
      <Card title="Invoices">
        <p className="muted">Invoices and payment history will appear here.</p>
      </Card>
    </div>
  );
}
