# PassVault

PassVault is a local-first Electron password vault with optional Chrome and Firefox extensions.

## Requirements

- Node.js 20+
- macOS (the current package configuration targets macOS)

## Run

\`\`\`bash
npm ci
npm start
\`\`\`

Create a master password of at least 12 characters. The vault is encrypted using AES-256-GCM with a key derived using scrypt. The master password is not stored.

## Browser extensions

Load the unpacked \`chrome-extension/\` or \`firefox-extension/\` directory in the relevant browser.

1. Open PassVault and unlock the vault.
2. Copy the API token from the app.
3. Open the extension popup and save the token.
4. When a login form is submitted, the extension asks before saving detected credentials.

The extension communicates only with the local PassVault service on \`127.0.0.1:47823\`. The service requires a bearer token, binds to loopback, restricts browser origins, validates entries, and requires an exact site hostname for lookups.

The extension currently requests access to all websites because credential capture is intended to work on arbitrary login pages. Only approve/install it if you are comfortable with that permission scope. Capture prompts are shown before credentials are saved.

## Security behavior

- AES-256-GCM encrypted vault file.
- scrypt-based master-key derivation.
- 12-character minimum master password.
- Atomic vault writes and restrictive file permissions.
- Five-minute inactivity auto-lock.
- Loopback-only local API with bearer authentication.
- Constant-time token comparison.
- Exact-domain lookup and request-size/input validation.
- Renderer and extension credential values are inserted as text, not HTML.

This is a personal project, not a professionally audited password manager. Do not use it as the sole storage location for critical credentials until it has received independent security review and end-to-end testing.

## Checks

\`\`\`bash
npm ci
npm run check
npm test
\`\`\`

## Build

\`\`\`bash
npm run build
\`\`\`
