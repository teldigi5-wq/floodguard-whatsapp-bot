# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue containing credentials, Firebase secrets, WhatsApp session material, server addresses, private phone numbers, authentication files, or exploit details.

Report security-sensitive findings privately to the repository owner with the affected component, reproduction steps, impact, and suggested mitigation if available.

## Sensitive data

FloodGuard may interact with:

- Firebase Realtime Database credentials
- WhatsApp linked-device/session data
- AWS/EC2 deployment credentials
- environment variables and server configuration
- subscriber/contact information

These values must never be committed to the repository. Production deployments should use environment variables or secret-management mechanisms and keep authentication/session data outside the source tree.

## Operational guidance

Use least-privilege credentials, restrict server/network access, rotate exposed credentials immediately, and keep dependencies and host packages updated.

If a WhatsApp session or cloud credential is ever exposed, revoke or rotate it before continuing to use the deployment.
