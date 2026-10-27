# Eco page: to-do for the employee update

The official API now has employees, but not in its published spec yet
(`/openapi.json` is 0.17.4-beta and lists none). These procedures exist and
need an API key, so they go through the site's Worker:

| Procedure | What it gives |
|---|---|
| `employee.getCompanyEmployees` | A company's employees (used now: `/api/company-employees`) |
| `employee.getMyEmployees` | The key owner's employees, all companies in one call |
| `employee.getById` | One employee |
| `employee.getCandidates` | People you can hire |

Each employee has: base and trained production, luck and responsibility
(and whether they're revealed), traits, potential / potential max, wage (per
hour) and wage expectation, retire date, trainings per day and today,
training history (card, rarity, outcome), specialization days per good,
happiness (base, each reason, quit chance), and the production bonus with
every source (Management, manager, tool, core region, happiness,
specialization). Checked against the game's tooltips: points per day and
payroll per day match exactly.

## Done

- [x] Employees load from the game with the companies; the Eco page, the
  income model and the contract search all count them.

## To do

### Show what the game knows (no more typing)
- [x] Employee cards from the API: production, bonus with each source,
  payroll, profit, traits, happiness and quit chance, potential left, retire date.
- [x] Drop the WIP card and typing employees in; when loading them fails, the
  page says so and income is counted without them.
- [x] Update texts that still say employees must be entered (Eco skills:
  "No employees entered yet").
- [ ] Load with `employee.getMyEmployees` (one request) where the visitor is
  the key owner; `getCompanyEmployees` for everyone else.

### Decisions the page can help with
- [x] **Next employee** tab: per company, the nationality, gender and trait that
  add the most per day given who works there (replacing someone when the
  company is full), traits to look for and avoid, and the training cards worth
  picking per employee. Trait rules come from the game's web app config.
- [x] **Rate today's candidates** (Next employee): type in the three cards
  (stats, potential, age, wage hint, trait, gender, nationality) and each is
  scored in every company, as a hire or a replacement.
- [ ] **Hiring:** rank `employee.getCandidates` by profit per day at your
  company (their production × your bonus − their wage), and against your
  weakest employee (6 of 14 cost more than they make today).
- [ ] **Replace or train:** for each losing employee, compare training (the
  production gain over the potential left) with replacing them.
- [ ] **Wage expectation:** flag employees whose wage will move toward their
  expectation (unit to confirm first).
- [ ] **Trainings per day:** fill the setting from the employees (energy each
  training takes) instead of asking.
- [ ] **Specialization:** when the page suggests switching a company's good
  (e.g. to cooked fish), count the specialization bonus the employees lose
  (+1 % a day, up to 20 %).
- [ ] **Happiness:** show what lowers it (tax, full storage, …) and the quit
  chance; warn before storage fills.
- [ ] **Manager bonus:** the API shows a +16 % "manager" source; find out what
  sets it and model it.

### Income model
- [ ] Management: read the current Management % from the employees instead of
  the planner's levels.
- [ ] Value of a production point: the game uses 0.1012; ours is estimated
  from prices (0.0908). Use the game's when the API offers it, or the
  7-day raw-trade value once it has filled.
- [ ] Compare the model's daily income with the game's own figures and find
  the rest of the gap (model 136 G/day, game about 160).

### Game update 0.27.1 (2026-10-27)
- [ ] Managers: a hired manager gives employees a bonus (the "Manager" source)
  and is paid every hour, now a tenth of before. Their wage isn't in the API,
  so company income doesn't subtract it yet.
- Firing a fresh hire is free and events can happen right after hiring, so
  rerolling a bad hire costs only the hire's energy. Homesick employees are
  fine in their country's occupied regions (the model already uses the
  region's current owner).

### Robustness
- [ ] The employee procedures are undocumented and may change: handle
  missing fields, and say so on the page when loading them fails.
