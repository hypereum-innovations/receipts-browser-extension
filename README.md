> **Retired preview, not maintained.**

# `receipts-browser-extension` — Chrome/Firefox Manifest V3 Offline `.hvr` Verifier

SPDX-License-Identifier: Apache-2.0

Manifest V3 browser extension that automatically discovers and verifies Hivemind Receipts (`.hvr` / `application/vnd.hivemind.receipt+cose`) completely offline:

- `<script type="application/vnd.hivemind.receipt+cose">` blocks embedded in web pages
- `data-hvr-receipt` DOM attributes
- GitHub Pull Request comments and check-runs (`<!-- hivemind-receipt: ... -->`)
- Webmail `.hvr` attachments (`data-hvr-attachment`)
