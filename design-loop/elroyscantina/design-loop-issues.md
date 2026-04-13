# El Roy's Cantina Design Loop Issues

## Pass 1 audit

1. The mobile header still does not settle into a clean utility bar. At the top it eats a full second row for the menu toggle and badge, and in the compact scrolled state it still sits too tall over the content instead of getting out of the way.
2. The food state still inherits too much of the longer drinks-menu spacing, so short sections feel underfilled and the page reads as airy instead of editorial. The route needs tighter density rules when the menu is short.
3. The light-mode 86'd treatment is still too faint. Items like `Bell's Two Hearted` and `El Roy's Skinny Margarita` lose scan priority so completely that the unavailable state becomes harder to read than the available state.
4. Secondary dark-mode details are a little too quiet. Descriptions, supporting chips, rules, and meta labels fade enough that the page loses some of its crafted rhythm once you move below the hero.
5. The footer closes the page politely but not memorably. On both desktop and mobile it feels lighter and less intentional than the opening brand moment, so the route tapers off instead of landing with confidence.
