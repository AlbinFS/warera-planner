# Our own combat engine

The `own-engine` branch replaces the vendored optimizer workers
with one written here from the game's rules (`src/combat`). Nothing in it
depends on another site.

## The model (`src/combat/model.js`)

All numbers come from the game config (`/api/game-config`) and market prices.

**Damage per swing**

- attack = attack skill + weapon attack (+ 4 per precision point over 100)
- base = attack × (1 + military rank) × (1 + ammo) × (1 + pill) × (1 + battle bonus)
- a miss (chance 1 − precision) does half damage
- a landed swing crits with the crit chance (+ weapon crit; over 100 % turns
  into 4 crit damage per point) and then adds the crit damage %
- expected = base × [miss × 0.5 + (1 − miss) × (1 + crit × crit damage)]

Checked against the combat simulator: ×3.822 total multiplier and ×2.0582
expected per swing for the same build.

**Armor and dodge: breakpoints**

Both are `value / (value + 40)` (40 is the skills' `softCap` in the config),
applied as **whole percents**. So 92 armor gives 70 % and nothing changes
until 96 (71 %). The tests check the in-game tables (armor 43 → 52 %,
92 → 70 %, 96 → 71 %; dodge skill 24 + 11 gear → 47 %, + 60 → 68 %).

Health per swing = 10 × (1 − armor %) × (1 − dodge %).

**A fight**

- A window of H hours: the full health bar plus H hours of regen (a tenth of
  the bar an hour), and food up to the hunger bar plus its regen; each food
  heals its % of the health bar (cooked fish 20 %).
- With the pill, its 8 hours are at ×1.6. A longer session (16 h, a full day)
  goes on in the debuff at ×0.4, on regen only.
- Wear: durability 100; a weapon loses 1 per swing (100 swings), armor 1 per
  hit taken, so a dodged hit spares all five armor pieces (helmet and gloves
  too). A broken piece gives a third of its rarity's scrap base (common 6 …
  mythic 1458). Ammo: one per swing. (Checked against the combat simulator:
  526 swings at 57 % dodge wore 2.3 armor sets, 5.3 weapons, 628 scraps.)
  Because of this, an offense option's cost depends on the dodge %: the
  optimizer keeps the options that are best at any of five dodge %s across
  the range and prices them exactly for each.
- Drops: case 1 at the loot chance per swing, case 2 at 1 % of that.

Checked: the same build and prices give the same hits (473 vs 460 simulated),
damage (1.19M vs 1.2M), wear, food, cases and scrap as the combat simulator.

## The optimizer (`src/combat/optimize.js`)

- **Breakpoint first.** For armor (chest + pants) and dodge (boots) only the
  cheapest gear that just reaches each whole percent is kept; anything in
  between pays for nothing.
- Offense (weapon, ammo, helmet, gloves) keeps the combinations no other
  beats on damage per swing and cost per swing. Helmet and gloves only meet
  the weapon through its crit chance, so their best pairs are found once per
  crit value.
- Each offense × defense × food option is solved exactly: damage and cost are
  linear in the swings, per phase and per kind of swing (on free health, or
  paid with food). "Most damage while losing at most X" takes every swing that
  pays for itself, then the others by damage per gold lost; "cheapest for a
  target" takes them by cost per damage.
- Skills: a climb over layouts (raise one level, lower one or two to pay),
  from the planned layout and two spread layouts. Every neighbour is scored in
  full, a step's neighbours in parallel on a pool of workers.
- With economy skills searched (the contract page's default once a player is
  loaded), each layout counts its own company income, so points move between
  fight and economy skills wherever they earn more.
- Searches run in workers (`src/combat/worker.js`), so the page stays responsive.

## Results against the old optimizer

Same terms on both (contract page, skills + gear searching economy skills too,
8 h window, pill, +70 % bonus, 0.13 G loot per 1k, willing to lose 50 G):

| Player | Old | New |
|---|---|---|
| Level 32, all points in eco | 600k in 36 s | 741k in 25 s |
| Level 46, fighter | 1.48M in 43 s | 1.63M in 12 s |

(Re-measured after guns were made to require ammo: the first run let the
optimizer drop ammo from a gun, which the game doesn't allow.)

The two models give the same damage and hits for the same build, so the gain
is the search: gear bought exactly to breakpoints, and swings solved exactly.
Six random starting layouts end on the same best layout as the normal search
in every case tried, so the climb isn't getting stuck.

## What changed on the site

- Every page uses the new engine (planner, hints, cost breakdown, gear and
  skill optimizers, contract search, unit page). The vendored workers are removed.
- **Simulate** page: the planned build hit by hit, thousands of times, for an
  8 h pill window, a 16 h session (8 h pill + 8 h debuff) or one set of full
  bars, with the spread of damage and profit.
- **Breakpoints** panel on the planner: armor and dodge percent, the steps
  around it, points wasted above a step, and what the next step needs.
- Settings bar: a 16 hours option.
- Planner: hits, ARM %, DDG % and damage per hit under the totals, and how
  many of each piece a fight uses.

## Trying it, swapping, going back

The live site deploys from `main`; this branch doesn't touch it.

Try it locally:

```bash
git switch own-engine
npm install
npm run preview
```

Swap the live site to it (Cloudflare deploys `main` on push):

```bash
git switch main
git merge --no-ff own-engine -m "Switch to the own engine"
git push
```

Go back to the old one:

```bash
git switch main
git revert -m 1 HEAD
git push
```

(`HEAD` there is the merge commit from the swap; if more was pushed since,
revert that merge commit by its id instead.)
