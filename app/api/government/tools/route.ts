import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { GOVERNMENT_TOOLS } from '@/lib/government/tools';
import {
  createServiceRequest,
  getPermitStatus,
  scheduleAppointment,
  getPaymentStatus,
  processPayment,
} from '@/lib/government/mock-db';
import { writeAuditLog, AuditWriteError, CriticalIntegrityFailure } from '@/lib/government/audit-logger';
import { resolveTenantFromVapiSecret } from '@/lib/government/tenant-resolver';
import { isRaioAuthorizationValid } from '@/lib/government/governance-ledger';
import { redactPII } from '@/lib/government/transparency-sanitizer';
import { isSupportViewFromRequest } from '@/lib/government/server-redaction';

// ===========================================
// GOVERNMENT TOOLS API — ZERO TRUST
// ===========================================
// Tenant identity is NEVER accepted from the
// client. It is resolved server-side from the
// per-tenant Vapi webhook secret via Firestore.
// ===========================================

export async function POST(req: Request) {
  // ===========================================
  // STEP 1: Resolve Tenant from Vapi Secret
  // ===========================================
  // Each tenant has a unique vapi_secret stored
  // in Firestore. The secret-to-tenant mapping
  // replaces all client-supplied tenant IDs.
  // ===========================================
  const secret = req.headers.get('x-vapi-secret');
  if (!secret) {
    console.warn('[Government API] Missing x-vapi-secret header');
    return NextResponse.json(
      { error: 'Unauthorized', detail: 'Missing webhook authentication.' },
      { status: 401 },
    );
  }

  const tenant = await resolveTenantFromVapiSecret(secret);

  if (!tenant) {
    // ── Suspended Tenant Detection ──────────────────────
    // resolveTenantFromVapiSecret queries with status='active'.
    // If no tenant was found, check if the secret matches a
    // SUSPENDED tenant — return a specific 403 instead of 401
    // so the Vapi error handler and audit trail can distinguish
    // between "unknown secret" and "suspended agency".
    try {
      const suspendedSnap = await adminDb
        .collection('govTenants')
        .where('vapi_secret', '==', secret.trim())
        .where('status', '==', 'suspended')
        .limit(1)
        .get();

      if (!suspendedSnap.empty) {
        const suspDoc = suspendedSnap.docs[0];
        const suspData = suspDoc.data();
        console.warn(
          `[Government API] SUSPENDED TENANT BLOCKED — tenant:${suspDoc.id} ` +
            `(${suspData.agency_name}) | suspend_id:${suspData.suspend_id || 'N/A'} ` +
            `| suspended_at:${suspData.suspended_at || 'N/A'}`,
        );
        return NextResponse.json(
          {
            error: 'Agent Suspended',
            detail:
              'This agency has been emergency-suspended. All AI tool execution is blocked. ' +
              'Contact your administrator for reactivation.',
            system_status: 'SUSPENDED',
            operational_mode: 'OFFLINE',
            suspend_id: suspData.suspend_id || null,
            suspended_at: suspData.suspended_at || null,
          },
          { status: 403 },
        );
      }
    } catch {
      // Non-fatal: if the suspended check fails, fall through to generic 401
    }

    console.warn('[Government API] Tenant resolution failed — no matching secret');
    return NextResponse.json(
      {
        error: 'Unauthorized',
        detail: 'No active tenant found for the provided webhook secret. Ensure your agency has been provisioned.',
      },
      { status: 401 },
    );
  }

  console.log(
    `[Government API] Tenant resolved: ${tenant.tenant_id} (${tenant.agency_name})`,
  );

  // ===========================================
  // STEP 2: Read Server-Trusted Headers
  // ===========================================
  // NHI and policy hash are sourced from the
  // resolved tenant config, NOT from the client.
  // ===========================================
  const agentNhi = tenant.agent_nhi;
  const policySnapshotHash = req.headers.get('x-policy-snapshot-hash') || 'NONE';

  // -----------------------------------------
  // RAIO KEEP-ALIVE GATE — 30-Day Human
  // Re-authentication Protocol (M-26-04 §4.3)
  //
  // Verification is ledger-backed: the governance
  // ledger at data/audit/{tenant}/governance_ledger.json
  // records identity-bound check-ins with Digital
  // Fingerprints and Merkle Root Hash snapshots.
  // A client-supplied header can no longer bypass this.
  // -----------------------------------------
  const raioStatus = isRaioAuthorizationValid(tenant.tenant_id);
  if (!raioStatus.authorized) {
    console.warn(
      `[RAIO GATE] Agent ${agentNhi} SUSPENDED — ${raioStatus.verdict}`,
    );
    return NextResponse.json(
      {
        error: 'Agent Suspended',
        detail: 'Agent Suspended: Human Supervisor (RAIO) check-in required as per M-26-04.',
        raio_status: {
          authorized: false,
          days_since_checkin: raioStatus.days_since_checkin,
          days_remaining: 0,
          verdict: raioStatus.verdict,
          last_raio_user: raioStatus.latest_entry?.raio_user_id || null,
          last_checkin: raioStatus.latest_entry?.timestamp || null,
        },
        threshold_days: 30,
      },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { message } = body;

    if (message.type === 'tool-calls') {
      const toolCall = message.toolCalls[0];
      const functionName = toolCall.function.name;
      const args = toolCall.function.arguments
        ? JSON.parse(toolCall.function.arguments)
        : {};

      let resultText: string;
      let executionStatus: 'Success' | 'Fail' = 'Success';

      // ===========================================
      // ROUTE THE TOOL CALL TO THE CORRECT FUNCTION
      // ===========================================
      try {
        switch (functionName) {
          case 'log_service_request': {
            const location = args.location || 'Unknown Location';
            const request = createServiceRequest(args.issue_type, location, args.description);
            resultText = `Service request logged successfully. Ticket #${request.id}. Status: ${request.status}. Estimated resolution: ${request.estimated_resolution}.`;
            break;
          }

          case 'check_permit_status': {
            const permit = getPermitStatus(args.permit_id);
            if (permit) {
              resultText = `Permit ${permit.id} is currently ${permit.status}. Last updated: ${permit.lastUpdated}.`;
            } else {
              resultText = 'Permit not found. Please ask the user to verify the ID.';
            }
            break;
          }

          case 'schedule_appointment': {
            const appointment = scheduleAppointment(args.department, args.preferred_time);
            if (appointment.error) {
              resultText = appointment.error;
            } else {
              resultText = `Appointment confirmed for ${appointment.time} with ${appointment.department}. Confirmation ID: ${appointment.id}.`;
            }
            break;
          }

          case 'check_payment_status': {
            const payment = getPaymentStatus(args.reference_number);
            if (payment) {
              resultText = `Payment for ${args.reference_number} is ${payment.status}. Amount: ${payment.amount}. Date: ${payment.date}.`;
            } else {
              resultText = 'Payment record not found.';
            }
            break;
          }

          case 'process_mock_payment': {
            const receipt = processPayment(args.amount, args.method);
            resultText = `Payment of ${args.amount} processed successfully via ${args.method}. Receipt: ${receipt.receipt_id}.`;
            break;
          }

          default:
            executionStatus = 'Fail';
            resultText = 'Error: Tool function not found.';
        }
      } catch (toolError) {
        executionStatus = 'Fail';
        resultText = `Tool execution error: ${toolError instanceof Error ? toolError.message : String(toolError)}`;
      }

      // ===========================================
      // WRITE OPERATIONAL RECEIPT TO AUDIT LOG
      // Tenant ID is SERVER-RESOLVED — never from client.
      // ===========================================
      let auditReceipt;
      try {
        auditReceipt = writeAuditLog({
          tenant_id: tenant.tenant_id,
          agent_nhi: agentNhi,
          tool_name: functionName,
          tool_arguments: args,
          policy_snapshot_hash: policySnapshotHash,
          execution_status: executionStatus,
          execution_result: resultText,
          vapi_tool_call_id: toolCall.id,
        });
      } catch (auditError) {
        // ── CRITICAL: Chain integrity failure = AI agent is BLOCKED ──
        if (auditError instanceof CriticalIntegrityFailure) {
          console.error(
            `[CRITICAL_INTEGRITY_FAILURE] Tenant ${auditError.tenant_id} — AI actions BLOCKED:`,
            auditError.detail || auditError.message,
          );
          return NextResponse.json(
            {
              error: 'CRITICAL_INTEGRITY_FAILURE',
              detail: `AI agent is BLOCKED. The audit log chain-of-custody for this tenant has been compromised. Tool "${functionName}" will NOT execute until the integrity issue is resolved.`,
              tenant_id: auditError.tenant_id,
              cause: auditError.detail || auditError.message,
            },
            { status: 503 },
          );
        }

        const detail = auditError instanceof AuditWriteError
          ? auditError.message
          : String(auditError);
        console.error('[FAIL-FAST] Audit log write failed — aborting tool response:', detail);
        return NextResponse.json(
          {
            error: 'Audit Logging Failure',
            detail: `Tool "${functionName}" executed but the result is being withheld because the action could not be persisted to the audit log. This is a compliance-critical failure.`,
            cause: detail,
          },
          { status: 500 },
        );
      }

      // ===========================================
      // PII REDACTION GATE — SUPPORT_VIEW
      // ===========================================
      // The audit log (written above) stores the raw,
      // unredacted result as the authoritative record.
      // The RESPONSE to the client is redacted when the
      // caller is in SUPPORT_VIEW mode (detected via
      // httpOnly cookie from server-redaction.ts).
      // ===========================================
      const clientResult = isSupportViewFromRequest(req)
        ? redactPII(resultText)
        : resultText;

      // ===========================================
      // RETURN RESULT + RECEIPT ID TO CLIENT
      // ===========================================
      return NextResponse.json({
        results: [
          {
            toolCallId: toolCall.id,
            result: clientResult,
          },
        ],
        action_receipt_id: auditReceipt.action_receipt_id,
        audit: {
          receipt_id: auditReceipt.action_receipt_id,
          timestamp: auditReceipt.timestamp,
          agent_nhi: auditReceipt.agent_nhi,
          policy_snapshot_hash: auditReceipt.policy_snapshot_hash,
          execution_status: auditReceipt.execution_status,
        },
      });
    }

    return NextResponse.json({ status: 'ok' });

  } catch (error) {
    console.error('[Government API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
