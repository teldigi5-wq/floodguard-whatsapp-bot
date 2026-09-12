# Contributing to FloodGuard WhatsApp Bot

Contributions should keep the bot reliable, explainable, and safe for a real monitoring workflow.

## Development principles

- Never fabricate sensor, rainfall, gate, or device state.
- Preserve stale-data and sensor-error handling.
- Prefer transition-based alerts over repeated notification spam.
- Keep physical gate control on the hardware/controller side unless the project architecture is intentionally changed and documented.
- Never commit credentials, WhatsApp session data, Firebase secrets, phone numbers, or deployment keys.

## Workflow

1. Create a focused branch.
2. Install dependencies.
3. Run existing checks and test the affected bot commands / alert transitions.
4. Update documentation when behavior changes.
5. Use clear commit messages such as `feat:`, `fix:`, `docs:`, `refactor:`, or `test:`.

## Pull requests

Include the problem, implementation, test evidence, operational impact, and any migration/deployment notes. Keep unrelated cleanup separate from functional changes.
