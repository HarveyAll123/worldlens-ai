# DESIGN.md

A general UI design language. Apply it to any interface (bars, panels, widgets, apps, dialogs). Values marked `~` are starting points, tune as needed.

---

## 1. Vibe

- Dark, minimal, calm, "floating glass"
- Quiet UI that stays out of the way of content and wallpaper
- Technical but refined: dense info shown with very little visual noise
- Elements feel like **separate floating objects**, not one big slab

---

## 2. Principles

- **Monochrome chrome.** The UI itself has no accent color. Color comes from the background behind it
- **Hierarchy through brightness and size**, never through bold weight or hue
- **Round everything.** No sharp corners
- **Detached surfaces.** Group related things in their own rounded container with breathing room around it, instead of filling edge to edge
- **Flat and light.** No heavy shadows, gradients, or bevels
- **Stable.** Live-updating values never shift the layout around them

---

## 3. Color

| Role | Value |
|------|-------|
| Surface | `~rgba(15,15,18,0.75)` |
| Surface border | `~rgba(255,255,255,0.08)` |
| Primary text / icons | `~#F2F2F2` |
| Secondary text | `~#9A9A9F` |
| Inactive / disabled | `~#5A5A60` |
| Active fill | `~#E6E6E6` |
| Text on active fill | `~#1A1A1A` |

- Active or selected = **inverted contrast** (light fill, dark content), not an accent color
- Keep text readable over bright or busy backgrounds

---

## 4. Surface & Depth

- Translucent dark surfaces with backdrop blur (`~12–20px`)
- Hairline light border to separate from the background
- Depth comes from translucency, not shadows

---

## 5. Shape

- Containers: fully rounded (pill) or generously rounded (`~16–24px`)
- Small controls, indicators, avatars: perfect circles
- Icon buttons: circle outline or no container
- Nested radius rule: inner radius = outer radius minus padding

---

## 6. Typography

- Clean sans-serif, regular weight only
- Two sizes cover most needs: primary `~14px`, secondary `~11px`
- Primary = bright, secondary = muted gray
- Tabular numerals for anything that updates live
- Truncate with an ellipsis, never wrap or let containers grow unbounded
- Stacked label pattern: tiny dim line on top, larger bright line below
- Compact formats with a centered bullet `•` as a separator

---

## 7. Iconography

- Thin monoline outline icons, one consistent stroke (`~1.5px`)
- Small and uniform (`~16–18px`)
- Optionally centered in a circle outline (`~24px`) to group or emphasize
- Passive status icons can be bare; actionable icons can get a container
- Off or inactive = muted gray

---

## 8. Spacing

- Base unit `4px`, scale of 4 / 8 / 12 / 16
- Container padding `~12–16px`
- Gaps between related items `~6–12px`
- Stacked text lines `~0–2px`
- Generous empty space between separate containers is intentional

---

## 9. States

| State | Treatment |
|-------|-----------|
| Default | Primary or secondary text on dark surface |
| Hover | Slight brightness lift or faint circle behind the item |
| Active / selected | Inverted fill |
| Occupied / has content | Bright, no fill |
| Empty / inactive | Dim gray |
| Disabled / off | Muted gray, optional strike |
| Motion | `~120–200ms` ease-out, subtle |

---

## 10. Do / Don't

**Do**
- Stay monochrome
- Use size and brightness for hierarchy
- Round all corners
- Keep surfaces separate with space between
- Keep icon stroke and size consistent

**Don't**
- Add accent colors, gradients, or drop shadows
- Use bold text or filled icons
- Use sharp corners
- Stretch containers to fill space
- Let live values resize their container

---

## 11. Tokens

```css
:root {
  --surface: rgba(15, 15, 18, 0.75);
  --surface-border: rgba(255, 255, 255, 0.08);
  --text-primary: #F2F2F2;
  --text-secondary: #9A9A9F;
  --text-inactive: #5A5A60;
  --active-bg: #E6E6E6;
  --active-fg: #1A1A1A;

  --radius-pill: 9999px;
  --radius-lg: 20px;
  --backdrop-blur: 16px;

  --font-ui: "Inter", system-ui, sans-serif;
  --text-md: 14px;
  --text-sm: 11px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;

  --icon-size: 18px;
  --icon-stroke: 1.5px;
  --icon-badge: 24px;

  --transition: 160ms ease-out;
}
```
