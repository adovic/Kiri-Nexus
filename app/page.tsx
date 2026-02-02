import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ paddingTop: 110 }}>
      <section className="hero">
        <div className="hero-inner">
          <h1>Never Miss a Call Again</h1>
          <p className="tagline">
            Kiri Nexus answers, qualifies, and routes calls instantly so your team can focus on real work.
          </p>
          <div className="cta-row">
            <Link href="/demo/setup" className="btn btn-primary">
              Try Live Demo
            </Link>
            <Link href="/pricing/plans" className="btn btn-ghost">
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="features">
        <article className="feature">
          <h3>24/7 Coverage</h3>
          <p>Answer every call, after-hours and weekends included.</p>
        </article>
        <article className="feature">
          <h3>Smart Qualification</h3>
          <p>Capture intent, urgency, and callback details automatically.</p>
        </article>
        <article className="feature">
          <h3>Fast Escalation</h3>
          <p>Urgent calls route to the right person without delay.</p>
        </article>
      </section>
    </main>
  );
}
