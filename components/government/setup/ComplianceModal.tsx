'use client';

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { styles } from '@/components/government/setup/SetupStyles';
import type {
  ComplianceValidationResult,
  ContentValidationResult,
} from '@/lib/government/compliance-baseline';

// ── Props ──

export interface ComplianceModalProps {
  showComplianceModal: boolean;
  complianceResult: ComplianceValidationResult | null;
  contentResult: ContentValidationResult | null;
  setShowComplianceModal: (v: boolean) => void;
}

export default function ComplianceModal({
  showComplianceModal,
  complianceResult,
  contentResult,
  setShowComplianceModal,
}: ComplianceModalProps) {
  return (
    <>
              <div style={styles.modalOverlay} onClick={() => setShowComplianceModal(false)}>
                <div style={{
                  ...styles.modalContent,
                  maxWidth: '660px',
                  border: '2px solid #FCA5A5',
                }} onClick={(e) => e.stopPropagation()}>
                  <div style={{
                    ...styles.modalHeader,
                    background: 'linear-gradient(135deg, #FEF2F2 0%, #FFF1F2 100%)',
                    borderBottom: '1px solid #FECACA',
                  }}>
                    <div style={styles.modalHeaderLeft}>
                      <AlertTriangle size={20} color="#DC2626" />
                      <h3 style={{ ...styles.modalTitle, color: '#991B1B' }}>
                        {contentResult && !contentResult.passed
                          ? 'Invalid Compliance Data — M-26-04'
                          : 'Compliance Error — M-26-04'
                        }
                      </h3>
                    </div>
                    <button onClick={() => setShowComplianceModal(false)} style={styles.modalCloseBtn}>
                      <X size={20} />
                    </button>
                  </div>

                  <div style={{ padding: '24px', lineHeight: '1.6' }}>
                    {/* ── Stage 1 Errors: Missing Headers ── */}
                    {complianceResult && !complianceResult.passed && (
                      <>
                        <div style={{
                          background: '#FEF2F2',
                          border: '1px solid #FECACA',
                          borderRadius: '8px',
                          padding: '14px 16px',
                          fontSize: '13px',
                          color: '#991B1B',
                          fontWeight: 600,
                          marginBottom: '20px',
                        }}>
                          Your policy baseline is missing Federal M-26-04 requirements.
                          AI Agent activation suspended until corrected.
                        </div>

                        <div style={{
                          fontSize: '13px',
                          color: '#64748B',
                          marginBottom: '16px',
                        }}>
                          The uploaded CSV is missing <strong style={{ color: '#DC2626' }}>
                            {complianceResult.missing_fields.length}
                          </strong> of {complianceResult.total_required} mandatory policy columns
                          required by OMB Memorandum M-26-04 for government AI deployments.
                        </div>

                        {/* Missing Fields Table */}
                        <div style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          marginBottom: '20px',
                        }}>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '0',
                            padding: '10px 14px',
                            background: '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#94A3B8',
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.04em',
                          }}>
                            <span>Missing Field</span>
                            <span>M-26-04 Section</span>
                          </div>
                          {complianceResult.missing_fields.map((f) => (
                            <div key={f.field_id} style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '0',
                              padding: '10px 14px',
                              borderBottom: '1px solid #F1F5F9',
                              fontSize: '13px',
                              alignItems: 'center',
                            }}>
                              <span style={{
                                color: '#DC2626',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}>
                                <X size={12} color="#DC2626" />
                                {f.display_name}
                              </span>
                              <span style={{
                                color: '#64748B',
                                fontSize: '12px',
                                fontFamily: 'monospace',
                              }}>
                                {f.m26_section}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* ── Stage 2 Errors: Invalid / Placeholder Content ── */}
                    {contentResult && !contentResult.passed && (
                      <>
                        <div style={{
                          background: '#FEF2F2',
                          border: '1px solid #FECACA',
                          borderRadius: '8px',
                          padding: '14px 16px',
                          fontSize: '13px',
                          color: '#991B1B',
                          fontWeight: 600,
                          marginBottom: '20px',
                        }}>
                          INVALID COMPLIANCE DATA: Placeholder text is not permitted.
                          AI Agent activation suspended until corrected.
                        </div>

                        <div style={{
                          fontSize: '13px',
                          color: '#64748B',
                          marginBottom: '16px',
                        }}>
                          <strong style={{ color: '#DC2626' }}>
                            {contentResult.failures.length}
                          </strong> of {contentResult.total_validated} validated fields
                          contain placeholder, empty, or incorrectly formatted values.
                          Values like &quot;N/A&quot;, &quot;TBD&quot;, and &quot;None&quot; are
                          not accepted for federal compliance.
                        </div>

                        {/* Content Failures Table */}
                        <div style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          marginBottom: '20px',
                        }}>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1.5fr',
                            gap: '0',
                            padding: '10px 14px',
                            background: '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#94A3B8',
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.04em',
                          }}>
                            <span>Field</span>
                            <span>Value Found</span>
                            <span>Validation Error</span>
                          </div>
                          {contentResult.failures.map((f) => (
                            <div key={f.field_id} style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr 1.5fr',
                              gap: '0',
                              padding: '10px 14px',
                              borderBottom: '1px solid #F1F5F9',
                              fontSize: '12px',
                              alignItems: 'center',
                            }}>
                              <span style={{
                                color: '#DC2626',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}>
                                <X size={12} color="#DC2626" />
                                {f.display_name}
                              </span>
                              <span style={{
                                color: '#64748B',
                                fontFamily: 'monospace',
                                fontSize: '11px',
                                background: '#FEF2F2',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' as const,
                              }}>
                                {f.cell_value || '(empty)'}
                              </span>
                              <span style={{
                                color: '#991B1B',
                                fontSize: '11px',
                              }}>
                                {f.error}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Remediation */}
                    <div style={{
                      background: '#F0F9FF',
                      border: '1px solid #BAE6FD',
                      borderRadius: '8px',
                      padding: '14px 16px',
                      fontSize: '12px',
                      color: '#0C4A6E',
                      lineHeight: '1.6',
                    }}>
                      <strong style={{ display: 'block', marginBottom: '4px' }}>
                        Remediation Required
                      </strong>
                      {contentResult && !contentResult.passed ? (
                        <>
                          Replace all placeholder values with real compliance data.
                          Policy URLs must use <code style={{ background: '#E0F2FE', padding: '1px 4px', borderRadius: '3px' }}>https://&lt;domain&gt;.gov/</code> format.
                          Email fields must contain valid addresses. Description fields must
                          be at least 10 characters. Dates must use a standard format (YYYY-MM-DD).
                          Agent activation will remain suspended until all fields pass content validation.
                        </>
                      ) : (
                        <>
                          Add the missing columns to your Baseline CSV and re-upload.
                          Each column must contain the applicable policy reference, link, or
                          compliance identifier for your jurisdiction. Agent activation will
                          remain suspended until all M-26-04 fields are present.
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{
                    ...styles.modalFooter,
                    borderTop: '1px solid #FECACA',
                    background: '#FFFBFB',
                  }}>
                    <button
                      onClick={() => setShowComplianceModal(false)}
                      style={{
                        ...styles.modalDoneBtn,
                        background: '#DC2626',
                      }}
                    >
                      Acknowledged — Will Correct CSV
                    </button>
                  </div>
                </div>
              </div>
    </>
  );
}
