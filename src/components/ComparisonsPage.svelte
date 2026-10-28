<script>
  /**
   * How our numbers compare with other WarEra tools, checked by hand against
   * their own breakdowns (docs/tool-comparisons.md has the same: keep them in step).
   */
  const ROWS = [
    ['Damage per hit', '4,038', '4,038', 'same'],
    ['Health lost per hit', '1.505', '1.51', 'same'],
    ['Health from regen', '270', '270', 'same'],
    ['Fish that heal', '14', '14.4', 'differs'],
    ['Fish paid for', '14', '14', 'same'],
    ['Hits', '458', '466', 'fish'],
    ['Damage', '1.851M', '1.883M', 'fish'],
    ['Wear, scrap and cases per hit', 'equal to the cent', 'equal to the cent', 'same'],
    ['Cost: spent − scrap − cases', '444.1 G', '443.1 G', 'same'],
    ['Company income', 'own line in Net', 'inside “cost” (+101 G)', 'shown'],
  ];
  const VERDICT = { same: 'Same', differs: 'Differs', fish: 'From the fish', shown: 'Shown differently' };
</script>

<div class="page">
  <section class="card intro">
    <h2>Other tool comparisons</h2>
    <p class="muted">Other WarEra tools can show different numbers for the same build. Here's why, checked against their own breakdowns.</p>
  </section>

  <article class="card">
    <h2>Yemmen Tool - WarEraPlanner Comparison</h2>
    <p class="muted small">Checked on 28 Oct 2026: the same player, skills and gear in both, read from the Yemmen tool's own Combat breakdown and Cost breakdown.</p>

    <div class="short">
      <p><strong>Both tools calculate damage the same way.</strong> Per hit, per point of health and per piece of gear worn, the numbers match. The totals differ for three reasons, none of them a different damage formula:</p>
      <ol>
        <li>The Yemmen tool <strong>heals with 14.4 fish but pays for 14</strong>. We count 14 and 14. That's its 8 extra hits (+1.7 % damage).</li>
        <li>Its <strong>“cost” has company income taken off</strong>. We show income on its own lines.</li>
        <li>Its <strong>daily total includes the hours after the pill</strong>. Our Overview shows the pill's 8 hours.</li>
      </ol>
    </div>

    <h3>Side by side: the 8 pill hours</h3>
    <p class="muted small">Level 46, military rank 28 %, battle bonus 70 %, pill on, Cooked fish. Skills: Attack 8, Precision 6, Crit chance 7, Crit damage 5, Armor 4, Dodge 7, Health 5, Loot chance 5, Hunger 4. Gear: Rifle 86 / 14 %, Light ammo, Helmet T4 75 %, Chest T4 24, Pants T4 25, Boots T4 24, Gloves T4 24 %.</p>
    <div class="scroll">
      <table>
        <thead><tr><th></th><th class="num">WarEraPlanner</th><th class="num">Yemmen tool</th><th></th></tr></thead>
        <tbody>
          {#each ROWS as [what, ours, theirs, verdict] (what)}
            <tr>
              <th scope="row">{what}</th>
              <td class="num">{ours}</td>
              <td class="num">{theirs}</td>
              <td><span class="tag" data-verdict={verdict}>{VERDICT[verdict]}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <h3>What matches</h3>
    <ul>
      <li><strong>Damage per hit.</strong> Attack 300 + Rifle 86 + 16 from precision over 100 % = 402. × 1.10 ammo × 1.28 military rank = 566. × 2.62 for crits (59 % chance, 275 % damage) = 1,484. × 1.6 pill × 1.7 battle bonus = 4,038.</li>
      <li><strong>Health per hit.</strong> 10 × 0.35 (65 % armor) × 0.43 (57 % dodge) = 1.505.</li>
      <li><strong>Regen.</strong> 270 health for the pill hours in both: ours a full bar (150) plus 8 hours at a tenth of the bar an hour; theirs 11.25 an hour over a day.</li>
      <li><strong>Wear.</strong> The weapon wears 1 per hit, armor 1 per hit not dodged, at the item's price ÷ 100, less the scrap a broken piece gives.</li>
      <li><strong>Case drops.</strong> 15 % a hit (Loot chance), the rare case at 1 % of that.</li>
    </ul>

    <h3>What differs</h3>
    <div class="diffs">
      <section>
        <h4>1 · Fish: 14.4 against 14</h4>
        <p>Hunger 8 plus 8 hours of regen is 14.4 fish. The Yemmen tool heals with 14.4 (432 health) but its cost breakdown pays for 14. We count 14 eaten and 14 paid: you can't eat 0.4 of a fish. Those 12 health are its 8 extra hits, about 32k damage, for nothing.</p>
      </section>
      <section>
        <h4>2 · What “cost” includes</h4>
        <p>The Yemmen tool's cost (−342 G) has an Income line of +101 G inside it: the companies' income. Without it, its cost is −443 G, the same as our 444 G. We show income in the Net instead, each on its own line: bounty, battle loot from real battles, and company profit.</p>
      </section>
      <section>
        <h4>3 · The hours after the pill</h4>
        <p>The Yemmen tool's “Daily” adds the debuff hours: 37 hits with a knife, no food, 21.6k damage, about +16 G (mostly cases). Our Overview shows the pill's 8 hours. The hours after it are in the Simulator (16 h and full day) and in the Optimizer's Deep mode, with a debuff build picked for the most profit there.</p>
      </section>
    </div>
    <p class="muted small">Prices: each tool reads the market at its own time (Cooked fish 9.19 G there, 8.89 G here that day), so small gold differences come and go.</p>
  </article>
</div>

<style>
  .page { display: grid; gap: var(--gap); max-width: 900px; margin: 0 auto; padding: var(--gap); }
  .intro h2 { text-transform: none; letter-spacing: 0; font-size: 16px; color: var(--text); margin-bottom: 6px; }
  .intro p { margin: 0; }
  article h2 { text-transform: none; letter-spacing: 0; font-size: 18px; color: var(--text); margin: 0 0 4px; }
  h3 { font-size: 12px; color: var(--muted); font-weight: 600; margin: 20px 0 6px; text-transform: uppercase; letter-spacing: .04em; }
  h4 { margin: 0 0 4px; font-size: 14px; }
  .small { font-size: 12px; }
  .short { margin: 12px 0 4px; padding: 12px 14px; border: 1px solid var(--accent); border-radius: var(--radius); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
  .short p { margin: 0 0 6px; }
  .short ol { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
  ul { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
  .diffs { display: grid; gap: 12px; }
  .diffs p { margin: 0; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { padding: 7px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
  thead th { font-size: 12px; color: var(--muted); font-weight: 600; }
  tbody th { font-weight: 500; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tag { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; }
  .tag[data-verdict='same'] { border-color: var(--good); color: var(--good); }
  .tag[data-verdict='differs'] { border-color: var(--bad); color: var(--bad); }
  .tag[data-verdict='fish'], .tag[data-verdict='shown'] { border-color: var(--accent); color: var(--accent); }
</style>
