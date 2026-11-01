// SPDX-License-Identifier: Apache-2.0
/**
 * `background.mjs` — Manifest V3 background service worker for offline
 * Class-1 verification of `.hvr` (`application/vnd.hivemind.receipt+cose`)
 * receipts extracted from web pages, GitHub PRs, and email attachments.
 */

export const MEDIA_TYPE_HVR = 'application/vnd.hivemind.receipt+cose';
export const HVR_MAGIC_TAG18 = [0xd2, 0x84];

function b64ToBytes(b64) {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(norm, 'base64'));
  }
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Inspect and deterministically verify a candidate `.hvr` payload or JSON bundle
 * without making any external network calls.
 */
export function verifyCandidateReceiptOffline(candidate) {
  const checks = [];
  let rawBytes = null;
  let checkpointText = candidate.checkpoint ?? '';
  let minWitnessQuorum = Number(candidate.minWitnessQuorum ?? 3);

  try {
    if (typeof candidate.rawBase64 === 'string' && candidate.rawBase64.trim().length > 0) {
      const trimmed = candidate.rawBase64.trim();
      if (trimmed.startsWith('{')) {
        const parsedJson = JSON.parse(trimmed);
        rawBytes = b64ToBytes(parsedJson.statement_base64 ?? parsedJson.entry ?? '');
        checkpointText = parsedJson.checkpoint ?? checkpointText;
      } else {
        rawBytes = b64ToBytes(trimmed);
      }
    } else if (candidate.rawBytes instanceof Uint8Array) {
      rawBytes = candidate.rawBytes;
    }
  } catch (err) {
    return {
      verdict: 'FAILED',
      source: candidate.source ?? 'unknown',
      checks: [{ check: 'decode', status: 'fail', detail: err.message }],
    };
  }

  if (!rawBytes || rawBytes.length < 16) {
    return {
      verdict: 'FAILED',
      source: candidate.source ?? 'unknown',
      checks: [{ check: 'envelope', status: 'fail', detail: 'Receipt payload empty or truncated (<16 bytes)' }],
    };
  }

  // Check COSE_Sign1 CBOR Tag 18 + 4-element array magic bytes (0xd2 0x84)
  const magicOk = rawBytes[0] === HVR_MAGIC_TAG18[0] && rawBytes[1] === HVR_MAGIC_TAG18[1];
  checks.push({
    check: 'envelope_magic',
    status: magicOk ? 'pass' : 'fail',
    detail: magicOk
      ? 'Valid COSE_Sign1 CBOR Tag 18 (0xd284) header'
      : `Unexpected magic bytes 0x${rawBytes[0]?.toString(16)}${rawBytes[1]?.toString(16)}`,
  });

  // Check embedded profile marker `urn:hivemind:receipts:capsule:`
  const asciiView = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);
  const hasProfile = asciiView.includes('urn:hivemind:receipts:capsule:');
  checks.push({
    check: 'capsule_profile',
    status: hasProfile ? 'pass' : 'fail',
    detail: hasProfile
      ? 'Agent Action Capsule profile present'
      : 'Missing urn:hivemind:receipts:capsule profile identifier',
  });

  // Check SCITT receipt attachment (`application/scitt-receipt+cose`)
  const hasScittReceipt = asciiView.includes('application/scitt-receipt+cose');
  checks.push({
    check: 'scitt_receipt',
    status: hasScittReceipt ? 'pass' : 'fail',
    detail: hasScittReceipt
      ? 'RFC 9942 SCITT inclusion receipt attached'
      : 'No RFC 9942 SCITT receipt attached',
  });

  // Check C2SP checkpoint & witness cosignature lines if checkpoint supplied
  if (checkpointText) {
    const sep = checkpointText.indexOf('\n\n');
    const sigLines =
      sep >= 0
        ? checkpointText
            .slice(sep + 2)
            .split('\n')
            .filter((l) => l.startsWith('— '))
        : [];
    // First signature line is log, remaining are witness cosignatures
    const witnessLines = Math.max(0, sigLines.length - 1);
    const quorumOk = witnessLines >= minWitnessQuorum;
    checks.push({
      check: 'witness_quorum',
      status: quorumOk ? 'pass' : 'fail',
      detail: `${witnessLines}/${minWitnessQuorum} C2SP witness cosignatures present`,
    });
  }

  const verdict = checks.every((c) => c.status === 'pass') ? 'VERIFIED' : 'FAILED';
  return {
    verdict,
    source: candidate.source ?? 'dom',
    byteLength: rawBytes.length,
    checks,
  };
}

const tabReports = new Map();

export function handleExtensionMessage(message, sender = {}) {
  if (!message || typeof message !== 'object') {
    return { ok: false, error: 'invalid_message' };
  }
  if (message.type === 'HVR_VERIFY_CANDIDATES') {
    const candidates = Array.isArray(message.candidates) ? message.candidates : [];
    const results = candidates.map((c) => verifyCandidateReceiptOffline(c));
    const tabId = sender?.tab?.id ?? message.tabId ?? 'active';
    const summary = {
      updatedAt: new Date().toISOString(),
      total: results.length,
      verified: results.filter((r) => r.verdict === 'VERIFIED').length,
      failed: results.filter((r) => r.verdict === 'FAILED').length,
      results,
    };
    tabReports.set(tabId, summary);
    return { ok: true, summary };
  }
  if (message.type === 'HVR_GET_TAB_REPORT') {
    const tabId = message.tabId ?? 'active';
    return {
      ok: true,
      summary: tabReports.get(tabId) ?? {
        updatedAt: null,
        total: 0,
        verified: 0,
        failed: 0,
        results: [],
      },
    };
  }
  return { ok: false, error: 'unknown_message_type' };
}

if (typeof globalThis.chrome !== 'undefined' && globalThis.chrome?.runtime?.onMessage) {
  globalThis.chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const resp = handleExtensionMessage(message, sender);
    sendResponse(resp);
    return false;
  });
}
