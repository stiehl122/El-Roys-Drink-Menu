#!/usr/bin/env python3
from pathlib import Path
import sys


def main() -> int:
    html_path = Path(__file__).resolve().parent.parent / "manager" / "index.html"
    html = html_path.read_text(encoding="utf-8")

    required_ids = [
        "settings-drawer-toggle",
        "manager-settings-rail",
        "manager-main-content",
        "manager-panel",
        "manager-overview-section",
        "manager-items-section",
        "manager-pricing-section",
        "manager-description-section",
        "manager-categories-section",
        "manager-database-section",
        "save-btn",
        "send-btn",
        "discard-draft-btn",
        "manager-action-bar",
        "sync-status",
    ]

    missing_ids = [item for item in required_ids if f'id="{item}"' not in html]
    if missing_ids:
        print("Missing required manager IDs:")
        for item in missing_ids:
            print(f" - {item}")
        return 1

    required_strings = [
        'class="settings-shell-pending manager-dossier-shell"',
        ">Save Quietly<",
        ">Save &amp; Send<",
        'aria-label="Manager workspace sections"',
    ]

    missing_strings = [item for item in required_strings if item not in html]
    if missing_strings:
        print("Missing required manager shell strings:")
        for item in missing_strings:
            print(f" - {item}")
        return 1

    print("Manager shell contract looks good.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
