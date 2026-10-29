# Employee events

Every employee event in the game: when it can happen, what each choice costs,
the odds, and what each result does. Read from the game's own web app code
(app.warera.io) on 2026-10-29, so it can change with an update. 78 events in all.

Names in the stories: **Alex** is the employee, **Sam** a second employee in
two-person events.

## How events are picked

- **How many:** up to 3 events a day for an owner, at most 3 waiting at once,
  more with more employees (the rate grows with the square root of the head
  count). If nothing has happened for 72 hours, one is due. An employee gets at
  most one event a day.
- **Which kind:** each event belongs to a pool, and the pools share the events
  roughly as: social 33, life 32, cozy 30, inspiration 28, crisis 12, world 6,
  legendary 1. Chain events only come as a follow-up to an earlier choice.
- **Which one:** within its pool, an event's **weight** sets how often it is
  picked when its trigger is met. An event already seen in the last 7 days
  counts at 0.35 of its weight. Each event also has its own cooldown (per
  employee, per owner or per company) before it can come again.
- **Answering:** an event waits 36 hours (some 48) for an answer. If you don't
  answer, the default choice is taken, marked "If you don't answer" below.

## How the checks work

A choice with a **check** succeeds at its base chance, adjusted by the traits
listed with it, and held between 5 % and 90 %. A **luck check** is the same but
leans on the employee's Luck. The game's settings for the adjustments:
happiness (divided by 5), Luck (+2 % a point), skill (+2 % a level), and stats
(+4 % a point around a middle of 3). The code doesn't say exactly how these
combine, so treat the base chance as the starting point.

- A tenth of successes are **critical successes** (a fifth for a Gambler), and a
  tenth of failures are **critical failures** (a fifth for a Gambler).
- **"Uses Potential":** a stat point that needs training potential. With none
  left, the employee gets +15 % production for 72 h instead.
- Wage expectation can't rise above ×1.6.
- Choices marked **risky** can lose you the employee.

---

## Chain events

These only come as a follow-up to an earlier choice.

### A promise to keep

> A week has passed. Alex is packing, trusting your promise of a trip home.

- **When:** Follows “A letter from home” (Promise a trip later), 168 h later.
- **Odds of showing up:** 1 employee · expires after 48 h
- **If you don't answer:** Break the promise (has consequences)
- **Keep the promise** (costs 4 days of their wage; luck check 30 % base)
  - Always: the employee: away for 24 h, the employee: happiness +20 for 168 h
  - Success: the employee: gains Loyal · _Alex will not forget that you kept your word._
  - Failure: nothing happens · _A good trip, and a promise kept._
- **Break the promise** (luck check 70 % base)
  - Always: the employee: happiness -20 for 120 h
  - Success: nothing happens · _Deeply disappointed, but still here._
  - Failure: the employee: gains Flight Risk · _Alex starts looking at other jobs._

### Gerald

> A man named Gerald has applied for a job. He says he already has a desk.

- **When:** Follows “The suggestion box” (Search Gerald's desk, success), 168 h later.
- **Odds of showing up:** 1 employee · expires after 48 h
- **If you don't answer:** Reject him
- **Interview him** (check 50 % base)
  - Success: the company: happiness +5 for 120 h · _Gerald is charming. Nobody is sure he got the job, but everyone likes him._
  - Critical success: the company: production +10 % for 48 h · _Gerald is an efficiency expert. Everyone works faster to avoid him._
  - Failure: the company: happiness -3 for 48 h · _Within the hour, everyone understands the note._
- **Reject him**

### Kevin has grown

> The real Kevin has grown into the ventilation, and there are leaves coming out of every vent. Alex is very proud.

- **When:** Follows “Kevin” (Buy a real Kevin), 240 h later.
- **Odds of showing up:** 1 employee · expires after 48 h
- **If you don't answer:** Let Kevin grow
- **Prune Kevin** (check 50 % base)
  - Success: the company: happiness +5 for 168 h · _Kevin is back to a reasonable size, and the whole workshop smells of leaves._
  - Failure: the employee: away for 6 h · _Alex climbed into the vents to prune Kevin, and was stuck there all afternoon._
- **Let Kevin grow**
  - Always: the company: happiness +10 for 168 h, the company: production -5 % for 48 h · _The workshop is a jungle now. Everyone loves it, and nobody can find the stapler._

### Kittens

> It turns out the cat was not fat. There are five kittens under the workbench, and Alex has already named them all.

- **When:** Follows “A stray cat” (Adopt it), 240 h later.
- **Odds of showing up:** 1 employee · expires after 48 h
- **If you don't answer:** Keep them all
- **Keep them all**
  - Always: the company: happiness +10 for 168 h, the company: production -10 % for 48 h · _Nobody gets anything done. Nobody minds._
- **Find them homes among the staff** (check 60 % base)
  - Success: the company: happiness +5 for 336 h · _Every kitten finds a home on the staff._
  - Critical success: the company: happiness +10 for 336 h · _Everyone wants one. There were not enough kittens._
  - Failure: the company: happiness +5 for 168 h, the company: production -10 % for 72 h · _Nobody takes one. Five kittens now live in the storeroom._

### On strike

> The union of one is on strike. Alex is picketing alone outside the gate, holding a sign that reads “Better chairs now”.

- **When:** Follows “A union of one” (Ignore it, failure), 72 h later.
- **Odds of showing up:** 1 employee · expires after 48 h
- **If you don't answer:** Wait it out (has consequences)
- **Meet the demands** (costs 2 days of their wage)
  - Always: the employee: happiness +15 for 168 h · _Alex gets a bonus, the chair and the parking spot. There is still no car._
- **Call the bluff** (check 50 % base; risky)
  - Success: the employee: happiness -5 for 48 h · _Alex lowers the sign and comes back in, grumbling._
  - Failure: the employee: away for 48 h · _Alex digs in and stays out on the picket line._
  - Critical failure: the employee: leaves the company (unhappy) · _Alex walks off with the sign and never comes back._
- **Wait it out**
  - Always: the employee: away for 24 h, the employee: happiness -5 for 72 h

### Supreme Commander

> Alex now signs every memo as Supreme Commander of their good, and asks when their pay will catch up with the title.

- **When:** Follows “A new job title” (Grant the title), 120 h later.
- **Odds of showing up:** 1 employee · expires after 48 h
- **If you don't answer:** Ignore the memos (has consequences)
- **Raise the pay to match**
  - Always: wage expectation × 1.1, the employee: happiness +10 for 168 h · _Alex salutes. The memos continue._
- **Make everyone a Supreme Commander** (check 50 % base)
  - Success: the company: happiness +5 for 120 h · _If everyone is a Supreme Commander, nobody is. Alex takes it surprisingly well._
  - Failure: the employee: happiness -15 for 120 h · _Alex takes being one Supreme Commander among many very badly._
- **Ignore the memos** (luck check 60 % base)
  - Always: the employee: happiness -15 for 120 h
  - Success: nothing happens · _Alex stops signing as Supreme Commander, and sulks._
  - Failure: the employee: gains Flight Risk · _Alex stops signing as Supreme Commander, and starts looking at other jobs._

### The demand

> A note slides under the workshop door: Alex needs materials, and will not come out without them.

- **When:** Follows “A strange mood” (Give them the workshop), right away.
- **Odds of showing up:** 1 employee · expires after 48 h
- **If you don't answer:** Let the deadline pass (has consequences)
- **Deliver what they ask** (costs the company's goods: 12 of a product or 40 of a raw good; check 70 % base (Craftsman +10, Specialist +10, Handy +5))
  - Always: the employee: happiness +20 for 168 h
  - Success: a legendary tool · _Alex emerges with a masterpiece._
  - Failure: an epic tool · _Alex emerges with fine work, if not quite the masterpiece they saw._
- **Let the deadline pass** (luck check 50 % base; risky)
  - Success: the employee: gains a random negative trait · _Alex comes out changed, and not for the better._
  - Failure: the employee: leaves the company (unhappy) · _Alex walks out of the workshop, and out of your company._

### Trouble in paradise

> Alex and Sam had their first fight. It was about the inventory. The whole workshop is taking sides.

- **When:** Follows “Checking the inventory” (Encourage it, success), 336 h later.
- **Odds of showing up:** 2 employees · expires after 48 h
- **If you don't answer:** Stay out of it (has consequences)
- **Pay for a dinner for two** (costs 1 day of their wage; check 60 % base)
  - Success: both: happiness +10 for 168 h · _A quiet dinner, a long talk. Alex and Sam are stronger for it._
  - Failure: Sweethearts ends, both: happiness -10 for 72 h · _The dinner ends early. Alex and Sam go their separate ways._
- **Stay out of it** (luck check 50 % base)
  - Success: nothing happens · _They make up by the end of the week, as if nothing happened._
  - Failure: Sweethearts ends, they become Nemesis · _It ends badly. Alex and Sam cannot stand each other now._

## Cozy events

### A stray cat

> A scruffy cat has been sleeping in the workshop. Alex has been sharing lunch with it.

- **When:** A company with 2 or more employees at work.
- **Odds of showing up:** weight 3 · 1 employee · cooldown 30 days per company
- **If you don't answer:** Shoo it away
- **Adopt it** (costs 1 day of their wage)
  - Always: the company: happiness +5 for 168 h, follow-up “Kittens” in 240 h · _The workshop has a cat now, and everyone is in a better mood._
- **Shoo it away**

### For luck

> Before every shift, coworkers queue to rub Alex's head for luck. The queue gets longer every day.

- **When:** A Lucky Charm with at least one coworker.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Let it be
- **Charge a fee**
  - Always: gold: 1 day of their wage, the employee: happiness -10 for 72 h · _The till fills up. Alex hates being a coin-operated charm._
- **Let it be**
  - Always: the company: happiness +5 for 72 h, the employee: production -10 % for 24 h · _Everyone feels luckier. Alex gets little work done between rubs._
- **Ban head rubbing**
  - Always: every coworker: happiness -5 for 48 h · _The queue breaks up, muttering about bad luck._

### General Coo

> A pigeon has moved into the rafters. Alex has named it General Coo and insists it outranks you.

- **When:** Rare. Can happen to anyone, twice as likely while the company's region is under attack.
- **Odds of showing up:** weight 1 · 1 employee · cooldown 45 days per owner
- **If you don't answer:** Accept its command
- **Accept its command**
  - Always: the company: happiness +5 for 168 h, the company: production -5 % for 24 h · _Everyone salutes the General on the way in. It takes a while._
- **Enlist it** (luck check 30 % base)
  - Success: the company: happiness +5 for 168 h, the company: production +5 % for 48 h · _General Coo carries messages now. Nobody knows to whom._
  - Failure: the employee: happiness -5 for 48 h · _General Coo deserts with a sandwich._
- **Evict the General** (check 50 % base)
  - Success: the company: production +5 % for 24 h · _The General retreats in good order._
  - Failure: the employee: away for 12 h · _The General won. Alex needs the afternoon to recover._

### Hang in there

> Alex has hung a kitten poster above every workstation. Every kitten says “Hang in there”.

- **When:** A company with 2 or more employees at work.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 21 days per owner
- **If you don't answer:** Take them down
- **Keep the posters**
  - Always: the company: production +5 % for 48 h, every coworker: happiness -3 for 48 h · _Everyone hangs in there. Some of them resent it._
- **Commission a better one** (costs 1 day of their wage; luck check 50 % base)
  - Success: the company: happiness +10 for 120 h · _The new poster is magnificent: a kitten in armor, hanging in there._
  - Failure: the employee: happiness -5 for 48 h · _The new poster looks like your mugshot. Alex misses the kitten._
- **Take them down**
  - Always: the employee: happiness -5 for 48 h · _Alex takes the posters down one by one, and does not hang in there._

### Kevin

> Alex has adopted the office plant, named it Kevin, and talks to it more than to any coworker. Kevin is plastic.

- **When:** Can happen to anyone.
- **Odds of showing up:** weight 2 · 1 employee · once per employee · cooldown 14 days per owner
- **If you don't answer:** Water Kevin with them
- **Tell them Kevin is plastic** (check 50 % base)
  - Success: nothing happens · _Alex takes it well, and keeps talking to Kevin anyway._
  - Failure: the employee: happiness -10 for 72 h · _Alex did not want to know, and is taking it hard._
- **Buy a real Kevin** (costs 0.5 days of their wage)
  - Always: the employee: happiness +10 for 168 h, the employee: production +5 % for 48 h, follow-up “Kevin has grown” in 240 h · _Alex welcomes Kevin the Second, and hums at work all week._
- **Water Kevin with them**
  - Always: the employee: happiness +5 for 48 h · _Alex is touched. Kevin is unchanged._

### Perfectly good stuff

> Alex is back from the dump with a bag of “perfectly good stuff”.

- **When:** A Scavenger or a Salvager.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 21 days per employee
- **If you don't answer:** Throw it out
- **Open the bag** (luck check 45 % base)
  - Success: 15 × Scraps · _Mostly scrap, but good scrap._
  - Critical success: 15 × Scraps, 1 × Toolbox · _Good scrap, and at the bottom, a whole toolbox._
  - Failure: the company: happiness -5 for 48 h · _It smells like the dump. So does the workshop now._
- **Throw it out**
  - Always: the employee: happiness -5 for 48 h · _Alex watches the bag go, sure it was perfectly good stuff._

### Something in the storeroom

> While clearing the storeroom, Alex found an old toolbox nobody remembers buying, and is eyeing it.

- **When:** Can happen to anyone.
- **Odds of showing up:** weight 3 · 1 employee · cooldown 14 days per owner
- **If you don't answer:** Let them keep it
- **Keep it for the company**
  - Always: 1 × Toolbox, the employee: happiness -15 for 120 h · _The toolbox goes in the stores. They found it, and they will not let you forget it._
- **Let them keep it**
  - Always: the employee: happiness +10 for 120 h, tool repaired to full · _They put it to work on their own tool straight away._

### Spelled wrong

> Alex got the company logo tattooed on their forearm. It is spelled wrong.

- **When:** Happiness 65 or more, after 14 days in the company.
- **Odds of showing up:** weight 3 · 1 employee · once per employee · cooldown 14 days per owner
- **If you don't answer:** Say nothing
- **Tell them you love it** (check 55 % base)
  - Success: the employee: happiness +10 for 168 h · _Alex beams, and rolls up their sleeves for the rest of the week._
  - Critical success: the employee: happiness +10 for 168 h, the employee: gains Loyal · _Alex is moved to tears, and with you for life, spelling and all._
  - Failure: the employee: happiness -5 for 48 h · _Alex can tell._
- **Pay for a correction** (costs 2 days of their wage; luck check 50 % base)
  - Success: the employee: happiness +15 for 168 h · _Fixed. It looks great._
  - Failure: the employee: happiness +5 for 48 h · _Now it is spelled wrong differently._
- **Say nothing**

### Take your kid to work

> Alex brought their kid to work. By ten o'clock, the kid had reorganized the storeroom and sold something to a passerby.

- **When:** Aged 28 to 50, hired 7 days ago or more.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 60 days per employee, 14 days per owner
- **If you don't answer:** Crayons in the corner
- **Let the kid help** (luck check 50 % base)
  - Success: gold: 1 day of their wage · _The kid made a sale. Nobody is sure what was sold._
  - Critical success: gold: 3 days of their wage · _The kid negotiated better than you ever have._
  - Failure: tool durability -20, the employee: happiness -5 for 48 h · _The kid “fixed” the tool._
- **Crayons in the corner**
  - Always: the employee: happiness +10 for 72 h, the employee: production -10 % for 8 h · _The kid draws the whole workshop. You are in it, with horns._

### The birthday card

> A birthday card is going around the workshop. Nobody knows whose birthday it is.

- **When:** A company with 3 or more employees at work.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 21 days per owner
- **If you don't answer:** Sign it
- **Sign it**
  - Always: the company: happiness +3 for 72 h · _Everyone signs. It is a lovely card, for someone._
- **Find out whose it is** (luck check 40 % base)
  - Success: the employee: happiness +10 for 120 h · _It was Alex's birthday, and nobody knew. Alex is quietly moved._
  - Failure: the company: happiness -3 for 48 h · _Nobody admits to the birthday. The card is now evidence._
- **Throw a party anyway** (costs 1 day of their wage)
  - Always: the company: happiness +5 for 120 h · _Nobody knows who the party is for. It is a great party._

### The coffee machine

> The coffee machine broke. Nobody has spoken in two hours. Alex is approaching it with a hammer.

- **When:** A company with 3 or more employees at work. Twice as likely if Handy or Improviser.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 30 days per company, 14 days per owner
- **If you don't answer:** Everyone drinks water now
- **Let them fix it** (check 50 % base (Handy +10, Improviser +10))
  - Success: the company: happiness +5 for 72 h · _It works. Conversation resumes._
  - Critical success: the company: happiness +5 for 72 h, the company: production +10 % for 24 h · _It works better than ever. The whole shift runs faster._
  - Failure: the company: happiness -5 for 48 h · _It now only makes soup._
  - Critical failure: the company: happiness -5 for 72 h, tool durability -20 · _It exploded. Nobody was hurt. The ceiling was._
- **Buy a new one** (costs 2 days of their wage)
  - Always: the company: happiness +5 for 120 h · _A shiny new machine. Order is restored._
- **Everyone drinks water now**
  - Always: the company: happiness -3 for 48 h · _Nobody is happy about it._

### The compliment

> You told Alex they did a good job. They have been apologizing for it all afternoon.

- **When:** Only a Modest.
- **Odds of showing up:** weight 5 · 1 employee · cooldown 21 days per employee, 7 days per owner
- **If you don't answer:** Let it go
- **Say it again, slowly** (check 50 % base)
  - Success: the employee: happiness +10 for 120 h · _It sinks in. Alex almost smiles._
  - Failure: nothing happens · _Alex apologizes harder._
- **Put it in writing** (costs 0.5 days of their wage)
  - Always: the employee: happiness +15 for 168 h · _Alex frames it, then apologizes for framing it._
- **Take it back**
  - Always: the employee: happiness +5 for 48 h · _Alex is visibly relieved._
- **Let it go**

### The cousin

> Alex says their cousin would be perfect for the job. The cousin is in the car, and the car is on fire.

- **When:** Only a Recruiter.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Politely decline
- **Meet the cousin** (luck check 40 % base)
  - Success: the company: happiness +5 for 120 h · _The cousin steps out, smoking slightly and charming. Everyone wants to hear the story._
  - Failure: the employee: away for 12 h · _Alex spends the night at the hospital with the cousin._
- **Call the firefighters** (costs 0.5 days of their wage)
  - Always: the employee: happiness +10 for 120 h · _The fire is out and the cousin is safe. Alex is very grateful._
- **Politely decline**
  - Always: the employee: happiness -5 for 48 h · _The car drives off, still on fire. Alex takes it personally._

### The ducks

> Alex signed for a delivery of 300 rubber ducks. The invoice is in your name.

- **When:** Can happen to anyone.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 21 days per owner
- **If you don't answer:** Send them back
- **Send them back**
- **Sell them to the neighbors** (check 45 % base)
  - Success: gold: 1 day of their wage · _The neighbors buy every duck. You do not ask why._
  - Critical success: gold: 2 days of their wage · _The neighbors want more ducks. You have made a profit on ducks._
  - Failure: 10 × Scraps · _Nobody wants the ducks. They melt down into scrap._
- **Keep them**
  - Always: the company: happiness +5 for 120 h, the company: production -5 % for 24 h · _A duck on every desk. Everyone is happier, and a little distracted._

### The impression

> Alex has been doing impressions of you at lunch. They are very good.

- **When:** A Comic with at least one coworker.
- **Odds of showing up:** weight 6 · 1 employee · cooldown 21 days per employee, 7 days per owner
- **If you don't answer:** Laugh along
- **Laugh along**
  - Always: the company: happiness +5 for 72 h · _Everyone laughs, you included._
- **Do an impression of them** (check 45 % base)
  - Success: the company: happiness +10 for 72 h · _The room loses it. Alex laughs hardest._
  - Critical success: the company: happiness +10 for 120 h · _Alex bows and hands you the title. The workshop talks of nothing else._
  - Failure: every coworker: happiness -5 for 48 h, the employee: happiness +5 for 72 h · _Silence. Someone coughs. Alex looks delighted._
- **Ban impressions**
  - Always: the employee: happiness -10 for 72 h · _Alex does an impression of you banning impressions._

### The locker

> You opened Alex's locker: 212 pencils, 40 left boots and a live chicken.

- **When:** Only a Stockpiler.
- **Odds of showing up:** weight 5 · 1 employee · cooldown 30 days per employee, 7 days per owner
- **If you don't answer:** Let them keep the chicken
- **Sell the lot for scrap**
  - Always: 15 × Scraps, the employee: happiness -10 for 72 h · _Alex watches the pencils go, and holds the chicken a little tighter._
- **Search the other lockers** (luck check 35 % base)
  - Success: 1 × Wooden Case · _Someone else was hoarding too: a wooden case, never opened._
  - Critical success: 1 × Wooden Case, 1 × Toolbox · _Behind a false panel: a wooden case, and a toolbox nobody will admit to._
  - Failure: the company: happiness -5 for 48 h · _You find nothing but resentment._
- **Let them keep the chicken**
  - Always: the employee: happiness +5 for 72 h, every coworker: happiness +3 for 72 h · _The chicken is the morale officer now._

### The suggestion box

> Alex emptied the suggestion box for the first time in three years. Forty notes say “more chairs”, one says “fire Gerald”, and there is no Gerald.

- **When:** A company with 3 or more employees at work.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 21 days per owner
- **If you don't answer:** Burn the box
- **Buy more chairs** (costs 1 day of their wage)
  - Always: the company: happiness +5 for 120 h · _Everyone gets a chair. Nobody stands up for days._
- **Search Gerald's desk** (luck check 35 % base)
  - Success: 1 × Wooden Case, follow-up “Gerald” in 168 h · _Gerald's desk exists. In the drawer: a wooden case, and no Gerald._
  - Failure: every coworker: happiness -5 for 48 h · _There is no desk. Everyone now suspects everyone of being Gerald._
- **Burn the box**

## Crisis events

### A business opportunity

> Alex is selling “business opportunities” to their coworkers. It is a pyramid, and they are at the top.

- **When:** A Greedy or a Climber with at least one coworker.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 30 days per employee, 14 days per owner
- **If you don't answer:** Let it run (has consequences)
- **Shut it down** (check 50 % base)
  - Success: every coworker: happiness +5 for 72 h, the employee: happiness -5 for 72 h · _The coworkers are relieved. Alex is not._
  - Failure: the employee: happiness -10 for 120 h · _It shuts down, and Alex calls it a crime against free enterprise._
- **Buy in** (costs 2 days of their wage; luck check 40 % base)
  - Always: the employee: happiness +10 for 120 h
  - Success: cost refunded × 1.3 · _Against all odds, it pays out. Alex is delighted._
  - Critical success: cost refunded × 2 · _It pays out handsomely. Alex is beside themself with joy._
  - Failure: nothing happens · _The money vanishes up the pyramid. Alex is delighted anyway._
- **Let it run** (luck check 60 % base)
  - Always: every coworker: happiness -5 for 72 h
  - Success: nothing happens · _The pyramid quietly collapses on its own. Nobody talks about it._
  - Failure: every coworker: production -10 % for 24 h · _The coworkers spend the day recruiting each other instead of working._

### A tempting offer

> A rival firm has offered Alex a job. They have not said yes, but they have not said no either.

- **When:** Happiness 45 or less, Production 6 or more, or Climber. Always possible for a Flight Risk, and twice as likely.
- **Odds of showing up:** weight 6 · 1 employee · cooldown 21 days per employee
- **If you don't answer:** Say nothing (has consequences)
- **Match the offer**
  - Always: wage expectation × 1.1, the employee: happiness +15 for 120 h · _Alex stays, and asks for more from now on._
- **Appeal to their loyalty** (check 40 % base (Loyal +20, Flight Risk -15, Greedy -10); risky)
  - Success: the employee: happiness +10 for 120 h · _Alex is touched, and stays._
  - Critical success: the employee: happiness +10 for 120 h, the employee: gains Loyal · _Alex turns the offer down for good: they are with you._
  - Failure: the employee: happiness -15 for 120 h · _Alex stays, but resents being guilted into it._
  - Critical failure: the employee: leaves the company (poached) · _Alex takes the offer and is gone._
- **Let them go, for a fee** (risky)
  - Always: the employee: leaves the company (poached), gold: 5 days of their wage · _Alex leaves on good terms, and the rival pays you for them._
- **Say nothing** (luck check 70 % base; risky)
  - Always: the employee: happiness -10 for 72 h
  - Success: nothing happens · _Alex stays, but feels taken for granted._
  - Failure: the employee: gains Flight Risk · _Alex stays, but kept the rival's card._
  - Critical failure: the employee: leaves the company (poached) · _Nobody asked Alex to stay, so they did not. They are gone._

### A union of one

> Alex has founded a union. Membership: one. Their demands: a raise, a better chair and a parking spot. They do not have a car.

- **When:** Hired 7 days ago or more, with happiness 45 or less. Always possible for a Greedy, and twice as likely.
- **Odds of showing up:** weight 3 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Ignore it (has consequences)
- **Sit down and negotiate**
  - Always: wage expectation × 1.05, the employee: happiness +10 for 120 h · _Alex wins the better chair, and now expects a better wage too._
- **Crush the union** (check 45 % base (Loyal +15, Greedy -10))
  - Success: nothing happens · _The union is dissolved without a fuss._
  - Critical success: the employee: production +10 % for 24 h · _The union is dissolved, and Alex, oddly relieved, works harder for it._
  - Failure: the employee: happiness -10 for 120 h · _The union is dissolved. Alex takes it personally._
  - Critical failure: the employee: happiness -10 for 120 h, the employee: gains Flight Risk · _Alex takes it very personally, and starts reading the job ads._
- **Join the union** (luck check 50 % base)
  - Success: the employee: happiness +10 for 120 h · _Alex is thrilled: membership has doubled._
  - Failure: the employee: happiness -5 for 48 h · _Alex suspects you only joined to spy on them._
- **Ignore it** (luck check 70 % base)
  - Always: the employee: happiness -5 for 72 h
  - Success: nothing happens · _Alex sulks for a while, then the union quietly folds._
  - Failure: follow-up “On strike” in 72 h · _Alex is not giving up. Someone saw them painting a sign._

### Gambling debts

> Alex lost big at cards and asks you for an advance on their wages.

- **When:** Only a Gambler.
- **Odds of showing up:** weight 6 · 1 employee · cooldown 14 days per employee
- **If you don't answer:** Refuse
- **Lend the money** (costs 3 days of their wage; check 55 % base)
  - Success: cost refunded × 1, the employee: happiness +10 for 120 h · _Alex pays you back in full, and will not forget it._
  - Critical success: cost refunded × 1.2, the employee: happiness +10 for 120 h · _Alex won it back, and pays you with interest._
  - Failure: the employee: happiness +5 for 48 h · _The money is gone for good, but the gratitude is real._
- **Double or nothing: flip a coin with them** (luck check 50 % base)
  - Success: the employee: happiness +15 for 120 h · _They win the flip, and the debt with it._
  - Failure: the employee: happiness -20 for 120 h · _They lose the flip, and their good mood with it._
- **Refuse**
  - Always: the employee: happiness -5 for 48 h

### Is that smoke?

> Alex's tool is smoking. They keep working, and insist it has always done that.

- **When:** Holding a tool worn down to 40 durability or less. Twice as likely if Jinx or Handy.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 14 days per employee
- **If you don't answer:** It has always done that (has consequences)
- **Open a toolbox** (costs 1 × Toolbox)
  - Always: tool durability +30 · _A few new parts later, the smoke clears._
- **Let them handle it** (check 50 % base (Handy +15, Improviser +10, Jinx -15))
  - Success: tool durability +20 · _Alex gives it a whack in the right place. The smoke clears._
  - Critical success: tool repaired to full · _Alex takes it apart and puts it back together as good as new._
  - Failure: tool durability -20 · _Alex whacks it in the wrong place. It smokes more now._
  - Critical failure: tool durability -40, the employee: away for 12 h · _The tool goes up in a puff of black smoke, and Alex needs the afternoon to wash off the soot._
- **It has always done that** (luck check 60 % base)
  - Success: nothing happens · _It has, apparently, always done that._
  - Failure: tool durability -30 · _It had not always done that. The tool is worse for it._

### Running on empty

> Alex fell asleep at their station today, and says they are fine.

- **When:** Happiness 40 or less, or Burnout or Worn Out.
- **Odds of showing up:** weight 8 · 1 employee · cooldown 10 days per employee
- **If you don't answer:** Say nothing (has consequences)
- **Give them two days off**
  - Always: the employee: away for 48 h, the employee: happiness +20 for 120 h
- **Send them to a doctor** (only for a Burnout; costs 3 days of their wage; check 50 % base)
  - Always: the employee: away for 24 h
  - Success: the employee: loses Burnout · _The doctor finds the cause. The burnout is behind them._
  - Failure: nothing happens · _The doctor prescribes rest, and not much else._
- **Ask them to push through** (check 50 % base)
  - Success: the employee: production +15 % for 48 h · _They dig deep and deliver. For now._
  - Failure: the employee: happiness -10 for 72 h · _They try, and resent you for asking._
  - Critical failure: the employee: happiness -10 for 72 h, the employee: gains Burnout · _Alex breaks down. It will stay with them._
- **Say nothing** (luck check 70 % base)
  - Always: the employee: happiness -5 for 72 h
  - Success: nothing happens · _They get through it somehow, and nobody mentions it again._
  - Failure: the employee: gains Burnout · _Nobody stepped in, and Alex burned out. It will stay with them._

### The lost letter

> Alex wrote a resignation letter, then lost it somewhere in the building. They are looking for it, very casually.

- **When:** Hired 7 days ago or more, with happiness 45 or less. Always possible for a Flight Risk, and twice as likely.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Pretend you know nothing (has consequences)
- **Find it first** (luck check 50 % base)
  - Success: the employee: happiness +5 for 72 h · _You find it behind the copier and hand it back without a word. Alex is grateful._
  - Failure: the employee: happiness -10 for 72 h · _You find it first, and Alex catches you reading it._
- **Ask them why** (check 45 % base (Loyal +10, Flight Risk -10))
  - Success: the employee: happiness +10 for 120 h · _Alex talks it through, and feels a lot better._
  - Critical success: the employee: happiness +10 for 120 h, the employee: loses Flight Risk · _Alex talks it through, and will not be writing another one._
  - Failure: the employee: happiness -5 for 72 h · _Alex denies everything, and avoids you all week._
- **Pretend you know nothing** (luck check 70 % base)
  - Always: the employee: happiness -5 for 72 h
  - Success: nothing happens · _The letter never turns up, and Alex stays on edge._
  - Failure: the company: happiness -5 for 48 h, the employee: gains Flight Risk · _Someone finds it and reads it out loud at lunch. Alex wants out more than ever._

### The safety inspector

> A safety inspector shows up unannounced. The fire exit, it turns out, is a painting of a door.

- **When:** A company with 3 or more employees at work.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 30 days per owner
- **If you don't answer:** Pretend nobody is in (has consequences)
- **Pay the “inspection fee”** (costs 1 day of their wage)
- **Have Alex give the tour** (check 50 % base)
  - Success: nothing happens · _Alex talks so fast that the inspector signs off just to leave._
  - Critical success: the company: happiness +5 for 72 h · _The inspector leaves charmed, and the whole staff cheers Alex all afternoon._
  - Failure: the company: production -15 % for 24 h · _Alex proudly points out the fire exit. The inspector orders a day of safety drills._
- **Pretend nobody is in**
  - Always: the company: production -15 % for 48 h · _The inspector comes back with a clipboard and a long list of safety drills._

## Inspiration events

### A hidden talent

> Alex fixed the machine with a paperclip in four seconds, then looked more surprised than anyone.

- **When:** A Diamond in the Rough or a Late Bloomer, with training potential left.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Not now
- **Pay for proper lessons** (costs 2 days of their wage; check 50 % base)
  - Success: the employee: a random stat +1 (uses Potential) · _The lessons pay off. Alex is a better worker for it._
  - Critical success: the employee: a random stat +1 (uses Potential), the employee: training potential +1 · _The teacher has never seen anything like it. Alex improves, and has room to grow even further._
  - Failure: nothing happens · _Alex cannot do it while anyone is watching, the teacher included._
- **Let it stay a hobby**
  - Always: the employee: happiness +10 for 120 h · _Alex fixes small things around the workshop with paperclips, very happily._
- **Not now**

### Eureka

> Alex bursts into your office: they have an idea to change how the work is done, and need a little room to try it.

- **When:** Happiness 60 or more, and either 5 days of experience in the company's good or Quick Study.
- **Odds of showing up:** weight 8 · 1 employee · cooldown 14 days per employee
- **If you don't answer:** Not now
- **Fund the idea** (costs 2 days of their wage; check 45 % base (Quick Study +10))
  - Success: the employee: Production +1 (uses Potential) · _It works. Alex is a better worker for it._
  - Critical success: the employee: Production +1 (uses Potential), the employee: training potential +1 · _It works beautifully, and Alex is already thinking about the next one._
  - Failure: nothing happens · _The prototype never quite works. The money is gone._
- **Let them experiment on company time** (check 60 % base (Quick Study +10))
  - Always: the employee: production -50 % for 12 h
  - Success: +5 days of experience in the good · _A slow day, but the team learned something about the trade._
  - Critical success: +10 days of experience in the good · _A slow day that taught more than a month of routine._
  - Failure: nothing happens · _A slow day, and nothing to show for it._
- **Not now**

### Notes on an arm

> Alex dreamed the solution to everything and wrote it on their arm before it faded. It is smudged.

- **When:** Happiness 60 or more.
- **Odds of showing up:** weight 3 · 1 employee · cooldown 21 days per employee
- **If you don't answer:** Not now
- **Help decipher it** (luck check 45 % base)
  - Success: +5 days of experience in the good · _Most of it is about the job, and some of it is right. Alex learns something about the trade._
  - Critical success: the employee: a random stat +1 (uses Potential) · _It really was the solution to something. Alex is a better worker for it._
  - Failure: the employee: happiness -5 for 48 h · _It says “buy milk”. Alex is crushed._
- **Buy them a notebook** (costs 0.5 days of their wage)
  - Always: the employee: happiness +10 for 120 h · _Alex is touched, and writes in it every morning. Mostly about dreams._
- **Not now**

### On fire

> Alex has been working like someone possessed all week, and asks to keep going through the night.

- **When:** Happiness 65 or more.
- **Odds of showing up:** weight 8 · 1 employee · cooldown 7 days per employee
- **If you don't answer:** Send them home to rest
- **Let the streak run** (check 55 % base)
  - Success: the employee: production +30 % for 24 h · _The streak holds. Output is way up._
  - Critical success: the employee: production +30 % for 48 h · _The streak holds for days. Output is way up._
  - Failure: the employee: production +15 % for 24 h, the employee: happiness -10 for 72 h · _Alex gets a lot done, then crashes, exhausted._
  - Critical failure: the employee: production +15 % for 24 h, the employee: happiness -10 for 72 h, the employee: gains Burnout · _Alex burns out completely, and it will stay with them._
- **Send them home to rest**
  - Always: the employee: happiness +5 for 48 h · _Alex grumbles, then comes back rested and grateful._

### Overheard at the bar

> Alex overheard a rival company's trade secret at the bar. It was not hard: their foreman was shouting it.

- **When:** Hired 7 days ago or more, with happiness 55 or more.
- **Odds of showing up:** weight 3 · 1 employee · cooldown 21 days per employee
- **If you don't answer:** Forget you heard it
- **Use it** (luck check 45 % base)
  - Success: the employee: production +20 % for 48 h · _Alex tries the trick. It works, and they work faster for it._
  - Critical success: the company: production +10 % for 48 h · _The trick works for everyone. The whole shift runs faster._
  - Failure: the employee: happiness -5 for 72 h · _It was a prank on the whole bar, and Alex fell for it._
- **Report the leak to the rival** (check 50 % base (Loyal +10))
  - Success: the employee: happiness +10 for 120 h · _The rival sends a thank-you card. Alex is proud to have done the right thing._
  - Critical success: the employee: happiness +10 for 120 h, the employee: gains Loyal · _The rival thanks your company in the paper. Alex has never been prouder to work here._
  - Failure: nothing happens · _The rival assumes it is a trick and slams the door._
- **Forget you heard it**

### The chart

> Alex has made a chart of everyone's breaks. It is color-coded, laminated, and has a legend.

- **When:** A Foreman with at least one coworker.
- **Odds of showing up:** weight 6 · 1 employee · cooldown 21 days per employee, 7 days per owner
- **If you don't answer:** File it away
- **Pin it up**
  - Always: the company: production +10 % for 48 h, every coworker: happiness -10 for 72 h · _The breaks get shorter. So do the tempers._
- **Make a chart of their chart-making** (check 50 % base)
  - Success: the company: happiness +5 for 72 h · _Alex studies it for a long time, then laughs. Eventually._
  - Failure: the employee: happiness -15 for 72 h · _Alex did not laugh._
- **File it away**
  - Always: the employee: happiness -5 for 48 h · _Alex takes it well, for someone with three more at home._

### The night shift tinkerer

> Alex stayed after hours again. You find their tool in pieces on the bench, and they swear it will come out better than new.

- **When:** Holding a tool worn down to 50 durability or less. Twice as likely if Handy.
- **Odds of showing up:** weight 6 · 1 employee · cooldown 10 days per employee
- **If you don't answer:** Order the tool put back together
- **Let them finish** (check 45 % base (Handy +10, Improviser -10))
  - Success: tool repaired to full · _By morning the tool is as good as new._
  - Critical success: tool repaired to full, the employee: production +20 % for 48 h · _Better than new: Alex found a trick of their own and works faster for it._
  - Failure: tool durability -30 · _Something snapped. The tool is worse off than before._
- **Hand over a toolbox and do it properly** (costs 1 × Toolbox; check 75 % base (Handy +10))
  - Success: tool repaired to full · _With the right parts, the tool is as good as new._
  - Critical success: tool repaired to full, the employee: production +20 % for 48 h · _Good as new, and Alex is so pleased with it that they work faster._
  - Failure: tool durability +30 · _The toolbox helped only halfway: the tool is better, not new._
- **Order the tool put back together**
  - Always: the employee: happiness -3 for 48 h · _Alex reassembles it in silence, a little hurt._

### The sandwich

> Alex dropped a sandwich into the machine, and output went up. Nobody knows why, least of all them.

- **When:** Happiness 55 or more.
- **Odds of showing up:** weight 3 · 1 employee · cooldown 21 days per employee, 14 days per owner
- **If you don't answer:** Ban sandwiches near the machine
- **Fund proper research** (costs 1 day of their wage; check 45 % base)
  - Success: the company: production +10 % for 48 h · _Science confirms it: ham works. The whole shift runs faster._
  - Critical success: the company: production +10 % for 72 h · _Science confirms it, and adds pickles. The whole shift runs faster, for longer._
  - Failure: nothing happens · _The research finds nothing. It was a coincidence, and an expensive one._
- **Keep feeding it sandwiches** (luck check 50 % base)
  - Success: the employee: production +15 % for 24 h · _Alex keeps the machine fed, and works faster beside it._
  - Failure: every coworker: happiness -3 for 48 h · _The machine now smells of old tuna. Nobody else is pleased._
- **Ban sandwiches near the machine**

### The shortcut

> Alex has found a faster way to do the job. It involves a ramp, and a running start.

- **When:** Holding a tool, and Handy or Improviser.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 21 days per employee
- **If you don't answer:** Ban the ramp
- **Adopt the ramp** (check 50 % base (Handy +10))
  - Success: +5 days of experience in the good · _It works. Alex learns days' worth of the trade in an afternoon._
  - Critical success: +10 days of experience in the good · _It works brilliantly. Alex learns more in an afternoon than in the last two weeks._
  - Failure: tool durability -20 · _Alex took the ramp. Their tool took the damage._
  - Critical failure: tool durability -20, the employee: away for 12 h · _Alex took the ramp too fast. The tool is dented, and so are they, for the afternoon._
- **Ban the ramp**
  - Always: the employee: happiness -5 for 48 h · _Alex goes back to the slow way, sulking._

## Legendary events

### A strange mood

> Alex has not slept, staring at the workshop door and muttering about something no one else can see.

- **When:** Rare. Someone hired 7 days ago or more who is Craftsman, Specialist or Handy, or has 15 days of experience in the company's good, if a tool exists for that good.
- **Odds of showing up:** weight 1 · 1 employee · cooldown 60 days per owner
- **If you don't answer:** Refuse
- **Give them the workshop**
  - Always: follow-up “The demand” right away · _The door locks behind them. A demand will follow soon._
- **Refuse**
  - Always: the employee: happiness -10 for 72 h

### The golden hour

> For one shift, Alex works like a legend. Everything they touch comes out right.

- **When:** Rare. Hired 14 days ago or more, with happiness 60 or more and training potential left.
- **Odds of showing up:** weight 1 · 1 employee · once per employee · cooldown 60 days per owner
- **If you don't answer:** Let it flow
- **Let it flow**
  - Always: the employee: a random stat +1 (uses Potential), the employee: production +40 % for 24 h · _Alex rides it to the end of the shift, and some of it sticks for good._
- **Ask them for a second shift** (check 50 % base)
  - Success: the employee: a random stat +2 (uses Potential), the employee: training potential +1 · _Alex keeps going through the night, and comes out better, with more left to train._
  - Critical success: the employee: a random stat +2 (uses Potential), the employee: training potential +1, the employee: gains a random positive trait · _Alex goes all night, and comes out changed for the better, in more ways than one._
  - Failure: the employee: a random stat +1 (uses Potential) · _The magic fades halfway through the night, but Alex still learned something._
  - Critical failure: the employee: a random stat +1 (uses Potential), the employee: gains Burnout · _Alex learned something, but the second shift burned them out._

## Life events

### A bad horoscope

> Alex's horoscope promises a great misfortune at work today. They refuse to touch the machine.

- **When:** Can happen to anyone.
- **Odds of showing up:** weight 3 · 1 employee · cooldown 30 days per employee, 14 days per owner
- **If you don't answer:** Make them work anyway
- **Give them the day off**
  - Always: the employee: away for 24 h, the employee: happiness +5 for 72 h
- **Find a better horoscope** (check 50 % base)
  - Success: the employee: production +10 % for 24 h · _Another paper promises a day of great success. Alex believes it, and works faster._
  - Failure: the employee: happiness -5 for 48 h · _Every paper agrees: doom. Alex is more worried than before._
- **Make them work anyway** (luck check 60 % base)
  - Success: nothing happens · _Alex works all day, flinching. Nothing happens._
  - Failure: tool durability -15 · _The horoscope was right: Alex's tool takes a nasty knock._

### A cursed tool

> Alex is certain their tool is cursed. It squeaked at them. Twice.

- **When:** Holding a tool. Twice as likely for a Gambler.
- **Odds of showing up:** weight 3 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** It is not cursed
- **Oil the hinge** (check 55 % base (Handy +10))
  - Success: tool durability +20, the employee: happiness +5 for 48 h · _It was just the hinge._
  - Failure: the employee: happiness -5 for 48 h · _It still squeaks. It is definitely cursed now._
- **Call an exorcist** (costs 1 day of their wage; luck check 60 % base)
  - Success: the employee: happiness +10 for 120 h, the employee: production +10 % for 24 h · _The tool is officially uncursed. There is a certificate._
  - Critical success: the employee: happiness +10 for 120 h, the employee: production +10 % for 24 h, tool repaired to full · _Uncursed, certified, and the exorcist fixed the squeak too._
  - Failure: the employee: happiness -10 for 72 h · _The exorcist says it is very cursed, and leaves quickly._
- **It is not cursed**
  - Always: the employee: happiness -5 for 48 h · _Alex keeps working, and keeps an eye on the tool._

### A letter from home

> Alex got a letter from their family, and reads it at every break.

- **When:** Working abroad, with happiness 45 or less. Always possible abroad for a Homesick, and twice as likely.
- **Odds of showing up:** weight 6 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Not now
- **Pay for a trip home** (only for a Homesick; costs 4 days of their wage; luck check 40 % base)
  - Always: the employee: away for 24 h, the employee: happiness +15 for 120 h
  - Success: the employee: loses Homesick · _The trip settles something: the homesickness is gone._
  - Failure: nothing happens · _A lovely trip, but the homesickness came back with them._
- **Promise a trip later**
  - Always: the employee: happiness +5 for 48 h, follow-up “A promise to keep” in 168 h · _They will hold you to it. In a week, they will be packing._
- **Not now**
  - Always: the employee: happiness -5 for 72 h
- **Pay for a short visit home** (costs 3 days of their wage)
  - Always: the employee: away for 24 h, the employee: happiness +15 for 120 h

### A new job title

> Alex would like a new job title, and has drafted a few. “Supreme Commander of their good” is their favorite.

- **When:** A Climber or a Prima Donna, after 7 days in the company.
- **Odds of showing up:** weight 5 · 1 employee · once per employee · cooldown 7 days per owner
- **If you don't answer:** No
- **Grant the title**
  - Always: the employee: happiness +15 for 168 h, follow-up “Supreme Commander” in 120 h · _Alex has business cards printed before lunch._
- **Offer “Senior Worker” instead** (check 50 % base)
  - Success: the employee: happiness +5 for 72 h · _“Senior Worker” it is. It will do, for now._
  - Failure: the employee: happiness -5 for 72 h · _Alex was hoping for at least “Commander”._
- **No**
  - Always: the employee: happiness -5 for 48 h · _Alex crosses out “Supreme” and keeps drafting._

### A party of one

> Alex has founded a political party. Membership: Alex.

- **When:** A Tax-shy or a Statist.
- **Odds of showing up:** weight 5 · 1 employee · cooldown 30 days per employee, 7 days per owner
- **If you don't answer:** Ignore the leaflets
- **Join the party**
  - Always: the employee: happiness +15 for 168 h, every coworker: happiness -3 for 48 h · _Now there are two of you, and lunch is unbearable._
- **Found a rival party** (check 50 % base)
  - Success: the company: happiness +5 for 120 h · _The lunch debates are the best show in town._
  - Failure: the employee: happiness +5 for 72 h · _You lose the election 1 to 0._
- **Ban politics at work**
  - Always: the employee: happiness -10 for 72 h, every coworker: happiness +3 for 48 h · _Alex goes underground. The party lives on._
- **Ignore the leaflets**
  - Always: the employee: happiness -5 for 48 h · _Nobody reads the leaflets. Alex takes it personally._

### A taste of home

> Alex brought a snack from home to share. It is either a delicacy or a war crime.

- **When:** Working abroad, an Expat or a Cosmopolitan, with at least one coworker.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Politely decline
- **Try it** (luck check 50 % base)
  - Success: the employee: happiness +10 for 120 h, every coworker: happiness +5 for 72 h · _It is a delicacy. Alex is beaming, and the others want the recipe._
  - Failure: the employee: happiness -5 for 48 h · _It is a war crime. Alex saw your face._
- **Order a crate for everyone** (costs 1 day of their wage)
  - Always: the company: happiness +5 for 120 h, the employee: happiness +10 for 120 h · _Alex is so proud. The whole company eats the snack now, whatever it is._
- **Politely decline**
  - Always: the employee: happiness -5 for 48 h · _Alex eats it alone, looking a little homesick._

### Green grapes only

> Alex will not start work until a bowl of green grapes, only green, is waiting at their station.

- **When:** A Prima Donna with at least one coworker.
- **Odds of showing up:** weight 6 · 1 employee · cooldown 21 days per employee, 7 days per owner
- **If you don't answer:** No grapes
- **Provide the grapes** (costs 1 day of their wage)
  - Always: the employee: happiness +10 for 120 h, the employee: production +15 % for 48 h · _Alex eats one grape, nods, and works like a star._
- **Negotiate: mixed grapes** (check 45 % base)
  - Success: the employee: happiness +5 for 48 h · _Alex accepts mixed grapes, under protest._
  - Failure: the employee: happiness -10 for 72 h · _Alex eats the red ones one at a time, staring at you._
- **No grapes**
  - Always: the employee: happiness -10 for 48 h · _Alex works, but sighs loudly every few minutes._

### Karaoke night

> Alex signed the whole company up for the regional karaoke contest. The first round is tonight.

- **When:** A company with 3 or more employees at work.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 21 days per owner
- **If you don't answer:** Withdraw the company
- **Everyone sings** (costs 1 day of their wage; check 40 % base (Comic +10, Sociable +10, Loner -10))
  - Success: the company: happiness +10 for 120 h · _No prize, but the whole company sang together. Spirits are high._
  - Critical success: the company: happiness +10 for 120 h, gold: 3 days of their wage · _You win the regional title, and the prize money. The trophy goes on the machine._
  - Failure: the company: happiness -5 for 48 h · _The company is booed off the stage. Nobody speaks of it the next morning._
- **Send them alone** (luck check 40 % base)
  - Success: the employee: happiness +15 for 168 h · _Alex brings the house down, solo, and talks about it all week._
  - Failure: the employee: happiness -10 for 72 h · _Alex forgot the words in the first line, and the tune in the second._
- **Withdraw the company**
  - Always: the employee: happiness -5 for 48 h · _Alex sings in the storeroom instead, defiantly._

### Midlife crisis

> Alex bought a motorbike, dyed their hair and wants to reinvent themselves.

- **When:** Aged 45 to 55.
- **Odds of showing up:** weight 5 · 1 employee · once per employee
- **If you don't answer:** Talk them out of it
- **Back the reinvention** (check 50 % base)
  - Success: the employee: a random stat +1 (uses Potential), the employee: loses a random negative trait · _The new them is an improvement, and an old habit is gone._
  - Critical success: the employee: a random stat +1 (uses Potential), the employee: loses a random negative trait, the employee: gains a random positive trait · _A whole new person, in the best way._
  - Failure: the employee: happiness -10 for 120 h · _The reinvention fizzles out, and they sulk about it._
  - Critical failure: experience in the good reset to 0, the employee: happiness -10 for 120 h · _The reinvention wipes out what they knew of the trade._
- **Talk them out of it**
  - Always: the employee: happiness -5 for 72 h

### Night classes

> Alex found a course that runs after work and wants to learn, if you will help.

- **When:** Aged 40 or younger, with training potential left.
- **Odds of showing up:** weight 7 · 1 employee · cooldown 14 days per employee
- **If you don't answer:** Not now
- **Pay for the course** (costs 3 days of their wage; check 55 % base (Quick Study +10))
  - Success: the employee: training potential +1 · _The course opens doors: there is more to train now._
  - Critical success: the employee: training potential +2 · _Top of the class: there is much more to train now._
  - Failure: nothing happens · _The course was a disappointment. The money is gone._
- **Teach them yourself** (costs 5 energy; check 60 % base (Quick Study +10))
  - Success: the employee: a random stat +1 (uses Potential) · _Your evenings together pay off: a real improvement._
  - Critical success: the employee: a random stat +1 (uses Potential), the employee: training potential +1 · _Your evenings together pay off, and then some._
  - Failure: nothing happens · _Neither of you had the energy. Nothing stuck._
- **Not now**

### Stuck in the lift

> The lift broke down between two floors with Alex inside. They are reading their will through the door.

- **When:** Only a Claustrophobe.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Wait for it to restart
- **Pry the doors open** (check 50 % base (Handy +15))
  - Success: the employee: happiness +5 for 48 h · _The doors give. Alex hugs the first coworker in sight._
  - Failure: the employee: away for 12 h · _The crowbar bends. Alex spends the afternoon in the lift._
- **Talk them through it** (check 40 % base (Comic +10))
  - Success: the employee: happiness +10 for 72 h · _Alex calms down and breathes. The lift starts again on its own._
  - Critical success: the employee: happiness +10 for 72 h, the employee: loses Claustrophobe · _Alex calms down so well that small rooms no longer scare them at all._
  - Failure: the employee: away for 12 h · _Alex stops listening after your third joke. It is a long afternoon in there._
- **Call a technician** (costs 1 day of their wage)
  - Always: the employee: away for 6 h
- **Wait for it to restart**
  - Always: the employee: away for 12 h, the employee: happiness -5 for 72 h

### The chair

> Someone moved Alex's chair eleven centimeters to the left. Work has stopped.

- **When:** Only a Creature of Habit.
- **Odds of showing up:** weight 5 · 1 employee · cooldown 21 days per employee, 7 days per owner
- **If you don't answer:** Leave it
- **Put it back exactly** (luck check 60 % base)
  - Success: the employee: production +10 % for 24 h · _Perfect. Alex sits down with a sigh and makes up for lost time._
  - Failure: the employee: happiness -10 for 48 h · _Two centimeters off. It is worse now._
- **Tell them it is just a chair** (check 35 % base)
  - Success: nothing happens · _Alex copes. Barely._
  - Critical success: the employee: loses Creature of Habit · _Alex has grown as a person._
  - Failure: the employee: happiness -5 for 48 h · _Alex does not agree that it is just a chair._
- **Leave it**
  - Always: the employee: production -10 % for 24 h · _Alex spends the day adjusting it by feel._

### The dawn workout

> Alex has started a workout club at six in the morning, before the shift. They are already shouting encouragement at the door.

- **When:** A Trainer with at least one coworker.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Ban the club
- **Join in yourself** (costs 5 energy)
  - Always: the company: production +5 % for 48 h, every coworker: happiness -3 for 48 h · _With you sweating along, the whole shift works harder, and grumbles._
- **Sponsor the club** (costs 1 day of their wage; check 50 % base)
  - Success: the company: happiness +5 for 120 h, the company: production +5 % for 48 h · _New mats, new towels, and a fitter, happier shift._
  - Failure: the employee: away for 12 h · _Alex pulled a muscle showing the first exercise, and needs half a day to walk again._
- **Ban the club**
  - Always: the employee: happiness -5 for 48 h · _Alex does push-ups alone by the machine, disappointed._

### The ladders

> Since Alex joined, three ladders have fallen over, the clock runs backwards and the cat has left.

- **When:** Only a Jinx.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Embrace the curse
- **Call a fortune teller** (costs 3 days of their wage; luck check 35 % base)
  - Success: the employee: loses Jinx · _The curse is lifted. The clock runs forwards again, and Alex is as lucky as anyone._
  - Failure: the employee: happiness -5 for 48 h · _The fortune teller takes one look at Alex and runs, which hurts._
- **Keep them away from the machines**
  - Always: the employee: production -10 % for 48 h, tool durability +10 · _Alex works slowly from a safe distance, and their tool gets a rest._
- **Embrace the curse** (luck check 60 % base)
  - Success: the company: happiness +3 for 48 h · _The company adopts the curse as a mascot. Morale is oddly up._
  - Failure: tool durability -10 · _The curse embraces you back: Alex's tool falls off a ladder._

### The mustache

> Alex has been seen working evenings at a rival firm, in a fake mustache. It is not fooling anyone.

- **When:** Hired 7 days ago or more, and Greedy, Climber or with happiness 45 or less.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 21 days per employee
- **If you don't answer:** Let it slide
- **Confront them** (check 50 % base)
  - Success: the employee: production +15 % for 48 h · _Alex quits the other job, and is well rested now._
  - Failure: the employee: happiness -5 for 72 h · _Alex denies everything. The mustache stays on._
- **Go undercover yourself** (costs 0.5 days of their wage; luck check 35 % base)
  - Success: +5 days of experience in the good · _You come back with their tricks, and Alex is thrilled to learn them._
  - Critical success: +10 days of experience in the good · _You come back with every trick they have. Alex is impressed._
  - Failure: nothing happens · _You were recognized at the door. So was the mustache._
- **Let it slide**
  - Always: the employee: production -10 % for 48 h · _Alex keeps both jobs, and yawns through this one._

### The van race

> Alex has challenged the delivery van to a race, to the depot and back. The driver accepted.

- **When:** Only a Sprinter.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Forbid the race
- **Bet on them** (costs 1 day of their wage; luck check 45 % base)
  - Success: cost refunded × 2 · _Alex wins by a nose. Your bet pays double._
  - Failure: nothing happens · _The van wins. So does the driver, who took your bet._
- **Cheer from the window**
  - Always: the employee: happiness +10 for 72 h, the employee: production -10 % for 12 h · _Alex wins, and spends the rest of the day out of breath._
- **Forbid the race**
  - Always: the employee: happiness -5 for 48 h · _Alex glares at the van every time it passes._

### The winning ticket

> Alex is running laps of the workshop, waving a lottery ticket and shouting that they won.

- **When:** Rare. Anyone hired 7 days ago or more, twice as likely for a Gambler.
- **Odds of showing up:** weight 1 · 1 employee · cooldown 45 days per owner
- **If you don't answer:** Check the numbers first
- **Pop the champagne** (costs 1 day of their wage; luck check 10 % base; risky)
  - Success: gold: 10 days of their wage, every coworker: happiness +10 for 120 h, the employee: leaves the company (retired) · _Alex really won, buys everyone dinner, tips you handsomely and retires the next morning._
  - Failure: every coworker: happiness +5 for 48 h, the employee: happiness -5 for 48 h · _It was last week's draw. The champagne was still good._
- **Check the numbers first**
  - Always: the employee: happiness -5 for 48 h · _It was last week's draw. Alex returns to work, very quietly._

### Time to retire

> Alex has been talking about retirement, and is ready to hang up their apron.

- **When:** Always, for every employee who turns 65, then again every 10 days while they stay. Each year past 65 takes 5 % off the odds of keeping them.
- **Odds of showing up:** 1 employee · always happens when its trigger is met
- **If you don't answer:** Not now, ask again in 10 years (has consequences)
- **Honor their career** (luck check 70 % base; risky)
  - Critical success: the heir inherits a trait, every coworker: happiness +10 for 120 h, the employee: leaves the company (retired) · _Alex retires with a party, and leaves something of themselves behind._
  - Success: the heir: a random stat +1 (free, no Potential used), every coworker: happiness +10 for 120 h, the employee: leaves the company (retired) · _Alex retires with a party, after teaching a coworker one last trick._
  - Failure: every coworker: happiness +10 for 120 h, the employee: leaves the company (retired) · _Alex retires with a party, and takes their secrets with them._
- **Convince them to stay 10 more years** (costs 5 days of their wage; check 65 % base (Loyal +15); risky)
  - Success: the employee: happiness +10 for 168 h · _Alex laughs, and agrees to 10 more years._
  - Failure: the employee: happiness -10 for 120 h · _Alex stays, but grumbles about it._
  - Critical failure: the employee: leaves the company (retired) · _Alex thanks you, and retires anyway._
- **Not now, ask again in 10 years** (luck check 70 % base; risky)
  - Success: the employee: happiness -5 for 72 h · _They let it drop, and stay 10 more years._
  - Failure: the employee: leaves the company (retired) · _Alex stops waiting for your blessing and retires, with no send-off._

### War stories

> Alex is telling their war story again, for the fortieth time. The enemy army gets bigger every time.

- **When:** A Veteran with at least one coworker.
- **Odds of showing up:** weight 4 · 1 employee · cooldown 30 days per employee
- **If you don't answer:** Change the subject
- **Listen to the whole thing**
  - Always: the employee: happiness +10 for 120 h, every coworker: production -5 % for 24 h · _Alex glows. The others lose the afternoon to an army of ten thousand._
- **Ask how it ends** (check 45 % base)
  - Success: every coworker: happiness +5 for 72 h · _For once, Alex reaches the ending. The others applaud, mostly from relief._
  - Failure: the employee: happiness -10 for 72 h · _Alex is offended: you do not ask how a war ends._
- **Change the subject**
  - Always: the employee: happiness -5 for 48 h · _Alex sulks, and starts the story again at lunch._

### Work anniversary

> It is Alex's work anniversary. Nobody remembers the date, including Alex.

- **When:** 30 days or more in the company. Twice as likely for an Anchor or a Veteran.
- **Odds of showing up:** weight 3 · 1 employee · cooldown 60 days per employee
- **If you don't answer:** Let it pass
- **Throw a party** (costs 1 day of their wage)
  - Always: the employee: happiness +15 for 168 h, every coworker: happiness +5 for 48 h · _Alex pretends not to be moved. It does not work._
- **Grab whatever cake the shop has left** (luck check 50 % base)
  - Success: the employee: happiness +10 for 120 h · _The only cake left said “Happy Retirement”. Alex finds it hilarious. It is a tradition now._
  - Failure: the employee: happiness -10 for 72 h · _The only cake left said “Happy Retirement”. Alex starts to wonder._
- **Let it pass**
  - Always: the employee: happiness -5 for 48 h · _Alex remembered, it turns out._

## Social events

### A friendship blooming

> Alex and Sam have been eating lunch together every day.

- **When:** Two coworkers with happiness 45 or more, neither of them with an Old Friends or Nemesis trait yet. Twice as likely if one is Sociable or Comic.
- **Odds of showing up:** weight 8 · 2 employees · cooldown 14 days per employee
- **If you don't answer:** Stay out of it
- **Encourage it** (check 35 % base (Sociable +10, Comic +5, Loner -15))
  - Success: they become Old Friends · _Alex and Sam are old friends now._
  - Critical success: they become Old Friends, both: happiness +10 for 120 h · _Alex and Sam are inseparable now._
  - Failure: both: happiness -10 for 72 h · _It fizzles out, a little awkwardly._
  - Critical failure: they become Nemesis · _A fight over nothing. Alex and Sam cannot stand each other now._
- **Stay out of it**

### A mentor's offer

> Alex offers to take Sam under their wing, if you allow work time for it.

- **When:** A Mentor or an employee with Production 6 or more, and a coworker with Production 3 or less and training potential left.
- **Odds of showing up:** weight 6 · 2 employees · cooldown 14 days per employee
- **If you don't answer:** Not now
- **Accept** (costs 10 energy; check 60 % base (Mentor +10))
  - Always: the employee: production -15 % for 24 h
  - Success: the partner: Production +1 (uses Potential) · _Sam learns fast._
  - Critical success: the partner: Production +1 (uses Potential), the partner: training potential +1 · _Sam learns fast, and wants to learn more._
  - Failure: nothing happens · _The lessons do not take._
- **Not now**

### A scuffle

> Alex and Sam came to blows over who moved whose tools. Everyone is waiting to see what you do.

- **When:** Two coworkers, when one of them is Bully, Rival, Xenophobe or Envious, is the other's Nemesis, or has happiness 40 or less.
- **Odds of showing up:** weight 8 · 2 employees · cooldown 7 days per employee
- **If you don't answer:** Let them sort it out
- **Side with Alex**
  - Always: the employee: happiness +10 for 72 h, the partner: happiness -10 for 72 h
- **Side with Sam**
  - Always: the partner: happiness +10 for 72 h, the employee: happiness -10 for 72 h
- **Sit them down together** (check 40 % base (Comic +10, Bully -10))
  - Success: both: happiness +5 for 72 h · _They shake hands, grudgingly._
  - Critical success: both: happiness +5 for 72 h, Nemesis ends · _They talk it out for real. Whatever was between them is over._
  - Failure: both: happiness -10 for 72 h · _The talk goes badly. Now they are both angry._
- **Let them sort it out**
  - Always: both: happiness -5 for 48 h

### Checking the inventory

> Alex and Sam have been checking the inventory together a lot. The inventory has never been more checked.

- **When:** Two coworkers hired 7 days ago or more, with happiness 45 or more and at most 15 years apart, neither of them with a Sweethearts trait yet, and not each other's Nemesis.
- **Odds of showing up:** weight 2 · 2 employees · cooldown 30 days per employee, 21 days per owner
- **If you don't answer:** Pretend not to notice
- **Pretend not to notice**
  - Always: both: happiness +5 for 72 h · _The inventory remains extremely well checked._
- **Encourage it** (check 35 % base (Sociable +5))
  - Success: they become Sweethearts, follow-up “Trouble in paradise” in 336 h · _Alex and Sam are officially together. The whole workshop pretends to be surprised._
  - Critical success: they become Sweethearts, both: happiness +10 for 168 h · _Alex and Sam are officially together, and it is the real thing._
  - Failure: both: happiness -5 for 72 h · _Your encouragement makes it awkward. It fizzles out._
- **No romance on the clock**
  - Always: both: happiness -10 for 72 h · _The inventory is checked a normal amount again. Nobody is happy about it._

### The fort

> Sam has decided to become friends with Alex. Alex has responded by building a wall of crates.

- **When:** A Loner and a Sociable coworker, neither of them with an Old Friends or Nemesis trait yet.
- **Odds of showing up:** weight 6 · 2 employees · cooldown 30 days per employee
- **If you don't answer:** Stay out of it
- **Let Sam keep trying** (check 40 % base)
  - Success: they become Old Friends · _It took eleven days and one sandwich. Alex and Sam are old friends now._
  - Failure: the employee: happiness -10 for 72 h · _The wall is taller now._
  - Critical failure: they become Nemesis · _Alex has added a moat. Sam is not welcome._
- **Tell Sam to back off**
  - Always: the employee: happiness +5 for 72 h, the partner: happiness -5 for 48 h · _Sam backs off. The fort stands._
- **Stay out of it**

### The great soup debate

> Alex says soup is a drink. Sam says it is food. They have not spoken in three days.

- **When:** Two coworkers, neither of them with an Old Friends or Nemesis trait yet. Twice as likely if one is Rival, Envious or Prima Donna.
- **Odds of showing up:** weight 3 · 2 employees · cooldown 30 days per employee, 14 days per owner
- **If you don't answer:** Stay out of it
- **Soup is a drink**
  - Always: the employee: happiness +10 for 72 h, the partner: happiness -10 for 72 h · _Alex is vindicated. Sam is not._
- **Soup is food**
  - Always: the partner: happiness +10 for 72 h, the employee: happiness -10 for 72 h · _Sam is vindicated. Alex is not._
- **Ban soup** (check 40 % base (Sociable +10, Comic +5))
  - Success: the company: happiness +5 for 72 h · _The whole lunchroom is united in outrage against you. For a few days, everyone gets along._
  - Critical success: they become Old Friends · _United in outrage against you, Alex and Sam are inseparable now._
  - Failure: the company: happiness -5 for 72 h · _Now everyone is upset about soup._
  - Critical failure: the company: happiness -5 for 72 h, they become Nemesis · _Alex and Sam blame each other for the ban. It is personal now._
- **Stay out of it**
  - Always: both: happiness -5 for 48 h · _The silence continues. It is very loud._

### The haircut

> Alex and Sam showed up with the exact same haircut. Neither will speak first.

- **When:** Two coworkers, neither of them with an Old Friends or Nemesis trait yet.
- **Odds of showing up:** weight 2 · 2 employees · cooldown 30 days per employee, 14 days per owner
- **If you don't answer:** Stay out of it
- **Laugh about it** (luck check 50 % base)
  - Success: they become Old Friends · _They laugh too. Alex and Sam are old friends now, and share a barber._
  - Failure: both: happiness -5 for 48 h · _Neither of them laughs. Now it is your fault._
- **Buy Alex a hat** (costs 0.5 days of their wage)
  - Always: the employee: happiness +5 for 72 h, the partner: happiness -5 for 48 h · _Alex wears the hat proudly. Sam wanted the hat._
- **Stay out of it**

### The lunch thief

> Alex accuses Sam of eating a labeled lunch. The note on the fridge gets more threatening every day.

- **When:** Two coworkers, in a company with 3 or more employees at work.
- **Odds of showing up:** weight 3 · 2 employees · cooldown 30 days per employee, 14 days per owner
- **If you don't answer:** Stay out of it
- **Believe Alex**
  - Always: the employee: happiness +10 for 72 h, the partner: happiness -10 for 72 h · _Sam is officially the lunch thief. Alex eats in peace._
- **Believe Sam**
  - Always: the partner: happiness +10 for 72 h, the employee: happiness -10 for 72 h · _Sam is cleared. Alex now guards the fridge alone._
- **Leave a very spicy bait lunch** (luck check 50 % base)
  - Success: the company: happiness +5 for 72 h · _The thief takes the bait, loudly. The whole workshop enjoys it._
  - Failure: the employee: away for 6 h · _Alex ate the bait by mistake, and needs the afternoon off._
- **Stay out of it**
  - Always: both: happiness -5 for 48 h · _The note on the fridge now mentions lawyers._

### The prank war

> The stapler is in jelly. Alex and Sam are at war, and the pranks are getting bigger.

- **When:** A Comic and a coworker, neither of them with an Old Friends or Nemesis trait yet.
- **Odds of showing up:** weight 4 · 2 employees · cooldown 30 days per employee
- **If you don't answer:** Call a ceasefire
- **Join in** (check 45 % base (Comic +10))
  - Success: the company: happiness +10 for 72 h · _Your prank is the best yet. The whole workshop is in stitches._
  - Failure: the company: production -10 % for 24 h · _Your prank goes too far. Work slows to a crawl while everyone cleans up._
- **Call a ceasefire**
  - Always: both: happiness -5 for 48 h · _The stapler comes out of the jelly. Alex and Sam sulk._
- **Let it escalate** (luck check 40 % base)
  - Success: they become Old Friends · _The pranks become legend. Alex and Sam are old friends now._
  - Failure: both: happiness -5 for 48 h · _A desk ends up on the roof. Nobody is laughing anymore._
  - Critical failure: they become Nemesis · _One prank goes too far. Alex and Sam are sworn enemies now._

### The thermostat war

> Alex wants the thermostat at 18 degrees, Sam at 26. Half the workshop wears coats, the other half shorts.

- **When:** Two coworkers, neither of them with an Old Friends or Nemesis trait yet.
- **Odds of showing up:** weight 3 · 2 employees · cooldown 30 days per employee, 14 days per owner
- **If you don't answer:** Stay out of it
- **Side with Alex**
  - Always: the employee: happiness +10 for 72 h, the partner: happiness -10 for 72 h · _18 degrees it is. Alex is happy, Sam is freezing._
- **Side with Sam**
  - Always: the partner: happiness +10 for 72 h, the employee: happiness -10 for 72 h · _26 degrees it is. Sam is happy, Alex is melting._
- **Install a fake thermostat** (luck check 50 % base)
  - Success: both: happiness +10 for 120 h · _Both of them turn the fake dial all day, and both are perfectly comfortable._
  - Failure: both: happiness -10 for 72 h · _Alex and Sam find out. Neither is speaking to you._
  - Critical failure: both: happiness -10 for 72 h, they become Nemesis · _Alex and Sam each think the other installed it. It is war now._
- **Stay out of it**
  - Always: both: happiness -5 for 48 h · _The thermostat goes up and down all day. Nobody is comfortable._

## World events

### A call to arms

> The region is under attack. Alex wants to leave their post and help defend it.

- **When:** The company's region is under attack, and the employee is a citizen of the country holding it, a Patriot or a Nationalist.
- **Odds of showing up:** weight 12 · 1 employee · cooldown 7 days per employee
- **If you don't answer:** Forbid it
- **Let them volunteer** (check 55 % base (Patriot +10); risky)
  - Always: the employee: away for 24 h
  - Success: the employee: happiness +10 for 168 h, the employee: Responsibility +1 (uses Potential) · _Alex comes back a day later, proud and steadier than before._
  - Failure: the employee: happiness -10 for 120 h · _Alex comes back wounded, and shaken._
  - Critical failure: the employee: leaves the company (killed) · _Alex did not come back._
- **Forbid it**
  - Always: the employee: happiness -5 for 72 h

### Air raid

> The air raid siren goes off in the middle of the shift. Alex looks at you, then at the shelter door.

- **When:** The company's region is under attack.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 7 days per owner
- **If you don't answer:** Everyone to the shelter
- **Everyone to the shelter**
  - Always: the company: away for 4 h
- **Keep working** (luck check 50 % base)
  - Success: the company: production +10 % for 24 h · _The planes pass over. Running on nerves, the team works faster._
  - Failure: the company: happiness -10 for 72 h · _Nothing hits, but nobody enjoyed working under the siren._
  - Critical failure: the company: happiness -10 for 72 h, the employee: away for 48 h · _A window blows in nearby. Alex is only scratched, but stays home for a while to calm down._

### Leaflets from the sky

> Enemy planes dropped propaganda leaflets all over the workshop. Alex is reading one with great interest.

- **When:** The company's region is under attack. Twice as likely for a Cosmopolitan.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 21 days per employee
- **If you don't answer:** Use them as notepaper
- **Burn them all** (check 50 % base (Patriot +10))
  - Success: the company: happiness +3 for 48 h · _A patriotic bonfire. Everyone feels a little warmer._
  - Failure: nothing happens · _The leaflets are too damp to burn. It is a sad little bonfire._
- **Use them as notepaper**
  - Always: every coworker: happiness +3 for 48 h · _Free paper, blank on the back. The coworkers are delighted._
- **Let them read** (luck check 60 % base)
  - Success: the employee: happiness +10 for 72 h · _Alex mostly enjoys the comics on the back._
  - Failure: the employee: gains Flight Risk · _Alex reads every word, and starts wondering about life on the other side._

### Rationing

> War rationing has reached the canteen: only beige food until further notice. Alex has started ranking the shades.

- **When:** The company's region is under attack, with 2 or more employees at work.
- **Odds of showing up:** weight 2 · 1 employee · cooldown 14 days per owner
- **If you don't answer:** Eat the beige
- **Smuggle in some spices** (costs 1 day of their wage)
  - Always: the company: happiness +5 for 120 h · _A pinch of pepper, and the whole canteen cheers._
- **Give a patriotic speech** (check 45 % base (Patriot +10, Nationalist +5))
  - Success: the company: happiness +5 for 72 h · _The beige tastes of victory now. Morale is up._
  - Failure: the company: happiness -5 for 72 h · _The speech runs long, and the beige goes cold._
- **Eat the beige**
  - Always: the company: happiness -3 for 48 h · _Everyone eats the beige. Nobody says a word._
