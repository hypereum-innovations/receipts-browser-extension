// SPDX-License-Identifier: Apache-2.0
/**
 * `popup.mjs` - Renders the local verification summary for `.hvr`
 * receipts discovered on the active tab (email attachments, GitHub PRs, DOM).
 */

export function renderPopupSummaryHtml(summary) {
  if (!summary || summary.total === 0) {
    return '<div class="empty">No .hvr receipts detected on this page.</div>';
  }
  const hasFailed = summary.failed > 0;
  const overallClass = hasFailed ? 'failed' : 'verified';
  const overallText = hasFailed ? `${summary.failed} FAILED` : 'ALL VERIFIED';
  const items = (summary.results ?? [])
    .map((r, idx) => {
      const runId = r.run_id || r.verification_run_id || 'Pending WASM run';
      const rawTier = typeof r.issuer_tier === 'string' ? r.issuer_tier.trim() : '';
      const tierHtml = rawTier
        ? `<span>${rawTier}</span>`
        : '<span class="hr-tier-unknown">Tier unknown</span>';
      const isVerified = r.verdict === 'VERIFIED';
      const badgeClass = isVerified ? 'verified' : 'failed';
      return `<li class="receipt-item">
        <div class="receipt-row">
          <span>#${idx + 1} [${r.source}] (${r.byteLength ?? 0} B)</span>
          <strong class="${badgeClass}">${r.verdict}</strong>
        </div>
        <div class="receipt-meta">run: ${runId} · tier: ${tierHtml}</div>
      </li>`;
    })
    .join('');
  return `
    <div>
      <div class="summary-head">
        <span>Status (${summary.verified}/${summary.total})</span>
        <strong class="${overallClass}">${overallText}</strong>
      </div>
      <ul class="receipt-list">${items}</ul>
    </div>
  `;
}

if (typeof globalThis.document !== 'undefined' && typeof globalThis.chrome !== 'undefined') {
  globalThis.chrome?.runtime?.sendMessage({ type: 'HVR_GET_TAB_REPORT' }, (resp) => {
    const root = globalThis.document.getElementById('report-root');
    if (root && resp?.ok) {
      root.innerHTML = renderPopupSummaryHtml(resp.summary);
    }
  });
}
