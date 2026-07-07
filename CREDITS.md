# Credits

## Cat artwork & animations

The cat sprite SVGs in `assets/cat/` (idle, press-left, press-right poses,
ear and tail paths, and their embedded CSS animations) are adapted from
**Catjang** by **jan (nerfspeed on Discord)** — https://github.com/jandev-png/catjang

Licensed under **Creative Commons Attribution-NonCommercial 4.0 International
(CC BY-NC 4.0)** — https://creativecommons.org/licenses/by-nc/4.0/

Per that license, this project (daily-pet) and any derivative of it must:

- keep this attribution visible, and
- **not be used commercially** (no selling or monetizing).

Modifications made here: ear/tail paths baked into each pose file, element
IDs namespaced per pose, added steam-puff group, mood styling (lonely /
grumpy) applied on top.

## Cat coat patterns

The coat pattern presets in `assets/cat/patterns/` (calico, mackerel tabby,
siamese, and the solid colors) and the `data-patch-frame` spot-painting
technique that renders them are adapted from **Catjang**'s pattern editor and
renderer by **jan (nerfspeed on Discord)** — https://github.com/jandev-png/catjang

Also licensed **CC BY-NC 4.0** — https://creativecommons.org/licenses/by-nc/4.0/

Modifications made here: preset spot arrays ported to DeskCat's namespaced
sprites, a lightweight `data-patch-frame` painter reimplemented in TypeScript
(no runtime cell-mapping table), patterns applied to idle and press poses.
