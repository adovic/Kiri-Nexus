export const dynamic = "force-dynamic";

import Link from "next/link";
import Card from "../../../../components/ui/Card";
import Button from "../../../../components/ui/Button";
import PageHeader from "../../components/PageHeader";

type Params = { params: { id: string } };

export default function ConversationDetail({ params }: Params) {
  return (
    <div className="form-grid">
      <PageHeader
        title={`Conversation ${params.id}`}
        description="Review the call summary, key intents, and escalation notes captured by the AI receptionist."
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href="/app/conversations">Back to list</Link>
            </Button>
            <Button>Mark resolved</Button>
          </>
        }
      />

      <Card title="Overview" actions={<Button variant="ghost">Download transcript (soon)</Button>}>
        <p className="muted">Caller: Jane Doe • Intent: Book appointment • Status: Qualified</p>
        <div className="feature-list">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              Callback
            </p>
            <strong>(555) 123-9000</strong>
          </div>
          <div>
            <p className="muted" style={{ margin: 0 }}>
              Outcome
            </p>
            <span>Booked follow-up demo for Tuesday at 2:00 PM</span>
          </div>
        </div>
      </Card>

      <Card title="Summary">
        <p>
          Caller asked about availability next week. Provided pricing overview and booked a follow-up with sales. Marked as
          qualified and captured the callback number and preferred time.
        </p>
      </Card>

      <Card title="Events">
        <ul className="feature-list">
          <li>00:00 — Greeting</li>
          <li>00:20 — Captured name and callback</li>
          <li>01:30 — Provided pricing</li>
          <li>02:10 — Scheduled follow-up</li>
        </ul>
      </Card>
    </div>
  );
}
