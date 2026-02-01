'use client';

import React from 'react';
import {
  ClipboardList,
  X,
  Phone,
  ArrowDown,
  Shield,
  Check,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { styles, traceStyles } from '@/components/government/setup/SetupStyles';

// ── Types ──

interface AppealReceipt {
  appeal_id: string;
  action_receipt_id: string;
  agent_nhi: string;
  policy_snapshot_hash: string;
  filed_at: string;
  status: 'Filed — Pending De Novo Review';
}

// ── Props ──

export interface DecisionTraceModalProps {
  showDecisionTraceModal: boolean;
  appealReceipt: AppealReceipt | null;
  setShowDecisionTraceModal: (v: boolean) => void;
  handleFileAppeal: () => void;
}

export default function DecisionTraceModal({
  showDecisionTraceModal,
  appealReceipt,
  setShowDecisionTraceModal,
  handleFileAppeal,
}: DecisionTraceModalProps) {
  return (
    <>
              <div style={styles.modalOverlay} onClick={() => setShowDecisionTraceModal(false)}>
                <div style={traceStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                  <div style={styles.modalHeader}>
                    <div style={styles.modalHeaderLeft}>
                      <ClipboardList size={20} color="#F472B6" />
                      <h3 style={styles.modalTitle}>AI Decision Trace</h3>
                      <span style={traceStyles.dutyBadge}>Duty to Justify</span>
                    </div>
                    <button onClick={() => setShowDecisionTraceModal(false)} style={styles.modalCloseBtn}>
                      <X size={20} />
                    </button>
                  </div>

                  <div style={traceStyles.body}>
                    {/* Sample Trace Header */}
                    <div style={traceStyles.sampleHeader}>
                      <span style={traceStyles.sampleLabel}>Sample Trace</span>
                      <span style={traceStyles.sampleId}>TRACE-2026-00847</span>
                      <span style={traceStyles.sampleTime}>
                        {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · 2:14 PM
                      </span>
                    </div>

                    {/* Vertical Trace Flow */}
                    <div style={traceStyles.flow}>
                      {/* Step 1: Input Received */}
                      <div style={traceStyles.step}>
                        <div style={traceStyles.stepNode}>
                          <div style={{ ...traceStyles.stepIcon, background: 'rgba(96, 165, 250, 0.12)', border: '1px solid rgba(96, 165, 250, 0.3)' }}>
                            <Phone size={16} color="#60A5FA" />
                          </div>
                          <div style={traceStyles.stepConnector} />
                        </div>
                        <div style={traceStyles.stepContent}>
                          <div style={traceStyles.stepLabel}>Input Received</div>
                          <div style={traceStyles.stepDetail}>
                            Constituent call detected at 2:14 PM. Topic classified
                            as <strong>&quot;Utility Billing Inquiry&quot;</strong> with 97% intent confidence.
                          </div>
                          <div style={traceStyles.stepMeta}>
                            <span style={traceStyles.stepMetaTag}>Channel: Phone</span>
                            <span style={traceStyles.stepMetaTag}>Caller: [REDACTED]</span>
                          </div>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div style={traceStyles.arrowRow}>
                        <ArrowDown size={16} color="#475569" />
                      </div>

                      {/* Step 2: Policy Checked */}
                      <div style={traceStyles.step}>
                        <div style={traceStyles.stepNode}>
                          <div style={{ ...traceStyles.stepIcon, background: 'rgba(244, 114, 182, 0.12)', border: '1px solid rgba(244, 114, 182, 0.3)' }}>
                            <Shield size={16} color="#F472B6" />
                          </div>
                          <div style={traceStyles.stepConnector} />
                        </div>
                        <div style={traceStyles.stepContent}>
                          <div style={traceStyles.stepLabel}>Policy Checked (from Set 1)</div>
                          <div style={traceStyles.stepDetail}>
                            Matched to <strong>Ordinance §14.03 — Utility Billing Procedures</strong>.
                            Cross-referenced with Baseline Set 1 data for labor allocation and fee schedule verification.
                          </div>
                          <div style={traceStyles.stepMeta}>
                            <span style={traceStyles.stepMetaTag}>Source: Baseline Set 1</span>
                            <span style={traceStyles.stepMetaTag}>Ordinance: §14.03</span>
                          </div>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div style={traceStyles.arrowRow}>
                        <ArrowDown size={16} color="#475569" />
                      </div>

                      {/* Step 3: Outcome Reached */}
                      <div style={traceStyles.step}>
                        <div style={traceStyles.stepNode}>
                          <div style={{ ...traceStyles.stepIcon, background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                            <Check size={16} color="#22C55E" />
                          </div>
                          <div style={traceStyles.stepConnector} />
                        </div>
                        <div style={traceStyles.stepContent}>
                          <div style={traceStyles.stepLabel}>Outcome Reached</div>
                          <div style={traceStyles.stepDetail}>
                            Routed to <strong>Utilities Department</strong>. AI-generated response
                            delivered in 12 seconds. Confidence score: <strong>94%</strong>.
                          </div>
                          <div style={traceStyles.stepMeta}>
                            <span style={traceStyles.stepMetaTag}>Dept: Utilities</span>
                            <span style={traceStyles.stepMetaTag}>Confidence: 94%</span>
                            <span style={traceStyles.stepMetaTag}>Latency: 12s</span>
                          </div>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div style={traceStyles.arrowRow}>
                        <ArrowDown size={16} color="#475569" />
                      </div>

                      {/* Step 4: Human Triage */}
                      <div style={traceStyles.step}>
                        <div style={traceStyles.stepNode}>
                          <div style={{ ...traceStyles.stepIcon, background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                            <Users size={16} color="#F59E0B" />
                          </div>
                        </div>
                        <div style={traceStyles.stepContent}>
                          <div style={traceStyles.stepLabel}>Human Triage Required</div>
                          <div style={traceStyles.stepDetail}>
                            <strong>No.</strong> Confidence threshold met (&gt;85%). Decision fully autonomous.
                            Logged for quarterly M-26-04 neutrality audit.
                          </div>
                          <div style={traceStyles.stepMeta}>
                            <span style={{ ...traceStyles.stepMetaTag, color: '#22C55E', borderColor: 'rgba(34,197,94,0.25)' }}>Autonomous</span>
                            <span style={traceStyles.stepMetaTag}>Audit: Q3 2026</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Auditability Footer */}
                    <div style={traceStyles.auditFooter}>
                      <Shield size={14} color="#22C55E" style={{ flexShrink: 0 }} />
                      <span>
                        All decisions are mapped to their specific training source and local ordinance
                        for 100% auditability. This trace is FOIA-requestable and retained per your
                        jurisdiction&apos;s public records schedule.
                      </span>
                    </div>

                    {/* Citizen Appeal — M-26-04 Transparency Act */}
                    <div style={traceStyles.appealSection}>
                      <div style={traceStyles.appealNote}>
                        <AlertTriangle size={13} color="#F59E0B" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>
                          Pursuant to the <strong>2026 AI Transparency Act</strong>, this decision is subject
                          to mandatory human <em>de novo</em> review upon request. Filing an appeal
                          escalates this trace to the designated Responsible AI Officer (RAIO) for
                          independent re-evaluation outside of AI systems.
                        </span>
                      </div>

                      {!appealReceipt ? (
                        <button onClick={handleFileAppeal} style={traceStyles.appealBtn}>
                          🚨 Request Human Review / File Appeal
                        </button>
                      ) : (
                        <div style={traceStyles.appealReceiptCard}>
                          <div style={traceStyles.appealReceiptHeader}>
                            <Check size={14} color="#22C55E" />
                            <span style={traceStyles.appealReceiptTitle}>Appeal Filed Successfully</span>
                            <span style={traceStyles.appealReceiptBadge}>{appealReceipt.status}</span>
                          </div>
                          <div style={traceStyles.appealReceiptGrid}>
                            <div style={traceStyles.appealReceiptRow}>
                              <span style={traceStyles.appealReceiptLabel}>Appeal ID</span>
                              <code style={traceStyles.appealReceiptValue}>{appealReceipt.appeal_id}</code>
                            </div>
                            <div style={traceStyles.appealReceiptRow}>
                              <span style={traceStyles.appealReceiptLabel}>Action Receipt</span>
                              <code style={traceStyles.appealReceiptValue}>{appealReceipt.action_receipt_id}</code>
                            </div>
                            <div style={traceStyles.appealReceiptRow}>
                              <span style={traceStyles.appealReceiptLabel}>Agent NHI</span>
                              <code style={traceStyles.appealReceiptValue}>{appealReceipt.agent_nhi}</code>
                            </div>
                            <div style={traceStyles.appealReceiptRow}>
                              <span style={traceStyles.appealReceiptLabel}>Policy Hash</span>
                              <code style={traceStyles.appealReceiptValue}>{appealReceipt.policy_snapshot_hash}</code>
                            </div>
                            <div style={traceStyles.appealReceiptRow}>
                              <span style={traceStyles.appealReceiptLabel}>Filed At</span>
                              <code style={traceStyles.appealReceiptValue}>
                                {new Date(appealReceipt.filed_at).toLocaleString()}
                              </code>
                            </div>
                          </div>
                          <div style={traceStyles.appealReceiptFooter}>
                            Appeal Receipt downloaded as JSON. Retain this document for your records.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={traceStyles.footer}>
                    <button onClick={() => setShowDecisionTraceModal(false)} style={traceStyles.closeBtn}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
    </>
  );
}
