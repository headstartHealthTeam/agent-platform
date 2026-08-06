#!/usr/bin/env python3
"""Self-tests for collect_release_notes.py using throwaway local git repos."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


SCRIPT = Path(__file__).with_name("collect_release_notes.py")


def run(command: list[str], cwd: Path, *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        check=check,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )


def init_repo(root: Path) -> None:
    run(["git", "init", "-q"], root)
    run(["git", "config", "user.email", "skill-test@example.com"], root)
    run(["git", "config", "user.name", "Skill Test"], root)
    run(["git", "config", "commit.gpgsign", "false"], root)
    (root / "app.txt").write_text("base\n", encoding="utf-8")
    run(["git", "add", "app.txt"], root)
    run(["git", "commit", "-q", "-m", "base commit"], root)
    run(["git", "branch", "-M", "main"], root)
    run(["git", "checkout", "-q", "-b", "dev"], root)


def collect(root: Path, *extra_args: str) -> subprocess.CompletedProcess[str]:
    return run(
        [
            sys.executable,
            str(SCRIPT),
            "--base",
            "main",
            "--head",
            "dev",
            "--output",
            str(root / "draft.md"),
            "--debug-json",
            str(root / "debug.json"),
            "--no-gh-commit-pr-lookup",
            *extra_args,
        ],
        root,
        check=False,
    )


def load_debug(root: Path) -> dict[str, object]:
    return json.loads((root / "debug.json").read_text(encoding="utf-8"))


def test_empty_diff() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        result = collect(root)
        assert result.returncode == 1, result.stderr
        assert "No net tree diff" in result.stderr
        assert not (root / "draft.md").exists()
        assert not (root / "debug.json").exists()


def test_pr_attribution() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        (root / "app.txt").write_text("base\nchanged\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: add change HEA-123 (#123)"], root)

        result = collect(root, "--linear-reference", "HEA-123=fixes")
        assert result.returncode == 0, result.stderr
        debug = load_debug(root)
        assert debug["includedPrs"] == [{"number": 123, "files": ["app.txt"]}]
        assert debug["unattributedFiles"] == []
        draft = (root / "draft.md").read_text(encoding="utf-8")
        assert "- #123 PR metadata unavailable - No Linear ID found" in draft
        assert "  - Files: app.txt" in draft
        assert "Fixes HEA-123" in draft


def test_unattributed_file() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        (root / "app.txt").write_text("base\nchanged\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "docs: update app HEA-456"], root)

        result = collect(root, "--linear-reference", "HEA-456=fixes")
        assert result.returncode == 0, result.stderr
        debug = load_debug(root)
        assert debug["includedPrs"] == []
        assert [item["path"] for item in debug["unattributedFiles"]] == ["app.txt"]
        draft = (root / "draft.md").read_text(encoding="utf-8")
        assert "## Unattributed Files" in draft
        assert "`app.txt`" in draft
        assert "Fixes HEA-456" in draft


def test_include_pr_must_explain_diff() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        (root / "app.txt").write_text("base\nchanged\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: add change (#123)"], root)

        result = collect(root, "--include-pr", "456")
        assert result.returncode == 1, result.stderr
        assert "do not explain any net changed files" in result.stderr
        assert not (root / "draft.md").exists()
        assert not (root / "debug.json").exists()


def test_multiple_prs_touch_different_files() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        (root / "api.txt").write_text("api\n", encoding="utf-8")
        run(["git", "add", "api.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: add api HEA-100 (#100)"], root)
        (root / "ui.txt").write_text("ui\n", encoding="utf-8")
        run(["git", "add", "ui.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: add ui HEA-200 (#200)"], root)

        result = collect(
            root,
            "--linear-reference",
            "HEA-100=fixes",
            "--linear-reference",
            "HEA-200=fixes",
        )
        assert result.returncode == 0, result.stderr
        debug = load_debug(root)
        assert debug["includedPrs"] == [
            {"number": 100, "files": ["api.txt"]},
            {"number": 200, "files": ["ui.txt"]},
        ]
        draft = (root / "draft.md").read_text(encoding="utf-8")
        assert "Fixes HEA-100" in draft
        assert "Fixes HEA-200" in draft


def test_multiple_prs_touch_same_file() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        (root / "app.txt").write_text("base\nfirst\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: first app change (#101)"], root)
        (root / "app.txt").write_text("base\nfirst\nsecond\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "fix: second app change (#102)"], root)

        result = collect(root)
        assert result.returncode == 0, result.stderr
        debug = load_debug(root)
        assert debug["includedPrs"] == [
            {"number": 101, "files": ["app.txt"]},
            {"number": 102, "files": ["app.txt"]},
        ]


def test_deleted_file_attribution() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        (root / "app.txt").unlink()
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "fix: remove app file (#301)"], root)

        result = collect(root)
        assert result.returncode == 0, result.stderr
        debug = load_debug(root)
        assert debug["changedFiles"] == [{"status": "D", "path": "app.txt", "oldPath": None}]
        assert debug["includedPrs"] == [{"number": 301, "files": ["app.txt"]}]


def test_renamed_file_attribution() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        run(["git", "mv", "app.txt", "renamed.txt"], root)
        run(["git", "commit", "-q", "-m", "refactor: rename app file (#302)"], root)

        result = collect(root)
        assert result.returncode == 0, result.stderr
        debug = load_debug(root)
        changed_file = debug["changedFiles"][0]
        assert changed_file["status"].startswith("R")
        assert changed_file["path"] == "renamed.txt"
        assert changed_file["oldPath"] == "app.txt"
        assert debug["includedPrs"] == [{"number": 302, "files": ["renamed.txt"]}]


def test_patch_equivalent_commit_excluded_when_other_diff_remains() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        run(["git", "checkout", "-q", "main"], root)
        (root / "app.txt").write_text("base\nsame patch\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "fix: already released patch on main (#401)"], root)
        run(["git", "checkout", "-q", "dev"], root)
        (root / "app.txt").write_text("base\nsame patch\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "fix: already released patch on dev (#401)"], root)
        (root / "new.txt").write_text("new\n", encoding="utf-8")
        run(["git", "add", "new.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: unreleased patch HEA-402 (#402)"], root)

        result = collect(root)
        assert result.returncode == 0, result.stderr
        debug = load_debug(root)
        assert debug["changedFiles"] == [{"status": "A", "path": "new.txt", "oldPath": None}]
        assert debug["includedPrs"] == [{"number": 402, "files": ["new.txt"]}]
        patch_equivalent_subjects = [
            commit["subject"] for commit in debug["patchEquivalentCommits"]
        ]
        assert "fix: already released patch on dev (#401)" in patch_equivalent_subjects
        draft = (root / "draft.md").read_text(encoding="utf-8")
        assert "#401" not in draft.split("## Included PRs", 1)[1].split("## Commit Inventory", 1)[0]
        assert "#402" in draft


def test_merge_commit_shape_is_unattributed_without_github_lookup() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        run(["git", "checkout", "-q", "-b", "feature"], root)
        (root / "feature.txt").write_text("feature\n", encoding="utf-8")
        run(["git", "add", "feature.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: add feature without pr number"], root)
        run(["git", "checkout", "-q", "dev"], root)
        run(["git", "merge", "--no-ff", "-m", "Merge pull request #501 from feature", "feature"], root)

        result = collect(root)
        assert result.returncode == 0, result.stderr
        debug = load_debug(root)
        assert debug["includedPrs"] == []
        assert [item["path"] for item in debug["unattributedFiles"]] == ["feature.txt"]
        draft = (root / "draft.md").read_text(encoding="utf-8")
        assert "## Unattributed Files" in draft
        assert "No Linear issue" in draft


def test_multiple_linear_prefixes() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        (root / "app.txt").write_text("base\nchanged\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: update app HEA-700 OPS-800 (#700)"], root)

        result = collect(
            root,
            "--linear-prefix",
            "OPS",
            "--linear-reference",
            "HEA-700=fixes",
            "--linear-reference",
            "OPS-800=fixes",
        )
        assert result.returncode == 0, result.stderr
        draft = (root / "draft.md").read_text(encoding="utf-8")
        assert "Fixes HEA-700" in draft
        assert "Fixes OPS-800" in draft


def test_unclassified_issue_is_non_closing() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        (root / "app.txt").write_text("base\nchanged\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: update app HEA-810 (#810)"], root)

        result = collect(root)
        assert result.returncode == 0, result.stderr
        draft = (root / "draft.md").read_text(encoding="utf-8")
        assert "Fixes HEA-810" not in draft
        assert "Refs HEA-810" not in draft
        assert "HEA-810 (classification required before PR creation" in draft


def test_mixed_cross_repo_references() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        (root / "app.txt").write_text("base\nchanged\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(
            [
                "git",
                "commit",
                "-q",
                "-m",
                "feat: update release contract HEA-820 HEA-821 (#820)",
            ],
            root,
        )

        result = collect(
            root,
            "--linear-reference",
            "HEA-820=refs:website production promotion remains",
            "--linear-reference",
            "HEA-821=fixes",
        )
        assert result.returncode == 0, result.stderr
        draft = (root / "draft.md").read_text(encoding="utf-8")
        assert "Refs HEA-820 - website production promotion remains" in draft
        assert "Fixes HEA-821" in draft


def test_refs_requires_reason() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        (root / "app.txt").write_text("base\nchanged\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: update app HEA-830 (#830)"], root)

        result = collect(root, "--linear-reference", "HEA-830=refs")
        assert result.returncode == 2
        assert "refs requires a reason" in result.stderr
        assert not (root / "draft.md").exists()


def test_reference_must_match_release_evidence() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        init_repo(root)
        (root / "app.txt").write_text("base\nchanged\n", encoding="utf-8")
        run(["git", "add", "app.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: update app HEA-840 (#840)"], root)

        result = collect(root, "--linear-reference", "HEA-999=fixes")
        assert result.returncode == 2
        assert "do not match the release evidence: HEA-999" in result.stderr
        assert not (root / "draft.md").exists()


def test_custom_base_head_branch_names() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        run(["git", "init", "-q"], root)
        run(["git", "config", "user.email", "skill-test@example.com"], root)
        run(["git", "config", "user.name", "Skill Test"], root)
        run(["git", "config", "commit.gpgsign", "false"], root)
        (root / "service.txt").write_text("base\n", encoding="utf-8")
        run(["git", "add", "service.txt"], root)
        run(["git", "commit", "-q", "-m", "base commit"], root)
        run(["git", "branch", "-M", "production"], root)
        run(["git", "checkout", "-q", "-b", "integration"], root)
        (root / "service.txt").write_text("base\nintegration\n", encoding="utf-8")
        run(["git", "add", "service.txt"], root)
        run(["git", "commit", "-q", "-m", "feat: integration branch change (#900)"], root)

        result = run(
            [
                sys.executable,
                str(SCRIPT),
                "--base",
                "production",
                "--head",
                "integration",
                "--output",
                str(root / "draft.md"),
                "--debug-json",
                str(root / "debug.json"),
                "--no-gh-commit-pr-lookup",
            ],
            root,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        debug = load_debug(root)
        assert debug["includedPrs"] == [{"number": 900, "files": ["service.txt"]}]
        draft = (root / "draft.md").read_text(encoding="utf-8")
        assert "production..integration" in draft


def main() -> int:
    tests = [
        test_empty_diff,
        test_pr_attribution,
        test_unattributed_file,
        test_include_pr_must_explain_diff,
        test_multiple_prs_touch_different_files,
        test_multiple_prs_touch_same_file,
        test_deleted_file_attribution,
        test_renamed_file_attribution,
        test_patch_equivalent_commit_excluded_when_other_diff_remains,
        test_merge_commit_shape_is_unattributed_without_github_lookup,
        test_multiple_linear_prefixes,
        test_unclassified_issue_is_non_closing,
        test_mixed_cross_repo_references,
        test_refs_requires_reason,
        test_reference_must_match_release_evidence,
        test_custom_base_head_branch_names,
    ]
    for test in tests:
        test()
        print(f"{test.__name__}=ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
