import Link from 'next/link';

const STEPS = [
  {
    title: 'Connect Your Number',
    text: 'Point your business number to Kiri Nexus in minutes.',
  },
  {
    title: 'Configure Call Logic',
    text: 'Define greeting, intake questions, and escalation thresholds.',
  },
  {
    title: 'Go Live',
    text: 'Calls are answered, logged, and routed with full visibility.',
  },
];

export default function HowItWorksPage() {
  return (
    <main style={{ padding: '120px 20px 56px', maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>How It Works</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Three steps from setup to production.
      </p>

      <div className="steps">
        {STEPS.map((step, index) => (
          <article className="step" key={step.title}>
            <div className="pill">{index + 1}</div>
            <h3 style={{ marginTop: 0 }}>{step.title}</h3>
            <p className="muted">{step.text}</p>
          </article>
        ))}
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/onboarding" className="btn btn-primary">
          Start Setup
        </Link>
        <Link href="/faq" className="btn btn-ghost">
          Read FAQ
        </Link>
      </div>
    </main>
  );
}
