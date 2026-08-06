#!/usr/bin/env python3
"""Draft a dev-to-main release PR body from a git comparison range."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


PR_NUMBER_RE = re.compile(r"(?:\(#(?P<paren_number>\d+)\)|pull request #(?P<merge_number>\d+))", re.IGNORECASE)
_GH_COMMIT_PR_CACHE: dict[str, list[int]] = {}


@dataclass(frozen=True)
class Commit:
    sha: str
    subject: str
    body: str


@dataclass(frozen=True)
class ChangedFile:
    status: str
    path: str
    old_path: str | None = None


@dataclass(frozen=True)
class Attribution:
    pr_files: dict[int, list[str]]
    unattributed_files: list[str]
    file_commits: dict[str, list[Commit]]
    commit_pr_numbers: dict[str, list[int]]


@dataclass(frozen=True)
class LinearReference:
    action: str
    reason: str | None = None


def run(command: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=check,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )


def read_commits(base: str, head: str, first_parent: bool) -> list[Commit]:
    command = [
        "git",
        "log",
        "--reverse",
        "--format=%H%x09%s%x09%b%x1e",
        f"{base}..{head}",
    ]
    if first_parent:
        command.insert(2, "--first-parent")

    output = run(command).stdout
    commits: list[Commit] = []
    for record in output.split("\x1e"):
        record = record.strip()
        if not record:
            continue
        parts = record.split("\t", 2)
        if len(parts) < 2:
            continue
        sha = parts[0].strip()
        subject = parts[1].strip()
        body = parts[2].strip() if len(parts) > 2 else ""
        commits.append(Commit(sha=sha, subject=subject, body=body))
    return commits


def read_commit(sha: str) -> Commit | None:
    result = run(["git", "show", "-s", "--format=%H%x09%s%x09%b", sha], check=False)
    if result.returncode != 0:
        return None
    parts = result.stdout.rstrip("\n").split("\t", 2)
    if len(parts) < 2:
        return None
    return Commit(
        sha=parts[0].strip(),
        subject=parts[1].strip(),
        body=parts[2].strip() if len(parts) > 2 else "",
    )


def read_patch_unique_shas(base: str, head: str, first_parent: bool) -> set[str]:
    command = [
        "git",
        "log",
        "--cherry-pick",
        "--right-only",
        "--format=%H",
        f"{base}...{head}",
    ]
    if first_parent:
        command.insert(2, "--first-parent")

    return {line.strip() for line in run(command).stdout.splitlines() if line.strip()}


def read_changed_files(base: str, head: str) -> list[ChangedFile]:
    output = run(["git", "diff", "--name-status", f"{base}..{head}"]).stdout
    changed_files: list[ChangedFile] = []
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        status = parts[0].strip()
        if status.startswith("R") or status.startswith("C"):
            if len(parts) >= 3:
                changed_files.append(ChangedFile(status=status, old_path=parts[1], path=parts[2]))
            continue
        changed_files.append(ChangedFile(status=status, path=parts[1]))
    return changed_files


def read_file_commit_shas(base: str, head: str, changed_file: ChangedFile) -> list[str]:
    paths = [changed_file.path]
    if changed_file.old_path:
        paths.append(changed_file.old_path)

    shas: list[str] = []
    seen: set[str] = set()
    for path in paths:
        result = run(
            ["git", "log", "--format=%H", f"{base}..{head}", "--", path],
            check=False,
        )
        if result.returncode != 0:
            continue
        for line in result.stdout.splitlines():
            sha = line.strip()
            if sha and sha not in seen:
                seen.add(sha)
                shas.append(sha)
    return shas


def build_attribution(
    base: str,
    head: str,
    changed_files: list[ChangedFile],
    commits: list[Commit],
    patch_unique_shas: set[str],
    use_gh_lookup: bool,
) -> Attribution:
    commit_by_sha = {commit.sha: commit for commit in commits}
    pr_files: dict[int, set[str]] = {}
    unattributed_files: list[str] = []
    file_commits: dict[str, list[Commit]] = {}
    commit_pr_numbers_by_sha: dict[str, list[int]] = {}

    for changed_file in changed_files:
        file_shas = [
            sha for sha in read_file_commit_shas(base, head, changed_file) if sha in patch_unique_shas
        ]
        commits_for_file: list[Commit] = []
        for sha in file_shas:
            commit = commit_by_sha.get(sha) or read_commit(sha)
            if commit:
                commits_for_file.append(commit)
                commit_by_sha.setdefault(sha, commit)
        file_commits[changed_file.path] = commits_for_file

        attributed = False
        for commit in commits_for_file:
            numbers = commit_pr_numbers(commit, use_gh_lookup=use_gh_lookup)
            commit_pr_numbers_by_sha[commit.sha] = numbers
            for number in numbers:
                pr_files.setdefault(number, set()).add(changed_file.path)
                attributed = True

        if not attributed:
            unattributed_files.append(changed_file.path)

    return Attribution(
        pr_files={number: sorted(files) for number, files in sorted(pr_files.items())},
        unattributed_files=sorted(unattributed_files),
        file_commits=file_commits,
        commit_pr_numbers=commit_pr_numbers_by_sha,
    )



def split_patch_unique_commits(
    raw_commits: list[Commit],
    patch_unique_shas: set[str],
) -> tuple[list[Commit], list[Commit]]:
    patch_unique_commits = [commit for commit in raw_commits if commit.sha in patch_unique_shas]
    patch_equivalent_commits = [commit for commit in raw_commits if commit.sha not in patch_unique_shas]
    return patch_unique_commits, patch_equivalent_commits


def linear_id_regex(prefixes: list[str]) -> re.Pattern[str]:
    escaped = "|".join(re.escape(prefix.upper()) for prefix in prefixes)
    return re.compile(rf"\b(?:{escaped})-\d+\b")


def extract_linear_ids(values: Iterable[str], pattern: re.Pattern[str]) -> list[str]:
    ids: set[str] = set()
    for value in values:
        ids.update(match.group(0) for match in pattern.finditer(value or ""))
    return sorted(ids)


def extract_pr_numbers(commits: Iterable[Commit]) -> list[int]:
    numbers: set[int] = set()
    for commit in commits:
        match = PR_NUMBER_RE.search(commit.subject)
        if match:
            numbers.add(int(match.group("paren_number") or match.group("merge_number")))
    return sorted(numbers)


def commit_pr_number(commit: Commit) -> int | None:
    match = PR_NUMBER_RE.search(commit.subject)
    if not match:
        return None
    return int(match.group("paren_number") or match.group("merge_number"))


def gh_commit_pr_numbers(sha: str) -> list[int]:
    if sha in _GH_COMMIT_PR_CACHE:
        return _GH_COMMIT_PR_CACHE[sha]

    result = run(
        [
            "gh",
            "api",
            "-H",
            "Accept: application/vnd.github+json",
            f"repos/:owner/:repo/commits/{sha}/pulls",
            "--jq",
            ".[].number",
        ],
        check=False,
    )
    if result.returncode != 0:
        _GH_COMMIT_PR_CACHE[sha] = []
        return []

    numbers: list[int] = []
    for line in result.stdout.splitlines():
        try:
            numbers.append(int(line.strip()))
        except ValueError:
            continue

    _GH_COMMIT_PR_CACHE[sha] = sorted(set(numbers))
    return _GH_COMMIT_PR_CACHE[sha]


def commit_pr_numbers(commit: Commit, *, use_gh_lookup: bool) -> list[int]:
    number = commit_pr_number(commit)
    numbers = [number] if number is not None else []
    if use_gh_lookup:
        numbers.extend(gh_commit_pr_numbers(commit.sha))
    return sorted(set(numbers))


def gh_pr_view(number: int) -> dict[str, object] | None:
    fields = [
        "number",
        "title",
        "url",
        "body",
        "headRefName",
        "baseRefName",
        "mergedAt",
        "mergeCommit",
        "labels",
        "author",
    ]
    result = run(
        ["gh", "pr", "view", str(number), "--json", ",".join(fields)],
        check=False,
    )
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def summarize_pr(pr: dict[str, object], pattern: re.Pattern[str]) -> tuple[str, list[str]]:
    title = str(pr.get("title") or "").strip()
    body = str(pr.get("body") or "")
    head_ref = str(pr.get("headRefName") or "")
    labels = pr.get("labels") if isinstance(pr.get("labels"), list) else []
    label_names = [
        str(label.get("name"))
        for label in labels
        if isinstance(label, dict) and label.get("name")
    ]
    linear_ids = extract_linear_ids([title, body, head_ref, *label_names], pattern)
    return title, linear_ids


def parse_linear_title_values(values: list[str]) -> dict[str, str]:
    titles: dict[str, str] = {}
    for value in values:
        issue_id, separator, title = value.partition("=")
        if not separator:
            raise ValueError(f"Invalid --linear-title value {value!r}; expected HEA-123=Issue title")
        issue_id = issue_id.strip().upper()
        title = title.strip()
        if not issue_id or not title:
            raise ValueError(f"Invalid --linear-title value {value!r}; issue ID and title are required")
        titles[issue_id] = title
    return titles


def read_linear_title_file(path: str | None) -> dict[str, str]:
    if not path:
        return {}

    raw = Path(path).read_text(encoding="utf-8")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid --linear-title-file JSON: {error}") from error

    if not isinstance(payload, dict):
        raise ValueError("--linear-title-file must contain a JSON object mapping issue IDs to titles")

    titles: dict[str, str] = {}
    for issue_id, title in payload.items():
        if not isinstance(issue_id, str) or not isinstance(title, str):
            raise ValueError("--linear-title-file keys and values must be strings")
        normalized_issue_id = issue_id.strip().upper()
        normalized_title = title.strip()
        if normalized_issue_id and normalized_title:
            titles[normalized_issue_id] = normalized_title
    return titles


def infer_linear_titles_from_prs(
    prs: list[dict[str, object]],
    pattern: re.Pattern[str],
) -> dict[str, str]:
    titles: dict[str, str] = {}
    for pr in prs:
        title, linear_ids = summarize_pr(pr, pattern)
        if not title:
            continue
        for issue_id in linear_ids:
            titles.setdefault(issue_id, title)
    return titles


def collect_linear_ids(
    prs: list[dict[str, object]],
    commits: list[Commit],
    pattern: re.Pattern[str],
) -> list[str]:
    pr_linear_ids: list[str] = []
    for pr in prs:
        _, linear_ids = summarize_pr(pr, pattern)
        pr_linear_ids.extend(linear_ids)

    commit_linear_ids = extract_linear_ids(
        (part for commit in commits for part in (commit.subject, commit.body)),
        pattern,
    )
    return sorted(set(pr_linear_ids + commit_linear_ids))


def parse_linear_reference_values(
    values: list[str],
    pattern: re.Pattern[str],
) -> dict[str, LinearReference]:
    references: dict[str, LinearReference] = {}
    for value in values:
        issue_id, separator, raw_disposition = value.partition("=")
        if not separator:
            raise ValueError(
                f"Invalid --linear-reference value {value!r}; expected "
                "HEA-123=fixes or HEA-123=refs:reason"
            )

        issue_id = issue_id.strip().upper()
        disposition, reason_separator, reason = raw_disposition.partition(":")
        action = disposition.strip().lower()
        reason = reason.strip()

        if pattern.fullmatch(issue_id) is None:
            raise ValueError(f"Invalid Linear issue ID in --linear-reference: {issue_id!r}")
        if action == "fixes":
            if reason_separator:
                raise ValueError(
                    f"Invalid --linear-reference value {value!r}; fixes does not accept a reason"
                )
            references[issue_id] = LinearReference(action="fixes")
            continue
        if action == "refs":
            if not reason_separator or not reason:
                raise ValueError(
                    f"Invalid --linear-reference value {value!r}; refs requires a reason"
                )
            references[issue_id] = LinearReference(action="refs", reason=reason)
            continue
        raise ValueError(
            f"Invalid --linear-reference value {value!r}; disposition must be fixes or refs"
        )
    return references


def format_linear_issue(issue_id: str, linear_titles: dict[str, str]) -> str:
    title = linear_titles.get(issue_id)
    if title:
        return f"{issue_id} - {title}"
    return issue_id


def format_linear_reference(
    issue_id: str,
    linear_titles: dict[str, str],
    linear_references: dict[str, LinearReference],
) -> str:
    reference = linear_references.get(issue_id)
    formatted_issue = format_linear_issue(issue_id, linear_titles)
    if reference is None:
        return (
            f"- {formatted_issue} (classification required before PR creation: "
            "Fixes or Refs with reason)"
        )
    if reference.action == "fixes":
        return f"Fixes {formatted_issue}"

    reason = reference.reason or "remaining production dependency"
    title = linear_titles.get(issue_id)
    if title:
        return f"Refs {issue_id} - {title}; {reason}"
    return f"Refs {issue_id} - {reason}"


def format_release_notes(
    prs: list[dict[str, object]],
    commits: list[Commit],
    linear_pattern: re.Pattern[str],
) -> list[str]:
    notes: list[str] = []
    for pr in prs:
        title, _ = summarize_pr(pr, linear_pattern)
        if title:
            notes.append(f"- {title}")

    if not notes:
        for commit in commits[:10]:
            notes.append(f"- {commit.subject}")

    return notes or ["- Promote tested changes from `dev` to `main`."]


def render_markdown(
    base: str,
    head: str,
    commits: list[Commit],
    patch_equivalent_commits: list[Commit],
    prs: list[dict[str, object]],
    included_pr_numbers: list[int],
    attribution: Attribution,
    linear_pattern: re.Pattern[str],
    linear_titles: dict[str, str],
    linear_references: dict[str, LinearReference],
) -> str:
    linear_ids = collect_linear_ids(prs, commits, linear_pattern)
    issue_titles = infer_linear_titles_from_prs(prs, linear_pattern)
    issue_titles.update(linear_titles)
    pr_numbers = set(included_pr_numbers)

    matched_commit_shas: set[str] = set()
    for commit in commits:
        numbers = attribution.commit_pr_numbers.get(commit.sha)
        if numbers is None:
            number = commit_pr_number(commit)
            numbers = [number] if number is not None else []
        if any(number in pr_numbers for number in numbers):
            matched_commit_shas.add(commit.sha)

    unmatched_commits = [commit for commit in commits if commit.sha not in matched_commit_shas]

    lines: list[str] = []
    lines.append("## Summary")
    lines.append("")
    lines.append(f"Promotes patch-unique tested changes from `{head}` to `main`.")
    lines.append("")
    lines.append("## Release Notes")
    lines.append("")
    lines.extend(format_release_notes(prs, commits, linear_pattern))
    lines.append("")
    lines.append("## Included Linear Issues")
    lines.append("")
    if linear_ids:
        lines.extend(
            format_linear_reference(issue_id, issue_titles, linear_references)
            for issue_id in linear_ids
        )
    else:
        lines.append("No Linear issue")
    lines.append("")
    lines.append("## Included PRs")
    lines.append("")
    if included_pr_numbers:
        prs_by_number = {
            int(pr["number"]): pr for pr in prs if isinstance(pr.get("number"), int)
        }
        for number in included_pr_numbers:
            pr = prs_by_number.get(number, {"number": number, "title": "PR metadata unavailable"})
            title, ids = summarize_pr(pr, linear_pattern)
            url = pr.get("url") or ""
            id_text = ", ".join(format_linear_issue(issue_id, issue_titles) for issue_id in ids)
            if not id_text:
                id_text = "No Linear ID found"
            suffix = f" - {url}" if url else ""
            lines.append(f"- #{number} {title} - {id_text}{suffix}")
            files = attribution.pr_files.get(number, [])
            if files:
                lines.append(f"  - Files: {', '.join(files[:12])}")
                if len(files) > 12:
                    lines.append(f"  - Additional files: {len(files) - 12}")
    else:
        lines.append("No GitHub PR metadata found from commit subjects.")
    lines.append("")
    if attribution.unattributed_files:
        lines.append("## Unattributed Files")
        lines.append("")
        for file_path in attribution.unattributed_files:
            commits_for_file = attribution.file_commits.get(file_path, [])
            if commits_for_file:
                commit_text = ", ".join(
                    f"`{commit.sha[:7]}` {commit.subject}" for commit in commits_for_file[:3]
                )
                lines.append(f"- `{file_path}` - touched by {commit_text}")
            else:
                lines.append(f"- `{file_path}` - no patch-unique commit attribution found")
        lines.append("")
    lines.append("## Commit Inventory")
    lines.append("")
    if commits:
        for commit in commits:
            lines.append(f"- `{commit.sha[:7]}` {commit.subject}")
    else:
        lines.append("No commits found in release range.")
    lines.append("")
    if unmatched_commits and prs:
        lines.append("## Unmatched Commits")
        lines.append("")
        for commit in unmatched_commits:
            lines.append(f"- `{commit.sha[:7]}` {commit.subject}")
        lines.append("")
    if patch_equivalent_commits:
        lines.append("## Already Released / Ancestry Note")
        lines.append("")
        lines.append(
            f"- The raw `{base}..{head}` ancestry includes commits that are already "
            "patch-equivalent on `main`."
        )
        lines.append(
            "- These are excluded from Release Notes, Included Linear Issues, and Included PRs."
        )
        lines.append(
            f"- Patch-unique check: `git log --cherry-pick --right-only {base}...{head}`."
        )
        for commit in patch_equivalent_commits:
            lines.append(f"- Excluded `{commit.sha[:7]}` {commit.subject}")
        lines.append("")
    lines.append("## Risk / Review Focus")
    lines.append("")
    lines.append("- Review the included PR list and unmatched commits for release scope.")
    lines.append("- Confirm no unintended changes are included in the branch comparison.")
    lines.append("")
    lines.append("## Testing")
    lines.append("")
    lines.append("- Tested on `dev` before release.")
    lines.append("- CI pending on this PR.")
    lines.append("")
    lines.append("## Compare")
    lines.append("")
    lines.append(f"- Patch-unique range: `git log --cherry-pick --right-only {base}...{head}`")
    lines.append(f"- Raw ancestry range: `{base}..{head}`")
    return "\n".join(lines) + "\n"


def write_debug_json(
    path: str,
    changed_files: list[ChangedFile],
    commits: list[Commit],
    patch_equivalent_commits: list[Commit],
    included_pr_numbers: list[int],
    attribution: Attribution,
) -> None:
    payload = {
        "changedFiles": [
            {
                "status": changed_file.status,
                "path": changed_file.path,
                "oldPath": changed_file.old_path,
            }
            for changed_file in changed_files
        ],
        "includedPrs": [
            {
                "number": number,
                "files": attribution.pr_files.get(number, []),
            }
            for number in included_pr_numbers
        ],
        "unattributedFiles": [
            {
                "path": file_path,
                "commits": [
                    {
                        "sha": commit.sha,
                        "subject": commit.subject,
                        "prNumbers": attribution.commit_pr_numbers.get(commit.sha, []),
                    }
                    for commit in attribution.file_commits.get(file_path, [])
                ],
            }
            for file_path in attribution.unattributed_files
        ],
        "fileAttribution": {
            file_path: [
                {
                    "sha": commit.sha,
                    "subject": commit.subject,
                    "prNumbers": attribution.commit_pr_numbers.get(commit.sha, []),
                }
                for commit in commits_for_file
            ]
            for file_path, commits_for_file in sorted(attribution.file_commits.items())
        },
        "commitInventory": [
            {"sha": commit.sha, "subject": commit.subject} for commit in commits
        ],
        "patchEquivalentCommits": [
            {"sha": commit.sha, "subject": commit.subject}
            for commit in patch_equivalent_commits
        ],
    }
    Path(path).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="origin/main", help="Base ref, usually origin/main")
    parser.add_argument("--head", default="origin/dev", help="Head ref, usually origin/dev")
    parser.add_argument("--output", help="Markdown output path")
    parser.add_argument(
        "--linear-prefix",
        action="append",
        default=["HEA"],
        help="Linear issue prefix to extract. Defaults to HEA. Repeat for multiple prefixes.",
    )
    parser.add_argument(
        "--all-commits",
        action="store_true",
        help="Use all commits instead of first-parent release commits",
    )
    parser.add_argument(
        "--include-pr",
        action="append",
        type=int,
        default=[],
        help=(
            "Limit release notes, Linear IDs, included PRs, and commit inventory to an "
            "explicit contributing PR number. Repeat for multiple PRs."
        ),
    )
    parser.add_argument(
        "--linear-title",
        action="append",
        default=[],
        help=(
            "Add a Linear issue title in ISSUE-ID=Title format. Repeat for multiple issues. "
            "Example: --linear-title \"HEA-123=Retire stale feature flag\""
        ),
    )
    parser.add_argument(
        "--linear-title-file",
        help="JSON object mapping Linear issue IDs to titles, for example {\"HEA-123\":\"Title\"}.",
    )
    parser.add_argument(
        "--linear-reference",
        action="append",
        default=[],
        help=(
            "Classify one included issue as ISSUE-ID=fixes or ISSUE-ID=refs:reason. "
            "Repeat for multiple issues. Unclassified issues remain non-closing in the draft."
        ),
    )
    parser.add_argument(
        "--debug-json",
        help=(
            "Optional path for machine-readable attribution details. Useful for dry-run "
            "validation without parsing Markdown."
        ),
    )
    parser.add_argument(
        "--no-gh-commit-pr-lookup",
        action="store_true",
        help=(
            "Disable GitHub commit-to-PR lookup. Useful for offline fixture tests or when "
            "commit subjects already contain PR numbers."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    first_parent = not args.all_commits
    changed_files = read_changed_files(args.base, args.head)
    if not changed_files:
        print(
            f"No net tree diff between {args.base} and {args.head}; nothing new to release.",
            file=sys.stderr,
        )
        return 1

    raw_commits = read_commits(args.base, args.head, first_parent=first_parent)
    patch_unique_shas = read_patch_unique_shas(args.base, args.head, first_parent=first_parent)
    commits, patch_equivalent_commits = split_patch_unique_commits(raw_commits, patch_unique_shas)
    attribution_raw_commits = read_commits(args.base, args.head, first_parent=False)
    attribution_patch_unique_shas = read_patch_unique_shas(
        args.base,
        args.head,
        first_parent=False,
    )
    attribution = build_attribution(
        args.base,
        args.head,
        changed_files,
        attribution_raw_commits,
        attribution_patch_unique_shas,
        use_gh_lookup=not args.no_gh_commit_pr_lookup,
    )
    if args.include_pr:
        included_pr_numbers = set(args.include_pr)
        commits = [
            commit
            for commit in commits
            if (number := commit_pr_number(commit)) is not None and number in included_pr_numbers
        ]
        patch_equivalent_commits = []
        pr_numbers = sorted(number for number in included_pr_numbers if number in attribution.pr_files)
        if not pr_numbers:
            requested = ", ".join(f"#{number}" for number in sorted(included_pr_numbers))
            print(
                f"Requested PR(s) {requested} do not explain any net changed files in "
                f"{args.base}..{args.head}; nothing to draft for that selection.",
                file=sys.stderr,
            )
            return 1
    else:
        pr_numbers = sorted(attribution.pr_files)
    prs = [pr for number in pr_numbers if (pr := gh_pr_view(number))]
    linear_pattern = linear_id_regex(args.linear_prefix)
    try:
        linear_titles = read_linear_title_file(args.linear_title_file)
        linear_titles.update(parse_linear_title_values(args.linear_title))
        linear_references = parse_linear_reference_values(args.linear_reference, linear_pattern)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2

    detected_linear_ids = collect_linear_ids(prs, commits, linear_pattern)
    unexpected_references = sorted(set(linear_references) - set(detected_linear_ids))
    if unexpected_references:
        unexpected = ", ".join(unexpected_references)
        print(
            f"Linear reference classifications do not match the release evidence: {unexpected}",
            file=sys.stderr,
        )
        return 2

    markdown = render_markdown(
        args.base,
        args.head,
        commits,
        patch_equivalent_commits,
        prs,
        pr_numbers,
        attribution,
        linear_pattern,
        linear_titles,
        linear_references,
    )

    if args.debug_json:
        write_debug_json(
            args.debug_json,
            changed_files,
            commits,
            patch_equivalent_commits,
            pr_numbers,
            attribution,
        )

    if args.output:
        Path(args.output).write_text(markdown, encoding="utf-8")
    else:
        sys.stdout.write(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
