# ChatGPT plan on a personal server

This integration uses Sign in with ChatGPT for an open-source, personal self-hosted instance. It does not upload the Mac's existing Codex login. Commercial hosted offerings require the separate OpenAI partner flow. NoteHub is published under the MIT license. The initial hosted deployment is restricted to its owner; additional users must have separate authorized ChatGPT sessions and the appropriate hosted-service integration.

## Prepared integration

- `npm run chatgpt:connect` performs local OAuth with PKCE, state and nonce validation, verifies the ID token, and stores an owner-only credential record under `~/.config/notehub/chatgpt.json`.
- `NOTEHUB_CHATGPT_CREDENTIALS` selects the protected credential file on the server. The server serializes refreshes and replaces rotating tokens atomically.
- Codex app-server receives the OAuth access token through its environment with the documented ChatGPT-plan provider. No OpenAI API key is required.
- `NOTEHUB_CODEX_REMOTE_EMAILS` must list only the verified NoteHub owner account. Supabase login is required before that user can access Codex.
- Only one server process/replica may own the renewable session.

## Google Cloud personal deployment

The owner authorized an e2-micro VM in us-east1 (South Carolina), with a 30 GB standard persistent disk and Standard network tier. The Free Tier allowance is shared across the billing account. The external IPv4 is billed hourly (approximately $3.36–$3.72/month before tax). Usage beyond free allowances can be billed. The NoteHub-only 4 EUR budget sends alerts; it is not a hard spending cap.

Project: `gen-lang-client-0437462707` (NoteHub Project). Always specify this project in gcloud commands; do not rely on the local default project. `deploy/gcp/startup.sh` installs official Node.js, Codex and Debian Caddy packages. `notehub.service` runs an unprivileged broker with memory limits and one active Codex completion at a time. Node listens only on loopback behind Caddy; the only inbound ports are HTTPS/HTTP and SSH through Google IAP.

After the VM has generated `/var/lib/notehub/credentials/host-id`, complete NoteHub OAuth locally. With the owner's approval, transfer only this app's protected OAuth file via SSH to `/var/lib/notehub/credentials/chatgpt.json`, preserving the VM host ID, owned by notehub with mode 0600. The VM owns all subsequent refreshes. Never transfer the Mac's Codex login, put credentials in GitHub, frontend code, URLs, build logs, or screenshots.

The VM returned an actual ChatGPT response with gpt-6-sol on 2026-10-01. Its protected OAuth connection is owned by notehub with mode 0600. The public API endpoint is `https://notehub.35.207.0.156.sslip.io`. The address is ephemeral: stopping and restarting the VM may change it; do not stop it without updating DNS/API settings. The user's ChatGPT plan limits still apply. A small shared server can accommodate light use, but cannot share the owner's personal ChatGPT allowance with other users.

Official references:

- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
- https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://render.com/docs/disks
