# AgroVida — Production Design Specification

## 1. Source and adaptation
The legacy AgroVida HTML is a high-fidelity visual reference, not production code. Recreate the design with native React Native components.

Do not port:
- the desktop background or phone bezel
- Android status/gesture bars
- `<x-dc>`, `<sc-if>`, `<sc-for>`, or `DCLogic`
- `image-slot`
- browser pointer-event carousel code
- inline web CSS
- the “Diseño A / Diseño B” selector
- the ES/EN toggle

## 2. Selected visual direction
Use the former **Design A** for the main carousel:
- photo banner at top
- lifecycle/lactation chips
- name and breed
- today’s milk total as the dominant number
- yesterday delta
- seven-day sparkline
- age, calving count, and tag
- primary action to open profile

The former Design B is an archive/reference only.

## 3. Design tokens

### Colors
- primary: `#16794F`
- text primary: `#16211C`
- text secondary: `#8A938C`
- text muted: `#6B756E`
- app background: `#F4F7F4`
- surface: `#FFFFFF`
- soft surface: `#F7FAF8`
- border soft: `#EEF2EF`
- border input: `#DDE4DF`

Status colors:
- lactating: fg `#1F7A4F`, bg `#E4F2EA`
- pregnant: fg `#9A6A12`, bg `#F6ECD6`
- open/unknown: fg `#55606A`, bg `#E9EDF0`
- dry: fg `#7A5A5A`, bg `#F0E7E5`
- inactive lifecycle: use a distinct neutral/error treatment defined in the theme

Delta:
- increase: `#1F7A4F`
- decrease: `#B5852F`
- no production/no comparison: `#8A9098`

### Typography
- UI: Manrope 400/500/600/700/800
- numeric emphasis: Space Grotesk 500/600/700

Bundle fonts through Expo; do not rely on Google Fonts at runtime.

### Shape and spacing
- main card radius: 24
- detail panel radius: 18
- list row radius: 16
- input/card radius: 12–14
- pills: fully rounded
- spacing grid: 4
- minimum touch target: 44×44 dp; prefer 48 dp in field workflows

## 4. Navigation
Bottom tabs:
- Inicio/Cartas
- Rebaño
- Resumen

Central add action may remain only if it does not overlap safe areas or accessibility focus. Otherwise use a normal prominent action.

Secondary routes:
- Detalle
- Agregar/Editar vaca
- Registrar leche
- Historial
- Miembros
- Ajustes
- Estado de sincronización

Use native safe areas and keyboard avoidance.

## 5. Main carousel
- One cow per viewport.
- Gesture handled with Gesture Handler/Reanimated.
- Vertical scrolling must remain possible.
- Clamp at first/last cow.
- Provide dots or a textual position indicator.
- Accessibility actions must allow previous/next without swipe.
- Card should remain usable with large text settings.

Do not show a layout-selector control to end users.

## 6. Cow status presentation
Do not collapse independent states into one label.
Examples:
- primary chip: `Lactando`
- secondary chip: `Preñada`
- lifecycle chip replaces both when `Vendida`, `Fallecida`, or `Descartada`

## 7. Forms
Add/edit cow:
- photo picker
- name
- tag
- birth date
- estimated-date toggle
- breed
- mother selector
- calving count
- lactation status
- pregnancy status

Do not ask for numeric age.
Do not ask for a single combined reproductive status.
Do not store “Leche hoy” in the cow form. Offer a separate “Registrar ordeño” action after save.

Milk form:
- date defaults to today
- morning/afternoon segmented control
- liters numeric input
- show any existing record for that cow/date/session
- save locally even when offline

## 8. Lists and empty states
Herd list:
- search by name and tag
- 48 dp thumbnail
- name and relevant chips
- today’s total and tiny sparkline
- empty/filter/no-results states

Provide explicit states for:
- no cows
- no milk records today
- photo pending upload
- offline
- syncing
- sync error requiring action

## 9. Accessibility and field use
- support screen readers and semantic labels
- do not communicate status by color alone
- high contrast in sunlight
- large numeric keypad for liters
- haptic confirmation for successful local save where appropriate
- visible local-save confirmation independent of network state
