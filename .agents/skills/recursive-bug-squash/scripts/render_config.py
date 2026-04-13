#!/usr/bin/env python3
"""Render the effective recursive-bug-squash config sheet."""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass


DEFAULT_SURFACES = [
    "picker",
    "leroyslounge",
    "elroyscantina",
    "public-footer",
    "auth",
    "manager",
    "admin",
    "runtime",
    "api",
]

PUBLIC_ONLY_SURFACES = [
    "picker",
    "leroyslounge",
    "elroyscantina",
    "public-footer",
]

SURFACE_CHOICES = DEFAULT_SURFACES


@dataclass
class RoleConfig:
    email_var: str
    password_var: str

    def configured(self) -> bool:
        return bool(os.getenv(self.email_var) and os.getenv(self.password_var))


ADMIN_ROLE = RoleConfig("LOOP_ADMIN_EMAIL", "LOOP_ADMIN_PASSWORD")
MANAGER_ROLE = RoleConfig("LOOP_MANAGER_EMAIL", "LOOP_MANAGER_PASSWORD")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--passes", type=int, default=10)
    parser.add_argument("--surface", action="append", choices=SURFACE_CHOICES, default=[])
    parser.add_argument("--public-only", action="store_true")
    parser.add_argument("--no-auth", action="store_true")
    parser.add_argument("--no-preview", action="store_true")
    parser.add_argument("--allow-send", action="store_true")
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--min-defcon", type=int, choices=range(1, 6))
    parser.add_argument("--max-defcon", type=int, choices=range(1, 6))
    return parser


def yes_no(value: bool) -> str:
    return "yes" if value else "no"


def effective_surfaces(args: argparse.Namespace) -> list[str]:
    if args.public_only:
        return PUBLIC_ONLY_SURFACES
    if args.surface:
        return args.surface
    return DEFAULT_SURFACES


def auth_mode(args: argparse.Namespace) -> str:
    if args.public_only or args.no_auth:
        return "disabled by flag"

    configured_roles = []
    if ADMIN_ROLE.configured():
        configured_roles.append("admin")
    if MANAGER_ROLE.configured():
        configured_roles.append("manager")

    if configured_roles:
        return "enabled when needed ({})".format(", ".join(configured_roles))
    return "public-only fallback (no LOOP_* credentials configured)"


def preview_policy(args: argparse.Namespace) -> str:
    if args.no_preview:
        return "disabled; quarantine bugs that require preview/browser proof"
    return "code/tests first; preview/browser fallback when proof is incomplete"


def defcon_window(args: argparse.Namespace) -> str:
    if args.min_defcon and args.max_defcon:
        return f"DEFCON {args.min_defcon} through DEFCON {args.max_defcon}"
    if args.min_defcon:
        return f"DEFCON {args.min_defcon} and higher priority"
    if args.max_defcon:
        return f"DEFCON {args.max_defcon} and lower priority"
    return "all DEFCON levels"


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    print("# Recursive Bug Squash Config")
    print()
    print("## Effective Run")
    print(f"- `passes`: {args.passes}")
    print(f"- `surfaces`: {', '.join(effective_surfaces(args))}")
    print("- `worktree`: disposable worktree on a fresh `codex/recursive-bug-squash-*` branch")
    print("- `mode`: single-threaded, one root-cause cluster per pass")
    print(f"- `auth coverage`: {auth_mode(args)}")
    print(f"- `preview policy`: {preview_policy(args)}")
    print(f"- `send update`: {'allowed' if args.allow_send else 'blocked by default'}")
    print(f"- `browser mode`: {'headed' if args.headed else 'headless'}")
    print(f"- `DEFCON filter`: {defcon_window(args)}")
    print("- `carryover`: import newest open bug-squash PR/branch first, then local `bug-loop/issues.md`")
    print()
    print("## Shared Loop Secrets")
    print(f"- `LOOP_ADMIN_EMAIL` + `LOOP_ADMIN_PASSWORD`: {yes_no(ADMIN_ROLE.configured())}")
    print(f"- `LOOP_MANAGER_EMAIL` + `LOOP_MANAGER_PASSWORD`: {yes_no(MANAGER_ROLE.configured())}")
    print()
    print("## Supported Overrides")
    print("- `--passes N`")
    print("- `--surface <picker|leroyslounge|elroyscantina|public-footer|auth|manager|admin|runtime|api>`")
    print("- `--public-only`")
    print("- `--no-auth`")
    print("- `--no-preview`")
    print("- `--allow-send`")
    print("- `--headed`")
    print("- `--min-defcon N`")
    print("- `--max-defcon N`")
    print()
    print("## Next Step")
    print("Use these defaults as-is, or name the overrides you want to change before the run starts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
