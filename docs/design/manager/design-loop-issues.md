# Manager Design Loop Issues

## After Pass 5

1. The signed-out `/manager` shell still exposes a stray `No sent updates yet.` text node in preview snapshots, which suggests one hidden manager footer/default element is still leaking into the accessibility surface.
2. The Patch Notes modal still appears in preview snapshots before explicit open, even after moving it to a `hidden`/`aria-hidden` lifecycle. This likely needs a deeper accessibility-focused audit of the modal container and any dialog-role descendants.
