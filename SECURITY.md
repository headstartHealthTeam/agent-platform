# Security Policy

## Supported Versions

Security fixes are made on the latest `main` branch and included in the next applicable semantic
release. Older commits and released tags may not receive backports.

## Reporting A Vulnerability

Report suspected vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/headstartHealthTeam/agent-platform/security/advisories/new).
Do not open a public issue, discussion, or pull request for an undisclosed vulnerability.

Include the affected component, reproduction steps, impact, and any suggested mitigation. Share only
the minimum evidence needed to reproduce the issue. Do not include credentials, access tokens, PHI,
production records, or private downloaded files in the report.

If the private reporting form is unavailable, contact a Headstart Health maintainer through an
already established private channel and ask for a secure reporting route. Do not send sensitive
details until that route is confirmed.

## Accidental Secret Or Sensitive-Data Exposure

Treat any committed credential as compromised even if it was removed in a later commit. Revoke or
rotate it in the owning system before discussing repository cleanup. If PHI or another regulated
record may be involved, stop sharing or copying the material and escalate through Headstart's
approved security and privacy channels.

Repository scanners reduce accidental exposure but do not establish that content is safe to publish.
Contributors remain responsible for reviewing every change against the
[security and data-handling standard](standards/security-and-data-handling.md).
