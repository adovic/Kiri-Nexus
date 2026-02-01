export const dynamic = "force-dynamic";

import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import PageHeader from "../components/PageHeader";

export default function SettingsPage() {
  return (
    <div className="form-grid">
      <PageHeader
        title="Settings"
        description="Update your profile, time zone, and notification preferences. These settings apply to your account only."
        actions={<Button>Save settings</Button>}
      />

      <Card title="Profile" actions={<Button variant="ghost">Save</Button>}>
        <div className="form-grid">
          <label>
            Name
            <input type="text" placeholder="Your name" />
          </label>
          <label>
            Timezone
            <select>
              <option>UTC</option>
              <option>EST</option>
              <option>PST</option>
            </select>
          </label>
        </div>
      </Card>
      <Card title="Notifications" actions={<Button variant="ghost">Save</Button>}>
        <label>
          <input type="checkbox" /> Email me call summaries
        </label>
        <label>
          <input type="checkbox" /> SMS for urgent calls
        </label>
      </Card>
    </div>
  );
}
