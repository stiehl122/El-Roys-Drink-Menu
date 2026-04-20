#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path


class ManagerShellParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.elements: dict[str, dict[str, object]] = {}
        self.nodes: list[dict[str, object]] = []
        self.body_attrs: dict[str, str] | None = None
        self._tag_stack: list[tuple[str, str | None]] = []

    def handle_starttag(self, tag: str, attrs):
        attr_map = {name: value for name, value in attrs}
        self.nodes.append({"tag": tag, "attrs": attr_map})
        if tag == "body" and self.body_attrs is None:
            self.body_attrs = attr_map
        element_id = attr_map.get("id")
        if element_id:
            self.elements[element_id] = {
                "tag": tag,
                "attrs": attr_map,
                "text": [],
            }
        self._tag_stack.append((tag, element_id))

    def handle_data(self, data: str):
        open_ids = [element_id for _, element_id in self._tag_stack if element_id]
        if not open_ids:
            return

        for element_id in open_ids:
            self.elements[element_id]["text"].append(data)

    def handle_endtag(self, tag: str):
        if self._tag_stack:
            self._tag_stack.pop()


def normalized_text(parts) -> str:
    return " ".join("".join(parts).split())


def main() -> int:
    html_path = Path(__file__).resolve().parent.parent / "manager" / "index.html"
    html = html_path.read_text(encoding="utf-8")
    toast_css = (Path(__file__).resolve().parent.parent / "styles" / "components" / "toast.css").read_text(encoding="utf-8")
    auth_css = (Path(__file__).resolve().parent.parent / "core" / "auth" / "auth-overlay-unified.css").read_text(encoding="utf-8")
    picker_css = (Path(__file__).resolve().parent.parent / "styles" / "components" / "menu-picker.css").read_text(encoding="utf-8")
    parser = ManagerShellParser()
    parser.feed(html)

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

    missing_ids = [item for item in required_ids if item not in parser.elements]
    if missing_ids:
        print("Missing required manager IDs:")
        for item in missing_ids:
            print(f" - {item}")
        return 1

    if parser.body_attrs is None:
        print("Missing required manager shell strings:")
        print(" - body with required dossier classes")
        return 1

    body_classes = set(parser.body_attrs.get("class", "").split())
    required_classes = {"settings-shell-pending", "manager-dossier-shell"}
    missing_classes = sorted(required_classes - body_classes)
    if missing_classes:
        print("Missing required manager shell strings:")
        for item in missing_classes:
            print(f" - body class token: {item}")
        return 1

    save_btn = parser.elements.get("save-btn")
    send_btn = parser.elements.get("send-btn")
    workspace_sections = next(
        (
            node
            for node in parser.nodes
            if node["attrs"].get("aria-label") == "Manager workspace sections"
        ),
        None,
    )

    missing_strings = []
    if save_btn is None or normalized_text(save_btn["text"]) != "Save Quietly":
        missing_strings.append(">Save Quietly<")
    if send_btn is None or normalized_text(send_btn["text"]) != "Save & Send":
        missing_strings.append(">Save & Send<")
    if workspace_sections is None:
        missing_strings.append('aria-label="Manager workspace sections"')

    if missing_strings:
        print("Missing required manager shell strings:")
        for item in missing_strings:
            print(f" - {item}")
        return 1

    shared_css_expectations = [
        ("toast dossier hook", "body.manager-dossier-shell .toast", toast_css),
        ("auth overlay dossier hook", "body.manager-dossier-shell #auth-overlay", auth_css),
        ("auth box dossier hook", "body.manager-dossier-shell .auth-box", auth_css),
        ("menu picker dossier hook", "body.manager-dossier-shell .picker-box", picker_css),
    ]

    missing_shared_css = [
        label for label, needle, haystack in shared_css_expectations if needle not in haystack
    ]
    if missing_shared_css:
        print("Missing required manager dossier shared CSS hooks:")
        for item in missing_shared_css:
            print(f" - {item}")
        return 1

    print("Manager shell contract looks good.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
