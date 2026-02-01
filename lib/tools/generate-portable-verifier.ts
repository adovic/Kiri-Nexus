// =============================================================================
// PORTABLE FORENSIC VERIFIER — Standalone HTML Generator
// =============================================================================
// Generates a self-contained HTML document that verifies the integrity of
// sovereign exit audit chain exports. Zero dependencies — uses only the
// Web Crypto API (crypto.subtle.digest) for SHA-256 computation.
//
// The verifier reproduces the exact hash algorithm from audit-logger.ts:
//   1. Remove `entry_hash` from the entry
//   2. Sort remaining top-level keys alphabetically
//   3. JSON.stringify(hashable, sortedKeys)
//   4. SHA-256 hex digest
//
// Genesis hash is the string literal "GENESIS".
// =============================================================================

/**
 * Generate a complete standalone HTML document that can verify audit chain
 * integrity from NDJSON or JSON array exports.
 *
 * The returned HTML has zero external dependencies and works offline.
 */
export function generatePortableVerifier(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sovereign Audit Chain — Forensic Verifier</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
    background: #0f172a;
    color: #e2e8f0;
    min-height: 100vh;
    padding: 2rem;
    line-height: 1.6;
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #f8fafc;
    margin-bottom: 0.25rem;
    letter-spacing: 0.025em;
  }

  .subtitle {
    font-size: 0.8rem;
    color: #64748b;
    margin-bottom: 2rem;
  }

  /* ── Drop Zone ────────────────────────────────────────────── */
  #drop-zone {
    border: 2px dashed #334155;
    border-radius: 8px;
    padding: 3rem 2rem;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    margin-bottom: 1.5rem;
    background: #1e293b;
  }

  #drop-zone.drag-over {
    border-color: #38bdf8;
    background: #1e3a5f;
  }

  #drop-zone p {
    color: #94a3b8;
    font-size: 0.85rem;
  }

  #drop-zone .hint {
    font-size: 0.75rem;
    color: #475569;
    margin-top: 0.5rem;
  }

  #file-input { display: none; }

  /* ── Summary Bar ──────────────────────────────────────────── */
  #summary {
    display: none;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
    font-size: 0.8rem;
  }

  #summary .row {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
  }

  #summary .stat {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  #summary .stat .label { color: #64748b; }
  #summary .stat .value { font-weight: 600; color: #f8fafc; }
  #summary .stat .value.pass { color: #4ade80; }
  #summary .stat .value.fail { color: #f87171; }

  #summary .verdict {
    margin-top: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.85rem;
  }

  #summary .verdict.pass {
    background: rgba(74, 222, 128, 0.1);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.25);
  }

  #summary .verdict.fail {
    background: rgba(248, 113, 113, 0.1);
    color: #f87171;
    border: 1px solid rgba(248, 113, 113, 0.25);
  }

  /* ── Results Table ────────────────────────────────────────── */
  #results {
    display: none;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    background: #1e293b;
    color: #94a3b8;
    font-weight: 500;
    border-bottom: 1px solid #334155;
    white-space: nowrap;
    position: sticky;
    top: 0;
  }

  td {
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid #1e293b;
    vertical-align: top;
    white-space: nowrap;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  tr:hover td { background: #1e293b; }

  .hash-cell {
    font-family: inherit;
    font-size: 0.7rem;
    color: #94a3b8;
  }

  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .badge.pass {
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
  }

  .badge.fail {
    background: rgba(248, 113, 113, 0.15);
    color: #f87171;
  }

  .badge.genesis {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  .break-row td {
    background: rgba(248, 113, 113, 0.05) !important;
  }

  .detail-text {
    font-size: 0.7rem;
    color: #f87171;
    white-space: normal;
    max-width: 360px;
  }

  /* ── Processing indicator ─────────────────────────────────── */
  #processing {
    display: none;
    text-align: center;
    padding: 2rem;
    color: #94a3b8;
    font-size: 0.85rem;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  #processing .dot {
    animation: pulse 1.2s infinite;
  }
</style>
</head>
<body>

<h1>Sovereign Audit Chain &mdash; Forensic Verifier</h1>
<p class="subtitle">
  Drop an NDJSON audit log export or JSON array to verify hash-chain integrity.
  All computation runs locally in your browser &mdash; no data leaves this page.
</p>

<div id="drop-zone" tabindex="0" role="button" aria-label="Drop audit file here or click to browse">
  <p>Drop <code>.ndjson</code> / <code>.json</code> file here, or click to browse</p>
  <p class="hint">Supports NDJSON (one JSON object per line) and JSON arrays</p>
</div>
<input type="file" id="file-input" accept=".ndjson,.json,.jsonl,.txt">

<div id="processing"><span class="dot">Verifying chain integrity&hellip;</span></div>

<div id="summary">
  <div class="row" id="summary-stats"></div>
  <div id="summary-verdict"></div>
</div>

<div id="results">
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Status</th>
        <th>Receipt ID</th>
        <th>Type</th>
        <th>Timestamp</th>
        <th>entry_hash</th>
        <th>prev_hash</th>
        <th>Detail</th>
      </tr>
    </thead>
    <tbody id="results-body"></tbody>
  </table>
</div>

<script>
(function() {
  'use strict';

  var GENESIS = 'GENESIS';

  // ── SHA-256 via Web Crypto ───────────────────────────────────────
  function sha256hex(str) {
    var encoder = new TextEncoder();
    var data = encoder.encode(str);
    return crypto.subtle.digest('SHA-256', data).then(function(buf) {
      var arr = new Uint8Array(buf);
      var hex = '';
      for (var i = 0; i < arr.length; i++) {
        hex += ('0' + arr[i].toString(16)).slice(-2);
      }
      return hex;
    });
  }

  // ── Reproduce computeEntryHash from audit-logger.ts ─────────────
  // 1. Remove entry_hash from the object
  // 2. Sort remaining keys alphabetically
  // 3. JSON.stringify(obj, sortedKeys)
  // 4. SHA-256 hex
  function computeEntryHash(entry) {
    var hashable = {};
    var keys = Object.keys(entry);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== 'entry_hash') {
        hashable[keys[i]] = entry[keys[i]];
      }
    }
    var sortedKeys = Object.keys(hashable).sort();
    var serialized = JSON.stringify(hashable, sortedKeys);
    return sha256hex(serialized);
  }

  // ── Detect entry type ───────────────────────────────────────────
  function getEntryType(entry) {
    if (entry.marker === '[PULSE]') return 'Pulse';
    if (entry.marker === '[AUDIT_SHIELD]') return 'AdminAccess';
    if (entry.marker === '[SYSTEM_RECOVERY]') return 'Recovery';
    if (entry.action_receipt_id) return 'Action';
    return 'Unknown';
  }

  // ── Get receipt ID from entry ───────────────────────────────────
  function getReceiptId(entry) {
    return entry.action_receipt_id
      || entry.admin_access_receipt_id
      || entry.pulse_receipt_id
      || entry.recovery_receipt_id
      || '—';
  }

  // ── Truncate hash for display ───────────────────────────────────
  function truncHash(h) {
    if (!h) return '—';
    if (h === GENESIS) return GENESIS;
    if (h.length > 16) return h.slice(0, 16) + '\\u2026';
    return h;
  }

  // ── Parse file content into entries ─────────────────────────────
  function parseEntries(text) {
    text = text.trim();
    // Try JSON array first
    if (text.charAt(0) === '[') {
      try {
        var arr = JSON.parse(text);
        if (Array.isArray(arr)) return arr;
      } catch (e) { /* fall through to NDJSON */ }
    }
    // NDJSON: one JSON object per line
    var lines = text.split('\\n');
    var entries = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      try {
        entries.push(JSON.parse(line));
      } catch (e) {
        // Skip unparseable lines (e.g. encrypted ENC: lines)
      }
    }
    return entries;
  }

  // ── Main verification ──────────────────────────────────────────
  function verify(entries) {
    var total = entries.length;
    var passed = 0;
    var failed = 0;
    var chainBreakIndex = null;
    var expectedPrevHash = GENESIS;
    var results = [];

    // Process entries sequentially (SHA-256 is async)
    var chain = Promise.resolve();

    for (var i = 0; i < entries.length; i++) {
      (function(idx) {
        chain = chain.then(function() {
          var entry = entries[idx];

          // Skip pre-chain entries (no entry_hash field)
          if (!entry.entry_hash) {
            results.push({
              index: idx,
              status: 'skip',
              receiptId: getReceiptId(entry),
              type: getEntryType(entry),
              timestamp: entry.timestamp || '—',
              entryHash: '—',
              prevHash: '—',
              detail: 'Pre-chain entry (no entry_hash)'
            });
            expectedPrevHash = GENESIS;
            return;
          }

          return computeEntryHash(entry).then(function(recomputed) {
            var storedHash = entry.entry_hash;
            var entryPrevHash = entry.prev_hash || GENESIS;
            var hashValid = recomputed === storedHash;
            var linkValid = entryPrevHash === expectedPrevHash;
            var ok = hashValid && linkValid;

            if (ok) {
              passed++;
            } else {
              failed++;
              if (chainBreakIndex === null) chainBreakIndex = idx;
            }

            var detail = '';
            if (!hashValid) {
              detail = 'Hash mismatch: recomputed ' + truncHash(recomputed)
                + ' != stored ' + truncHash(storedHash);
            } else if (!linkValid) {
              detail = 'Link broken: prev_hash ' + truncHash(entryPrevHash)
                + ' != expected ' + truncHash(expectedPrevHash);
            }

            results.push({
              index: idx,
              status: ok ? 'pass' : 'fail',
              receiptId: getReceiptId(entry),
              type: getEntryType(entry),
              timestamp: entry.timestamp || '—',
              entryHash: truncHash(storedHash),
              prevHash: truncHash(entryPrevHash),
              detail: detail,
              isBreak: !ok
            });

            expectedPrevHash = storedHash;
          });
        });
      })(i);
    }

    return chain.then(function() {
      return {
        total: total,
        passed: passed,
        failed: failed,
        skipped: total - passed - failed,
        chainBreakIndex: chainBreakIndex,
        results: results
      };
    });
  }

  // ── Render results ─────────────────────────────────────────────
  function render(report) {
    // Summary
    var summaryEl = document.getElementById('summary');
    var statsEl = document.getElementById('summary-stats');
    var verdictEl = document.getElementById('summary-verdict');

    statsEl.innerHTML =
      '<div class="stat"><span class="label">Total:</span> <span class="value">' + report.total + '</span></div>' +
      '<div class="stat"><span class="label">Verified:</span> <span class="value pass">' + report.passed + '</span></div>' +
      '<div class="stat"><span class="label">Failed:</span> <span class="value' + (report.failed > 0 ? ' fail' : '') + '">' + report.failed + '</span></div>' +
      '<div class="stat"><span class="label">Skipped:</span> <span class="value">' + report.skipped + '</span></div>' +
      (report.chainBreakIndex !== null
        ? '<div class="stat"><span class="label">First break:</span> <span class="value fail">index ' + report.chainBreakIndex + '</span></div>'
        : '');

    if (report.failed === 0) {
      verdictEl.className = 'verdict pass';
      verdictEl.textContent = 'CHAIN INTACT — All ' + report.passed + ' entries verified. No tampering detected.';
    } else {
      verdictEl.className = 'verdict fail';
      verdictEl.textContent = 'CHAIN BROKEN — ' + report.failed + ' entr' + (report.failed === 1 ? 'y' : 'ies')
        + ' failed verification. First break at index ' + report.chainBreakIndex + '.';
    }

    summaryEl.style.display = 'block';

    // Table
    var tbody = document.getElementById('results-body');
    var html = '';
    for (var i = 0; i < report.results.length; i++) {
      var r = report.results[i];
      var badgeClass = r.status === 'pass' ? 'pass'
                     : r.status === 'fail' ? 'fail'
                     : 'genesis';
      var badgeText = r.status === 'pass' ? 'PASS'
                    : r.status === 'fail' ? 'FAIL'
                    : 'SKIP';

      html += '<tr' + (r.isBreak ? ' class="break-row"' : '') + '>'
        + '<td>' + r.index + '</td>'
        + '<td><span class="badge ' + badgeClass + '">' + badgeText + '</span></td>'
        + '<td>' + escapeHtml(r.receiptId) + '</td>'
        + '<td>' + escapeHtml(r.type) + '</td>'
        + '<td>' + escapeHtml(r.timestamp) + '</td>'
        + '<td class="hash-cell">' + escapeHtml(r.entryHash) + '</td>'
        + '<td class="hash-cell">' + escapeHtml(r.prevHash) + '</td>'
        + '<td class="detail-text">' + escapeHtml(r.detail) + '</td>'
        + '</tr>';
    }
    tbody.innerHTML = html;
    document.getElementById('results').style.display = 'block';
    document.getElementById('processing').style.display = 'none';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── File handling ──────────────────────────────────────────────
  function handleFile(file) {
    document.getElementById('processing').style.display = 'block';
    document.getElementById('summary').style.display = 'none';
    document.getElementById('results').style.display = 'none';

    var reader = new FileReader();
    reader.onload = function(e) {
      var text = e.target.result;
      var entries = parseEntries(text);
      if (entries.length === 0) {
        document.getElementById('processing').style.display = 'none';
        alert('No valid JSON entries found in the file.');
        return;
      }
      verify(entries).then(render);
    };
    reader.readAsText(file);
  }

  // ── Event bindings ─────────────────────────────────────────────
  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', function() { fileInput.click(); });
  dropZone.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  fileInput.addEventListener('change', function() {
    if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
  });

  dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', function() {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  });
})();
</script>
</body>
</html>`;
}
