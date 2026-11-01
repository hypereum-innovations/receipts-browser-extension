// SPDX-License-Identifier: Apache-2.0
/**
 * `content.mjs` — Scans web pages for Hivemind Receipts (`.hvr`):
 *  1. `<script type="application/vnd.hivemind.receipt+cose">` blocks
 *  2. Elements with `data-hvr-receipt` attribute
 *  3. GitHub PR comments / check-runs containing `<!-- hivemind-receipt: <base64> -->` or `.hvr` links
 *  4. Webmail attachment links ending in `.hvr` or carrying `data-mime-type="application/vnd.hivemind.receipt+cose"`
 */

export const MEDIA_TYPE_HVR = 'application/vnd.hivemind.receipt+cose';

/**
 * Scan a DOM-like root or HTML string for embedded `.hvr` receipts.
 */
export function scanHtmlForHvrReceipts(htmlString) {
  const candidates = [];

  // 1. <script type="application/vnd.hivemind.receipt+cose">...</script>
  const scriptRe = /<script[^>]*type=["']application\/vnd\.hivemind\.receipt\+cose["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(htmlString)) !== null) {
    const body = match[1].trim();
    if (body) {
      candidates.push({
        source: 'script-tag',
        mediaType: MEDIA_TYPE_HVR,
        rawBase64: body,
      });
    }
  }

  // 2. data-hvr-receipt="<base64>"
  const attrRe = /data-hvr-receipt=["']([^"']+)["']/gi;
  while ((match = attrRe.exec(htmlString)) !== null) {
    const val = match[1].trim();
    if (val) {
      candidates.push({
        source: 'data-hvr-receipt-attr',
        mediaType: MEDIA_TYPE_HVR,
        rawBase64: val,
      });
    }
  }

  // 3. GitHub PR comment / check-run marker: <!-- hivemind-receipt: <base64> -->
  const ghCommentRe = /<!--\s*hivemind-receipt:\s*([A-Za-z0-9+/=_-]+)\s*-->/gi;
  while ((match = ghCommentRe.exec(htmlString)) !== null) {
    candidates.push({
      source: 'github-pr-comment',
      mediaType: MEDIA_TYPE_HVR,
      rawBase64: match[1].trim(),
    });
  }

  // 4. Email attachment markers: data-hvr-attachment="<base64>"
  const emailAttachmentRe = /data-hvr-attachment=["']([^"']+)["']/gi;
  while ((match = emailAttachmentRe.exec(htmlString)) !== null) {
    candidates.push({
      source: 'email-attachment',
      mediaType: MEDIA_TYPE_HVR,
      rawBase64: match[1].trim(),
    });
  }

  return candidates;
}

export function scanDocumentAndNotify(doc = globalThis.document) {
  if (!doc || !doc.documentElement) return [];
  const html = doc.documentElement.outerHTML ?? '';
  const candidates = scanHtmlForHvrReceipts(html);
  if (
    candidates.length > 0 &&
    typeof globalThis.chrome !== 'undefined' &&
    globalThis.chrome?.runtime?.sendMessage
  ) {
    globalThis.chrome.runtime.sendMessage({
      type: 'HVR_VERIFY_CANDIDATES',
      candidates,
    });
  }
  return candidates;
}

if (typeof globalThis.document !== 'undefined') {
  scanDocumentAndNotify(globalThis.document);
}
