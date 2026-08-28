# Repository Agent Rules

## Git and documentation

- Every Git commit must include a corresponding entry in `CHANGELOG.md`.
- Update `README.md` when a change affects user-visible behavior, public API usage, configuration, deployment, or supported features.
- Keep each commit focused and use a descriptive conventional commit message.
- Before committing, inspect the staged diff and run the relevant tests and type checks.

## Scope

- Preserve existing user changes and unrelated work.
- Keep advanced crawler features opt-in with conservative limits.
- Treat URLs, page content, scripts, schemas, and webhook targets as untrusted input.
