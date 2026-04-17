#!/usr/bin/env python3
"""Maintain the docs/bug-loop/issues.md ledger."""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_LEDGER = REPO_ROOT / "docs" / "bug-loop" / "issues.md"
STATUS_ORDER = {
    "open": 0,
    "blocked": 1,
    "quarantined": 2,
    "fixed": 3,
}


@dataclass
class Issue:
    issue_id: str
    title: str
    status: str = "open"
    defcon: int = 3
    surface: str = "runtime"
    blocking: str = "no"
    fix_attempts: int = 0
    last_seen: str = ""
    evidence: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def unresolved(self) -> bool:
        return self.status != "fixed"


def now_iso() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()


def new_issue_id() -> str:
    return "BUG-{}".format(datetime.now().astimezone().strftime("%Y%m%d-%H%M%S"))


def normalize_lines(lines: list[str]) -> list[str]:
    return [line.rstrip() for line in lines]


def seed_content() -> str:
    return """# Recursive Bug Squash Issues

This file is maintained by `.agents/skills/recursive-bug-squash`.

## Open Queue

_No open issues._

## Resolved

_No resolved issues._
"""


def ensure_ledger(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(seed_content())


def parse_section(name: str, text: str) -> list[Issue]:
    section_match = re.search(
        rf"^## {re.escape(name)}\n(?P<body>.*?)(?=^## |\Z)",
        text,
        flags=re.MULTILINE | re.DOTALL,
    )
    if not section_match:
        return []

    body = section_match.group("body").strip()
    if not body or body.startswith("_No "):
        return []

    raw_blocks = re.split(r"(?=^### BUG-)", body, flags=re.MULTILINE)
    issues: list[Issue] = []
    for raw_block in raw_blocks:
        block = raw_block.strip()
        if not block:
            continue
        issues.append(parse_issue_block(block))
    return issues


def parse_issue_block(block: str) -> Issue:
    lines = normalize_lines(block.splitlines())
    heading = lines[0]
    match = re.match(r"^### (?P<issue_id>BUG-[^ ]+) — (?P<title>.+)$", heading)
    if not match:
        raise ValueError(f"Unrecognized issue heading: {heading}")

    issue = Issue(
        issue_id=match.group("issue_id"),
        title=match.group("title").strip(),
    )

    i = 1
    while i < len(lines):
        line = lines[i]
        if line.startswith("- status: "):
            issue.status = line.removeprefix("- status: ").strip()
        elif line.startswith("- defcon: "):
            issue.defcon = int(line.removeprefix("- defcon: ").strip())
        elif line.startswith("- surface: "):
            issue.surface = line.removeprefix("- surface: ").strip()
        elif line.startswith("- blocking: "):
            issue.blocking = line.removeprefix("- blocking: ").strip()
        elif line.startswith("- fix_attempts: "):
            issue.fix_attempts = int(line.removeprefix("- fix_attempts: ").strip())
        elif line.startswith("- last_seen: "):
            issue.last_seen = line.removeprefix("- last_seen: ").strip()
        elif line.startswith("- evidence:"):
            i += 1
            while i < len(lines) and lines[i].startswith("  - "):
                issue.evidence.append(lines[i].removeprefix("  - ").strip())
                i += 1
            continue
        elif line == "Notes:":
            i += 1
            while i < len(lines):
                note_line = lines[i]
                if note_line.startswith("- "):
                    issue.notes.append(note_line.removeprefix("- ").strip())
                elif note_line:
                    issue.notes.append(note_line.strip())
                i += 1
            continue
        i += 1

    return issue


def read_issues(path: Path) -> list[Issue]:
    ensure_ledger(path)
    text = path.read_text()
    return parse_section("Open Queue", text) + parse_section("Resolved", text)


def issue_sort_key(issue: Issue) -> tuple[int, int, int, str, str]:
    return (
        STATUS_ORDER.get(issue.status, 99),
        issue.defcon,
        0 if issue.blocking == "yes" else 1,
        issue.surface,
        issue.issue_id,
    )


def render_issue(issue: Issue) -> str:
    lines = [
        f"### {issue.issue_id} — {issue.title}",
        f"- status: {issue.status}",
        f"- defcon: {issue.defcon}",
        f"- surface: {issue.surface}",
        f"- blocking: {issue.blocking}",
        f"- fix_attempts: {issue.fix_attempts}",
        f"- last_seen: {issue.last_seen or now_iso()}",
        "- evidence:",
    ]
    if issue.evidence:
        lines.extend(f"  - {entry}" for entry in issue.evidence)
    else:
        lines.append("  - pending")
    lines.append("")
    lines.append("Notes:")
    if issue.notes:
        lines.extend(f"- {note}" for note in issue.notes)
    else:
        lines.append("- pending")
    return "\n".join(lines)


def write_issues(path: Path, issues: list[Issue]) -> None:
    ensure_ledger(path)
    ordered = sorted(issues, key=issue_sort_key)
    open_issues = [issue for issue in ordered if issue.unresolved()]
    resolved = [issue for issue in ordered if not issue.unresolved()]

    lines = [
        "# Recursive Bug Squash Issues",
        "",
        "This file is maintained by `.agents/skills/recursive-bug-squash`.",
        "",
        "## Open Queue",
        "",
    ]
    if open_issues:
        for index, issue in enumerate(open_issues):
            if index:
                lines.append("")
            lines.append(render_issue(issue))
    else:
        lines.append("_No open issues._")

    lines.extend(["", "## Resolved", ""])
    if resolved:
        for index, issue in enumerate(resolved):
            if index:
                lines.append("")
            lines.append(render_issue(issue))
    else:
        lines.append("_No resolved issues._")

    path.write_text("\n".join(lines).rstrip() + "\n")


def command_ensure(args: argparse.Namespace) -> int:
    ensure_ledger(args.path)
    print(args.path)
    return 0


def command_list(args: argparse.Namespace) -> int:
    issues = read_issues(args.path)
    if args.status != "all":
        issues = [issue for issue in issues if issue.status == args.status]
    else:
        issues = sorted(issues, key=issue_sort_key)

    if not issues:
        print("No matching issues.")
        return 0

    for issue in sorted(issues, key=issue_sort_key):
        print(
            f"{issue.issue_id}\tDEFCON {issue.defcon}\t{issue.status}\t"
            f"{issue.surface}\t{issue.title}"
        )
    return 0


def command_upsert(args: argparse.Namespace) -> int:
    issues = read_issues(args.path)
    issue_id = args.issue_id or new_issue_id()
    issue = next((entry for entry in issues if entry.issue_id == issue_id), None)

    if issue is None:
        issue = Issue(issue_id=issue_id, title=args.title or "Untitled issue")
        issues.append(issue)

    if args.title:
        issue.title = args.title
    if args.status:
        issue.status = args.status
    if args.defcon:
        issue.defcon = args.defcon
    if args.surface:
        issue.surface = args.surface
    if args.blocking:
        issue.blocking = args.blocking
    if args.fix_attempts is not None:
        issue.fix_attempts = args.fix_attempts
    issue.last_seen = args.last_seen or now_iso()
    if args.evidence is not None:
        issue.evidence = args.evidence or []
    if args.note is not None:
        issue.notes = args.note or []

    write_issues(args.path, issues)
    print(issue.issue_id)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Maintain docs/bug-loop/issues.md")
    parser.add_argument(
        "--path",
        type=Path,
        default=DEFAULT_LEDGER,
        help="Path to the ledger file (default: docs/bug-loop/issues.md)",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    ensure_parser = subparsers.add_parser("ensure")
    ensure_parser.set_defaults(func=command_ensure)

    list_parser = subparsers.add_parser("list")
    list_parser.add_argument(
        "--status",
        default="all",
        choices=["all", "open", "blocked", "quarantined", "fixed"],
    )
    list_parser.set_defaults(func=command_list)

    upsert_parser = subparsers.add_parser("upsert")
    upsert_parser.add_argument("--id", dest="issue_id")
    upsert_parser.add_argument("--title")
    upsert_parser.add_argument(
        "--status",
        choices=["open", "blocked", "quarantined", "fixed"],
    )
    upsert_parser.add_argument("--defcon", type=int, choices=range(1, 6))
    upsert_parser.add_argument("--surface")
    upsert_parser.add_argument("--blocking", choices=["yes", "no"])
    upsert_parser.add_argument("--fix-attempts", type=int)
    upsert_parser.add_argument("--last-seen")
    upsert_parser.add_argument("--evidence", action="append")
    upsert_parser.add_argument("--note", action="append")
    upsert_parser.set_defaults(func=command_upsert)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
