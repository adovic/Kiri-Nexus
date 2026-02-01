import 'server-only';

import type { SovereignExitCertificate } from '@/lib/government/audit-logger';

// =============================================================================
// DESTRUCTION CERTIFICATE RENDERER
// =============================================================================
// Formal Certificate of Data Destruction — renders a SovereignExitCertificate
// into printable HTML or archival plain text.
//
// Includes all compliance sections:
//   1. Agency Identity & Tenant
//   2. Chain of Custody — Final State
//   3. Crypto-Shredding Proof
//   4. Data Destruction Summary + Artifacts
//   5. **Purge Verification** — Post-wipe file absence checks
//   6. HMAC-SHA256 Digital Signature
// =============================================================================

// ── HTML Renderer ────────────────────────────────────────────────────────────

/**
 * Render a Sovereign Exit Certificate as printable HTML.
 *
 * This is the formal "Certificate of Data Destruction" that the tenant
 * downloads after exercising their right to leave. It includes the new
 * Purge Verification section proving every file was independently
 * confirmed absent after secure wipe.
 */
export function renderDestructionCertificateHTML(cert: SovereignExitCertificate): string {
  const artifactRows = cert.artifacts_destroyed
    .map(
      (a) =>
        `<tr><td style="padding:8px 16px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:13px">${esc(a.name)}</td><td style="padding:8px 16px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-size:13px">${fmtBytes(a.size_bytes)}</td></tr>`,
    )
    .join('\n');

  const purgeFileRows = cert.purge_verification.file_checks
    .map(
      (fc) =>
        `<tr>
          <td style="padding:6px 16px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px;word-break:break-all">${esc(fc.path)}</td>
          <td style="padding:6px 16px;border-bottom:1px solid #e2e8f0;text-align:center">
            <span class="integrity-badge ${fc.verified_null ? 'integrity-valid' : 'integrity-broken'}">
              ${fc.verified_null ? 'NULL' : 'PRESENT'}
            </span>
          </td>
          <td style="padding:6px 16px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px;color:#64748b">${esc(fc.read_error)}</td>
        </tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Certificate of Data Destruction — ${esc(cert.agency_name)}</title>
  <style>
    @media print {
      body { background: #fff !important; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      background: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 40px;
    }
    .cert-container {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      border: 3px solid #1e3a5f;
      border-radius: 4px;
      padding: 60px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .cert-header {
      text-align: center;
      border-bottom: 2px solid #1e3a5f;
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .cert-seal { font-size: 48px; margin-bottom: 8px; }
    .cert-title {
      font-size: 28px;
      font-weight: bold;
      color: #1e3a5f;
      margin: 0 0 8px 0;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .cert-subtitle {
      font-size: 14px;
      color: #64748b;
      margin: 0;
    }
    .cert-body { margin-bottom: 32px; }
    .cert-field {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #f1f5f9;
    }
    .cert-field-label {
      font-weight: bold;
      color: #475569;
      font-size: 14px;
    }
    .cert-field-value {
      color: #1e293b;
      font-size: 14px;
      text-align: right;
    }
    .cert-section-title {
      font-size: 16px;
      font-weight: bold;
      color: #1e3a5f;
      margin: 28px 0 12px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid #cbd5e1;
    }
    .cert-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .cert-table th {
      background: #f1f5f9;
      padding: 10px 16px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .cert-table th:last-child { text-align: right; }
    .cert-signature-block {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 2px solid #1e3a5f;
      text-align: center;
    }
    .cert-sig-label {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .cert-sig-value {
      font-family: monospace;
      font-size: 11px;
      color: #1e3a5f;
      word-break: break-all;
      background: #f8fafc;
      padding: 12px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    .cert-footer {
      text-align: center;
      margin-top: 24px;
      font-size: 11px;
      color: #94a3b8;
    }
    .print-btn {
      display: block;
      margin: 24px auto 0;
      padding: 12px 32px;
      background: #1e3a5f;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .integrity-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .integrity-valid { background: #dcfce7; color: #166534; }
    .integrity-broken { background: #fee2e2; color: #991b1b; }
    .keys-badge { background: #dcfce7; color: #166534; }
    .purge-summary {
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .purge-pass { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .purge-fail { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  </style>
</head>
<body>
  <div class="cert-container">
    <div class="cert-header">
      <div class="cert-seal">&#x1F6E1;</div>
      <h1 class="cert-title">Certificate of Data Destruction</h1>
      <p class="cert-subtitle">Sovereign Exit Certificate — Agency Data Portability Compliance</p>
    </div>

    <div class="cert-body">
      <div class="cert-field">
        <span class="cert-field-label">Certificate ID</span>
        <span class="cert-field-value" style="font-family:monospace">${esc(cert.certificate_id)}</span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Agency</span>
        <span class="cert-field-value">${esc(cert.agency_name)}</span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Jurisdiction</span>
        <span class="cert-field-value">${esc(cert.jurisdiction_state)}</span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Tenant ID</span>
        <span class="cert-field-value" style="font-family:monospace">${esc(cert.tenant_id)}</span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Destruction Timestamp</span>
        <span class="cert-field-value">${esc(cert.destruction_timestamp)}</span>
      </div>

      <h3 class="cert-section-title">Chain of Custody — Final State</h3>
      <div class="cert-field">
        <span class="cert-field-label">Final Root Hash</span>
        <span class="cert-field-value" style="font-family:monospace;font-size:11px">${esc(cert.final_root_hash)}</span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Chain Integrity (Pre-Destruction)</span>
        <span class="cert-field-value">
          <span class="integrity-badge ${cert.chain_integrity_valid ? 'integrity-valid' : 'integrity-broken'}">
            ${cert.chain_integrity_valid ? 'VALID' : 'BROKEN'}
          </span>
          &nbsp;(${cert.chain_verified_entries} entries verified)
        </span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Keys Destroyed</span>
        <span class="cert-field-value">
          <span class="integrity-badge keys-badge">YES</span>
        </span>
      </div>

      <h3 class="cert-section-title">Crypto-Shredding Proof</h3>
      <div class="cert-field">
        <span class="cert-field-label">Encryption Key Existed</span>
        <span class="cert-field-value">${cert.crypto_shredding_proof.key_existed ? 'YES' : 'NO'}</span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Key File Path</span>
        <span class="cert-field-value" style="font-family:monospace;font-size:11px">${esc(cert.crypto_shredding_proof.key_path)}</span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Secure Shred Completed</span>
        <span class="cert-field-value">
          <span class="integrity-badge ${cert.crypto_shredding_proof.shredded ? 'integrity-valid' : 'integrity-broken'}">
            ${cert.crypto_shredding_proof.shredded ? 'YES — SHREDDED' : 'NO KEY TO SHRED'}
          </span>
        </span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Proof Statement</span>
        <span class="cert-field-value" style="font-style:italic;color:#991b1b;font-weight:600">${esc(cert.crypto_shredding_proof.proof_statement)}</span>
      </div>

      <h3 class="cert-section-title">Data Destruction Summary</h3>
      <div class="cert-field">
        <span class="cert-field-label">Total Audit Entries Destroyed</span>
        <span class="cert-field-value">${cert.total_entries_destroyed}</span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Total Data Destroyed</span>
        <span class="cert-field-value">${fmtBytes(cert.total_bytes_destroyed)}</span>
      </div>

      <h3 class="cert-section-title">Artifacts Destroyed</h3>
      <table class="cert-table">
        <thead>
          <tr>
            <th>File Name</th>
            <th style="text-align:right">Size</th>
          </tr>
        </thead>
        <tbody>
          ${artifactRows || '<tr><td colspan="2" style="padding:12px 16px;text-align:center;color:#94a3b8">No files on disk (data may have been stored externally)</td></tr>'}
        </tbody>
      </table>

      <h3 class="cert-section-title">Purge Verification — Post-Wipe Audit</h3>
      <div class="purge-summary ${cert.purge_verification.all_paths_verified_null ? 'purge-pass' : 'purge-fail'}">
        ${cert.purge_verification.all_paths_verified_null
          ? `ALL ${cert.purge_verification.file_checks.length} file path(s) and the silo directory confirmed NULL after secure wipe.`
          : `WARNING: ${cert.purge_verification.file_checks.filter((fc) => !fc.verified_null).length} path(s) could not be verified as absent.`}
      </div>
      <div class="cert-field">
        <span class="cert-field-label">All Paths Verified NULL</span>
        <span class="cert-field-value">
          <span class="integrity-badge ${cert.purge_verification.all_paths_verified_null ? 'integrity-valid' : 'integrity-broken'}">
            ${cert.purge_verification.all_paths_verified_null ? 'YES' : 'NO'}
          </span>
        </span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Silo Directory Verified NULL</span>
        <span class="cert-field-value">
          <span class="integrity-badge ${cert.purge_verification.silo_directory_verified_null ? 'integrity-valid' : 'integrity-broken'}">
            ${cert.purge_verification.silo_directory_verified_null ? 'YES' : 'NO'}
          </span>
        </span>
      </div>
      <div class="cert-field">
        <span class="cert-field-label">Tombstone Log Entry</span>
        <span class="cert-field-value" style="font-family:monospace;font-size:11px">${esc(cert.purge_verification.tombstone_entry_id)}</span>
      </div>
      ${cert.purge_verification.file_checks.length > 0 ? `
      <table class="cert-table" style="margin-top:12px">
        <thead>
          <tr>
            <th>File Path</th>
            <th style="text-align:center">Status</th>
            <th style="text-align:right">Verification Detail</th>
          </tr>
        </thead>
        <tbody>
          ${purgeFileRows}
        </tbody>
      </table>` : ''}
    </div>

    <div class="cert-signature-block">
      <div class="cert-sig-label">HMAC-SHA256 Digital Signature</div>
      <div class="cert-sig-value">${esc(cert.signature)}</div>
    </div>

    <div class="cert-footer">
      <p>This certificate was generated at the time of data destruction and is cryptographically signed.</p>
      <p>The HMAC-SHA256 signature covers the full certificate body including purge verification results.</p>
      <p>Retain this document for your records. The destroyed data is unrecoverable.</p>
    </div>

    <button class="print-btn no-print" onclick="window.print()">Print Certificate</button>
  </div>
</body>
</html>`;
}

// ── Plain-Text Renderer (Archival / PDF Text Layer) ──────────────────────────

/**
 * Render a Sovereign Exit Certificate as plain text.
 *
 * Suitable for:
 *   - Embedding as a text layer in a PDF
 *   - Archival storage in a document management system
 *   - Email delivery of the certificate
 *   - Machine-readable parsing
 */
export function renderDestructionCertificateText(cert: SovereignExitCertificate): string {
  const divider = '='.repeat(72);
  const thinDivider = '-'.repeat(72);
  const lines: string[] = [];

  lines.push(divider);
  lines.push('           CERTIFICATE OF DATA DESTRUCTION');
  lines.push('     Sovereign Exit Certificate — Agency Data Portability');
  lines.push(divider);
  lines.push('');
  lines.push(`Certificate ID:        ${cert.certificate_id}`);
  lines.push(`Agency:                ${cert.agency_name}`);
  lines.push(`Jurisdiction:          ${cert.jurisdiction_state}`);
  lines.push(`Tenant ID:             ${cert.tenant_id}`);
  lines.push(`Destruction Timestamp: ${cert.destruction_timestamp}`);
  lines.push('');

  lines.push(thinDivider);
  lines.push('CHAIN OF CUSTODY — FINAL STATE');
  lines.push(thinDivider);
  lines.push(`Final Root Hash:       ${cert.final_root_hash}`);
  lines.push(`Chain Integrity:       ${cert.chain_integrity_valid ? 'VALID' : 'BROKEN'} (${cert.chain_verified_entries} entries verified)`);
  lines.push(`Keys Destroyed:        YES`);
  lines.push('');

  lines.push(thinDivider);
  lines.push('CRYPTO-SHREDDING PROOF');
  lines.push(thinDivider);
  lines.push(`Key Existed:           ${cert.crypto_shredding_proof.key_existed ? 'YES' : 'NO'}`);
  lines.push(`Key Path:              ${cert.crypto_shredding_proof.key_path}`);
  lines.push(`Shredded:              ${cert.crypto_shredding_proof.shredded ? 'YES' : 'NO'}`);
  lines.push(`Proof:                 ${cert.crypto_shredding_proof.proof_statement}`);
  lines.push('');

  lines.push(thinDivider);
  lines.push('DATA DESTRUCTION SUMMARY');
  lines.push(thinDivider);
  lines.push(`Entries Destroyed:     ${cert.total_entries_destroyed}`);
  lines.push(`Total Data:            ${fmtBytes(cert.total_bytes_destroyed)}`);
  lines.push('');

  if (cert.artifacts_destroyed.length > 0) {
    lines.push('Artifacts Destroyed:');
    for (const a of cert.artifacts_destroyed) {
      lines.push(`  - ${a.name} (${fmtBytes(a.size_bytes)})`);
    }
    lines.push('');
  }

  lines.push(thinDivider);
  lines.push('PURGE VERIFICATION — POST-WIPE AUDIT');
  lines.push(thinDivider);
  lines.push(`All Paths NULL:        ${cert.purge_verification.all_paths_verified_null ? 'YES' : 'NO'}`);
  lines.push(`Silo Dir NULL:         ${cert.purge_verification.silo_directory_verified_null ? 'YES' : 'NO'}`);
  lines.push(`Tombstone Entry:       ${cert.purge_verification.tombstone_entry_id}`);
  lines.push('');

  if (cert.purge_verification.file_checks.length > 0) {
    lines.push('File Path Checks:');
    for (const fc of cert.purge_verification.file_checks) {
      const status = fc.verified_null ? 'NULL' : 'PRESENT';
      lines.push(`  [${status}] ${fc.path}`);
      lines.push(`         ${fc.read_error}`);
    }
    lines.push('');
  }

  lines.push(divider);
  lines.push('HMAC-SHA256 DIGITAL SIGNATURE');
  lines.push(divider);
  lines.push(cert.signature);
  lines.push('');
  lines.push('This certificate was generated at the time of data destruction');
  lines.push('and is cryptographically signed. The destroyed data is unrecoverable.');
  lines.push(divider);

  return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
