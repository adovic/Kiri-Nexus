export const dynamic = "force-dynamic";

import Link from "next/link";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import PageHeader from "../components/PageHeader";

const conversations = [
  { id: "abc123", caller: "Sarah M", intent: "Book service", status: "qualified" },
  { id: "def456", caller: "John D", intent: "Billing question", status: "escalated" },
  { id: "ghi789", caller: "Maria L", intent: "Follow-up", status: "callback" },
];

export default function ConversationsPage() {
  return (
    <div className="form-grid">
      <PageHeader
        title="Conversations"
        description="Review recent calls handled by the AI receptionist. Escalated or qualified calls bubble to the top."
        actions={
          <>
            <Button variant="ghost">Export CSV</Button>
            <Button asChild>
              <Link href="/app/receptionist">Adjust routing</Link>
            </Button>
          </>
        }
      />

      <Card title="Recent conversations">
        <table className="app-table">
          <thead>
            <tr>
              <th>Caller</th>
              <th>Intent</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr key={c.id}>
                <td>{c.caller}</td>
                <td>{c.intent}</td>
                <td>
                  <span className="pill" style={{ width: "auto", padding: "0 10px", height: 26 }}>
                    {c.status}
                  </span>
                </td>
                <td>
                  <Link href={`/app/conversations/${c.id}`} className="btn btn-ghost sm">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 12 }}>
          Call transcripts and voice playback are coming soon. Use the export to share summaries with your team.
        </p>
      </Card>
    </div>
  );
}
