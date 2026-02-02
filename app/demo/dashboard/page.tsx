import Link from 'next/link';

export default function DemoDashboardPage() {
  return (
    <main style={{ padding: '120px 20px 56px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Demo Summary</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Continue into the app dashboard to review calls, leads, and settings.
      </p>

      <div className="grid-3">
        <div className="card">
          <h3>Calls</h3>
          <p className="muted">Review call activity and transcript history.</p>
          <Link href="/dashboard/calls" className="btn btn-subtle">
            Open Calls
          </Link>
        </div>
        <div className="card">
          <h3>Leads</h3>
          <p className="muted">Track captured leads and outcomes.</p>
          <Link href="/dashboard/leads" className="btn btn-subtle">
            Open Leads
          </Link>
        </div>
        <div className="card">
          <h3>Billing</h3>
          <p className="muted">Compare plans or manage your subscription.</p>
          <Link href="/pricing/plans" className="btn btn-subtle">
            View Pricing
          </Link>
        </div>
      </div>
    </main>
  );
}
