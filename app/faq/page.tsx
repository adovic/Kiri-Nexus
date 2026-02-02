import Link from 'next/link';

const FAQS = [
  {
    q: 'Can I keep my existing phone number?',
    a: 'Yes. You can forward your current number to Kiri Nexus without replacing your carrier.',
  },
  {
    q: 'What happens after-hours?',
    a: 'Your assistant continues answering calls 24/7 and can escalate emergencies based on your rules.',
  },
  {
    q: 'Can I review every call?',
    a: 'Yes. Calls include transcripts, disposition status, and searchable history.',
  },
  {
    q: 'Is this suitable for government agencies?',
    a: 'Yes. The government stack includes sovereignty and chain-of-custody workflows.',
  },
];

export default function FaqPage() {
  return (
    <main style={{ padding: '120px 20px 56px', maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Frequently Asked Questions</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Quick answers for common rollout questions.
      </p>

      <div className="faq-list">
        {FAQS.map((item) => (
          <article className="faq-item" key={item.q}>
            <h3 style={{ marginTop: 0 }}>{item.q}</h3>
            <p className="muted" style={{ marginBottom: 0 }}>
              {item.a}
            </p>
          </article>
        ))}
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/pricing/plans" className="btn btn-primary">
          Compare Plans
        </Link>
        <Link href="/demo/setup" className="btn btn-ghost">
          Try Demo
        </Link>
      </div>
    </main>
  );
}
