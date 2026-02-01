export const dynamic = "force-dynamic";

import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import PageHeader from "../components/PageHeader";

export default function ReferralsPage() {
  return (
    <div className="form-grid">
      <PageHeader
        title="Referrals"
        description="Share your referral link to earn credits when teams launch their own AI receptionist."
        actions={<Button>Copy referral link</Button>}
      />

      <Card title="Your referral link">
        <p className="muted">Share this link and earn credits when teams sign up.</p>
        <div className="card" style={{ padding: 10, marginTop: 8 }}>
          <code>https://ai-receptionist.app/ref/{`{your-code}`}</code>
        </div>
        <Button variant="ghost" style={{ marginTop: 8 }}>
          Copy link
        </Button>
      </Card>
      <Card title="Stats">
        <ul className="feature-list">
          <li>Clicks: 0</li>
          <li>Signups: 0</li>
          <li>Credits earned: $0</li>
        </ul>
      </Card>
    </div>
  );
}
