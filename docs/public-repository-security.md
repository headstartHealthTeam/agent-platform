# Public Repository Security

This document defines the required defense-in-depth controls for the public Agent Platform
repository. It is a configuration contract, not a record of the repository's current GitHub state.
Verify live settings in GitHub before a release or after an ownership, plan, or policy change.

## Source-Controlled Controls

- `pnpm check:secrets` runs Secretlint's recommended provider rules across every non-ignored file in
  the repository. It covers documentation, skills, workflow manifests, fixtures, scripts, and code;
  it is not limited to extensions supported by ESLint.
- The fast pre-commit lane and the complete `pnpm qa` lane both run the repository-wide scan. CI
  runs complete QA on every pull request to `main` and every push to `main`.
- Third-party GitHub Actions are pinned to full commit SHAs. The adjacent version comments preserve
  update context without making mutable tags executable.
- Workflow permissions remain explicitly least-privileged. A new permission must be justified by
  the smallest job that needs it.
- [`SECURITY.md`](../SECURITY.md) directs vulnerability reports to a private channel.

The repository scan respects `.gitignore`, so local credentials such as `.env` files are outside its
input and must remain ignored. It scans the current working tree, not Git history, GitHub issues,
pull request text, discussions, or wikis. GitHub's server-side controls cover those additional
surfaces.

## Required GitHub Settings

Repository administrators must enable and retain:

1. Secret scanning for the repository's complete history and collaboration surfaces.
2. Push protection for contributors and supported GitHub write paths.
3. Non-provider secret patterns and validity checks when the organization's GitHub plan makes them
   available and their data-handling terms are approved.
4. Private vulnerability reporting.
5. Dependabot alerts and Dependabot security updates.
6. Branch rules that require a pull request, approval after the latest push, resolved review
   conversations, linear history, the stable `Required` status check, and no force pushes or branch
   deletion.

Use GitHub's live repository settings as the source of truth. After changing a setting, verify the
effective configuration rather than relying only on the successful API response or UI action.

## Handling Findings

Do not suppress a finding merely to make a check pass. First determine whether the value is an
actual credential or sensitive record, an unmistakably synthetic fixture, or a false positive.

- For a credential, revoke or rotate it in the owning system before repository cleanup. Assume the
  public value has been copied.
- For PHI, production records, or private document contents, stop redistribution and follow the
  approved privacy incident process.
- For a necessary synthetic fixture, rewrite it so it cannot authenticate and is visibly fake.
  Prefer constructing credential-shaped test data from separate fragments so the repository-wide
  scan still protects the committed source.
- For an unavoidable false positive, add the narrowest rule-specific suppression with a reviewable
  explanation. Never allowlist a real credential value.

GitHub documents the complementary behavior of
[secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning),
[push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection),
and
[immutable action references](https://docs.github.com/en/actions/reference/security/secure-use#using-third-party-actions).

## Related Guidance

- [Documentation hub](README.md)
- [Security and data handling](../standards/security-and-data-handling.md)
- [Testing and release](../standards/testing-and-release.md)
