import Link from 'next/link';

export default function GovernmentLandingPage() {
  return (
    <main style={{ padding: '120px 20px 56px', maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Government Edition</h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>
        Sovereignty-first call automation for agencies that require auditability, controlled access, and transparent operations.
      </p>

      <div className="grid-3">
        <div className="card">
          <h3>Chain-of-Custody Logging</h3>
          <p className="muted">Verifiable receipt chain for every critical operation.</p>
        </div>
        <div className="card">
          <h3>Role-Aware Controls</h3>
          <p className="muted">Operator, supervisor, and admin boundaries by design.</p>
        </div>
        <div className="card">
          <h3>Sovereign Exit Tools</h3>
          <p className="muted">Export and delete flows designed for compliance-heavy environments.</p>
        </div>
      </div>

      <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/government/login" className="btn btn-primary">
          Government Login
        </Link>
        <Link href="/government/demo/call" className="btn btn-ghost">
          Open Government Demo
        </Link>
      </div>
    </main>
  );
}
