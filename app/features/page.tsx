import Link from 'next/link';

export default function FeaturesPage() {
  return (
    <main style={{ padding: '120px 20px 56px', maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Features</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Built for real-world front-desk operations.
      </p>

      <div className="grid-3">
        <div className="card">
          <h3>Intelligent Call Routing</h3>
          <p className="muted">Route high-priority calls to humans automatically.</p>
        </div>
        <div className="card">
          <h3>Live Transcripts</h3>
          <p className="muted">Searchable, timestamped transcripts for every conversation.</p>
        </div>
        <div className="card">
          <h3>Role-Based Access</h3>
          <p className="muted">Separate views for operators, managers, and administrators.</p>
        </div>
      </div>

      <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/demo/setup" className="btn btn-primary">
          Start Demo
        </Link>
        <Link href="/pricing/plans" className="btn btn-ghost">
          See Plans
        </Link>
      </div>
    </main>
  );
}
