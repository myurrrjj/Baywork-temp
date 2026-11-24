# BayWork — Bay Area engineering workforce simulator

A quarter-by-quarter model of hiring, attrition, layoffs, graduations, retirements and pay across the Bay Area's
engineering workforce. It simulates every engineer and manager individually: about 270,000 people at default settings.

## Run it

Open `index.html` in a browser. There's no build step, no install and no network access; it works from `file://`.

- **Start / Stop**: the main button. <kbd>Space</kbd> also toggles.
- **+1 quarter**: steps through one quarter at a time.
- **Speed**: ½× to 8× (quarters per second).
- **Map**: scroll to zoom, drag to pan, ⤢ to reset.
  - Click an HQ for its org chart and hiring plan.
  - Click a city for its residents.
  - "Find a company" draws its commute shed: lines from where its people live to its HQ.
- **Raw data**: every engineer, company, city and quarter as sortable, filterable tables with CSV download. Click any row for detail, including an employee's career timeline.
- **Summary**: opens at the end of the run. It explains five findings with the run's own numbers, each with a one-click "Try" that reruns with one setting changed.
- Opening any detail view pauses the run so the numbers hold still.

Engine tests (Node ≥ 18, no dependencies): `node test/engine.test.js`

## What's modelled

**Map.** About 50 cities from San Rafael and Concord down to Los Gatos, east to Pleasanton, with 2020 Census populations. The shoreline, islands, freeways and bridges are traced by hand.

**Companies.** 500 Bay Area–headquartered companies:
- **100 named companies**, whose Bay Area engineer counts are **my rough estimates, not sourced figures**, placed at their HQ city.
- **150 synthetic growth-stage companies** (30–140 engineers).
- **250 synthetic startups** (≤ 25 people). Synthetic companies are labelled as such everywhere.

The simulation runs **X** of them: the X/2 largest plus X/2 startups (default X = 200, so every named company is included).

**Org charts.** Every company starts as a 1:10 pyramid: E engineers → ⌈E/10⌉ managers → … → one head of engineering. The org chart shows actual people (with synthetic names), with an expandable reporting tree and the live span of control at each level.

**People.** Each person has:
- a home city, drawn in proportion to population;
- a level and years of experience;
- a comp, and the comp of the seat they hold (the "band");
- a status: employed · new grad looking · switching jobs · laid off and looking · retired · left the Bay Area.

## The rules, as given (all configurable)

| Rule | Implementation |
|---|---|
| X/2 large companies, X/2 startups; startups max 25 | Startups never exceed the cap (tested). |
| Hire ≤ 5% of headcount per quarter, minimum 5 | Applied per company per quarter. By default backfills count too (see below). |
| Half-life 4 years (large), 2 years (startup) | Quarterly exit probability 1 − ½^(1/(4·half-life)): 4.2% and 8.3%. |
| 10% raise per year; 5% of comp hiring cost | Raises go to incumbents each Q1. Every hire costs 5% of the offer. |
| A fixed position's comp grows 2% per year | Bands and open reqs grow 2% each Q1. A backfill reopens the leaver's seat at its band. |
| New grads 3% of the working population per year | They arrive in Q3, or spread across the year (setting). |
| Retirements 2% per year | The most experienced are the likeliest to retire. |
| Layoffs 5% per year (large), 20% (startups), at random | One round a year (Q1 by default). Laid-off seats are eliminated. Option: lay off the most over-band people first. |
| Laid-off people take a 20% discount | They ask 80% of their last comp. |
| A closer candidate accepts at 2× the rate at equal comp | P(accept) = 75% × (offer ÷ ask)^4 × ½^(commute ÷ 15 mi). So every 15 miles closer doubles acceptance. |

**How a hire happens.**
- Each open req screens 12 candidates from the pool, most experienced first.
- It offers each one their ask, capped at the band.
- Unfilled reqs raise their band 3% a quarter.
- Half of manager vacancies are filled by promoting an engineer from within, which reopens the engineer's seat instead.
- Candidates who stay idle lower their ask by 2% a quarter.

## Interpretations I had to choose

- **"The remaining 1%."** I read the brief's "3% grads in, 2% retire, remaining 1% laid off" as the net 1% of new supply each year. That 1% lands in the talent pool unless companies grow faster than they lay off. Explicit layoffs come from the per-company 5% / 20% rule.
- **Does the 5% cap include backfills?** The literal reading is yes, and that's the default. It has a striking consequence:
  - A large company loses about 23% of its people a year: 16% voluntary attrition (from the 4-year half-life), 5% layoffs and about 2% retirements.
  - A 5% quarterly cap lets it hire only about 20% a year.
  - So with defaults, big companies shrink about 22% over five years and unemployment climbs from 3% to about 28%.

  The toggle "Backfills count toward the cap" switches to the other reading. Then the market roughly clears, and unemployment drifts up about 1 point a year: the brief's 1%.
- **Funded growth.** Large companies grow 5%/yr (which offsets their layoffs). Startups grow 40%/yr up to their cap.
- **Starting pool.** 3% of the workforce starts out looking for work.
- **Pay levels.** Pay tiers and level bands are calibrated to typical Bay Area total comp.
- **Calibrated matching settings.** The acceptance curve, slate size and offer escalation are my calibration, chosen so the market clears when the cap doesn't bind. All are adjustable.

## Files

```
index.html            page shell
styles.css            light + dark themes, responsive
js/data/cities.js     cities, coordinates, populations
js/data/geo.js        shoreline, islands, freeways, bridges
js/data/companies.js  the 500-company universe
js/engine.js          the simulation (no DOM): people, org pyramids, quarterly step, stats, event log
js/ui/charts.js       formatting and SVG charts
js/ui/map.js          SVG map: projection, HQ layout, residents, hiring flows, commute sheds, zoom/pan
js/ui/overlays.js     company (org chart, hiring plan, people), city, raw data tables, employee timeline
js/ui/insights.js     end-of-run summary
js/app.js             controls, run loop, dashboard
test/engine.test.js   16 invariants: bookkeeping, caps, half-lives, layoffs, raises/bands, grads/retirements, offers ≤ band, commute sorting, determinism
```

## Simplifications

- Only engineers and engineering managers are modelled; all of them live and work in the Bay Area.
- Distance is straight-line × 1.2 between city centres, with 3 miles for a commute within the same city. There's no traffic or transit.
- Nobody moves house, companies don't move, and there's no remote work.
- Companies' growth plans are fixed rates and don't respond to the market. Only offers escalate.
