'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Shield,
  Sparkles,
  CheckCircle,
  BookOpen,
  Zap,
  Home,
} from 'lucide-react';
import SOPLibrary from '@/components/government/dashboard/SOPLibrary';

// =============================================================================
// BLUEPRINT LIBRARY PAGE
// =============================================================================
// Dedicated full-screen page for Agency Blueprints & SOPs.
// Provides pre-configured setup templates for small government departments.
//
// Theme: Gold (#F59E0B) for all "Pilot/Small Department" blueprints.
// =============================================================================

export default function BlueprintsPage() {
  const [appliedBlueprints, setAppliedBlueprints] = useState<string[]>([]);

  const handleBlueprintApplied = useCallback((blueprintId: string) => {
    setAppliedBlueprints((prev) => [...prev, blueprintId]);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 50% 0%, #1e3a8a 0%, #0f172a 50%, #020617 100%)',
      }}
    >
      {/* Top Navigation Bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Left: Back Navigation */}
          <Link
            href="/government/dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '10px',
              color: '#60A5FA',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>

          {/* Center: Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F59E0B',
              }}
            >
              <BookOpen size={20} />
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#F8FAFC',
                }}
              >
                Blueprint Library
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                Pre-configured agency SOPs & configurations
              </p>
            </div>
          </div>

          {/* Right: Status Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              borderRadius: '10px',
            }}
          >
            <Shield size={14} color="#22C55E" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#22C55E' }}>
              FOIA/HIPAA Compliant
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '40px 24px 80px',
        }}
      >
        {/* Page Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '32px',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '100px',
                marginBottom: '16px',
              }}
            >
              <Zap size={14} color="#F59E0B" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#F59E0B' }}>
                SMALL DEPARTMENT OPTIMIZED
              </span>
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: '28px',
                fontWeight: 800,
                color: '#F8FAFC',
                letterSpacing: '-0.02em',
              }}
            >
              Agency Blueprints & Standard Operating Procedures
            </h2>
            <p
              style={{
                margin: '12px 0 0',
                fontSize: '15px',
                color: '#94A3B8',
                maxWidth: '640px',
                lineHeight: 1.6,
              }}
            >
              Select a pre-built configuration template to instantly set up your AI assistant
              for common municipal workflows. Each blueprint includes legal compliance guardrails
              and a Dry Run preview.
            </p>
          </div>

          {/* Applied Count Badge */}
          {appliedBlueprints.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px 20px',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: '12px',
              }}
            >
              <CheckCircle size={24} color="#22C55E" />
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#22C55E' }}>
                  {appliedBlueprints.length}
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  Blueprint{appliedBlueprints.length > 1 ? 's' : ''} Applied
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '16px',
            padding: '20px 24px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: '16px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={24} color="#F59E0B" />
          </div>
          <div>
            <h3
              style={{
                margin: '0 0 8px',
                fontSize: '15px',
                fontWeight: 700,
                color: '#F59E0B',
              }}
            >
              How It Works
            </h3>
            <ol
              style={{
                margin: 0,
                padding: '0 0 0 20px',
                fontSize: '13px',
                color: '#CBD5E1',
                lineHeight: 1.8,
              }}
            >
              <li>
                <strong>Select a Blueprint</strong> — Choose from pre-configured templates
                designed for specific municipal departments.
              </li>
              <li>
                <strong>Review Setup Steps</strong> — Each step shows the configuration changes
                and the legal compliance protection it enables.
              </li>
              <li>
                <strong>Run Dry Test</strong> — Preview exactly how the AI will respond to
                citizen inquiries before committing changes.
              </li>
              <li>
                <strong>Apply Configuration</strong> — Once satisfied, apply the blueprint
                to activate the settings.
              </li>
            </ol>
          </div>
        </div>

        {/* SOP Library Component */}
        <SOPLibrary onConfigurationApplied={handleBlueprintApplied} />

        {/* Footer Navigation */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '40px',
            padding: '20px 24px',
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(59, 130, 246, 0.15)',
            borderRadius: '16px',
          }}
        >
          <div style={{ fontSize: '13px', color: '#64748B' }}>
            All blueprints include automatic FOIA/HIPAA compliance checks and audit logging.
          </div>
          <Link
            href="/government/dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '10px',
              color: '#60A5FA',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Home size={16} />
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
