# Yemmen Tool - WarEraPlanner Comparison

Checked on 2026-10-28: the same player, skills and gear in both tools, read from
the Yemmen tool's own Combat breakdown and Cost breakdown. The site shows the
same as a page (Other tool comparisons, src/components/ComparisonsPage.svelte):
keep the two in step.

## In short

**Both tools calculate damage the same way.** Per hit, per point of health and
per piece of gear worn, the numbers match. The totals differ for three reasons,
none of them a different damage formula:

1. The Yemmen tool heals with 14.4 fish but pays for 14. We count 14 and 14.
   That's its 8 extra hits (+1.7 % damage).
2. Its "cost" has company income taken off. We show income on its own lines.
3. Its daily total includes the hours after the pill. Our Overview shows the
   pill's 8 hours.

## Side by side

Level 46, military rank 28 %, battle bonus 70 %, pill on, Cooked fish.
Skills: Attack 8, Precision 6, Crit chance 7, Crit damage 5, Armor 4, Dodge 7,
Health 5, Loot chance 5, Hunger 4. Gear: Rifle 86 / 14 %, Light ammo,
Helmet T4 75 %, Chest T4 24, Pants T4 25, Boots T4 24, Gloves T4 24 %.

| The 8 pill hours | WarEraPlanner | Yemmen tool | Same? |
|---|---|---|---|
| Damage per hit | 4,038 | 4,038 | Yes |
| Health lost per hit | 1.505 | 1.51 | Yes |
| Health from regen | 270 | 270 | Yes |
| Fish that heal | 14 | 14.4 | **No** |
| Fish paid for | 14 | 14 | Yes |
| Hits | 458 | 466 | No (the fish) |
| Damage | 1.851M | 1.883M | No (the fish) |
| Wear, scrap and cases per hit | | | Yes |
| Cost: spent − scrap − cases | 444.1 G | 443.1 G | Yes |
| Company income | own line in Net | inside "cost" (+101 G) | Shown differently |

## What matches

- **Damage per hit.** Attack 300 + Rifle 86 + 16 from precision over 100 %
  = 402. × 1.10 ammo × 1.28 military rank = 566. × 2.62 for crits (59 % chance,
  275 % damage) = 1,484. × 1.6 pill × 1.7 battle bonus = 4,038.
- **Health per hit.** 10 × 0.35 (65 % armor) × 0.43 (57 % dodge) = 1.505.
- **Regen.** 270 health for the pill hours in both: ours a full bar (150) plus
  8 hours at a tenth of the bar an hour; theirs 11.25 an hour over a day.
- **Wear.** The weapon wears 1 per hit, armor 1 per hit not dodged, at the
  item's price ÷ 100, less the scrap a broken piece gives. Equal to the cent per hit.
- **Case drops.** 15 % a hit (Loot chance), the rare case at 1 % of that.

## What differs

### 1. Fish: 14.4 against 14

Hunger 8 plus 8 hours of regen is 14.4 fish. The Yemmen tool heals with 14.4
(432 health) but its cost breakdown pays for 14. We count 14 eaten and 14 paid:
you can't eat 0.4 of a fish. Those 12 health are its 8 extra hits, about 32k
damage, for nothing.

### 2. What "cost" includes

The Yemmen tool's cost (−342 G) has an Income line of +101 G inside it, the
companies' income. Without it, its cost is −443 G, the same as our 444 G.
We show income in the Net instead, each on its own line: bounty, battle loot
from real battles, and company profit.

### 3. The hours after the pill

The Yemmen tool's "Daily" adds the debuff hours: 37 hits with a knife, no food,
21.6k damage, about +16 G (mostly cases). Our Overview shows the pill's 8 hours.
The hours after it are in the Simulator (16 h and full day) and in the
Optimizer's Deep mode, with a debuff build picked for the most profit there.

### Prices

Each tool reads the market at its own time (Cooked fish 9.19 G there, 8.89 G
here that day), so small gold differences come and go.
