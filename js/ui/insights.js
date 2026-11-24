/* BayWork run summary — what the run shows, computed from the run. */
(function (root) {
  'use strict';

  var C = root.BWCharts, fmt = C.fmt, esc = C.esc, attr = C.attr, delta = C.delta;
  var W = root.Workforce;

  function sumSeries(series, key, from) {
    var t = 0;
    for (var i = from || 1; i < series.length; i++) t += series[i][key] || 0;
    return t;
  }
  function tryBtn(patch, text) {
    return '<button class="try" type="button" data-patch="' + attr(JSON.stringify(patch)) + '">' + text + ' <span aria-hidden="true">→</span></button>';
  }
  function card(n, title, body, action) {
    return '<article class="insight"><div class="insight-n">' + n + '</div><div><h4>' + title + '</h4><p>' + body + '</p>' + (action || '') + '</div></article>';
  }
  function tile(label, value, sub) {
    return '<div class="tile"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div><div class="kpi-sub">' + (sub || '') + '</div></div>';
  }

  // Average event value (comp) for one event type over the last `quarters`.
  function recentEventMean(sim, type, quarters) {
    var E = sim.events, from = sim.q - quarters, total = 0, n = 0;
    for (var i = E.n - 1; i >= 0; i--) {
      if (E.q[i] < from) break;
      if (E.type[i] === type) { total += E.value[i]; n++; }
    }
    return n ? total / n : null;
  }

  function groupTotals(sim, kind) {
    var t = { start: 0, end: 0, leavers: 0, layoffs: 0, retired: 0, hires: 0, hcSum: 0, capQuarters: 0, quarters: 0 };
    sim.companies.forEach(function (c) {
      if (c.kind !== kind) return;
      var s = c.series;
      t.start += c.startHc;
      t.end += c.members.length;
      for (var i = 1; i < s.hc.length; i++) {
        t.leavers += s.leavers[i]; t.layoffs += s.layoffs[i]; t.retired += s.retired[i]; t.hires += s.hires[i];
        t.hcSum += s.hc[i - 1];
        t.quarters++;
        if (s.hires[i] >= s.cap[i] && s.unfilled[i] > 0) t.capQuarters++;
      }
    });
    return t;
  }

  function render(sim) {
    var cfg = sim.cfg, s = sim.series, first = s[0], last = s[s.length - 1];
    var quarters = s.length - 1;
    var years = quarters / 4;
    var labels = s.map(function (x) { return x.label; });
    if (!quarters) {
      return '<header class="sheet-head"><div><p class="eyebrow">Summary</p><h2 id="sheet-title">Nothing has run yet</h2></div>'
        + '<button class="btn icon" type="button" data-close aria-label="Close">✕</button></header><p class="muted">Press Start, or step one quarter.</p>';
    }
    var hires = sumSeries(s, 'hires'), leavers = sumSeries(s, 'leavers'), layoffs = sumSeries(s, 'layoffs');
    var retired = sumSeries(s, 'retired'), grads = sumSeries(s, 'grads'), spend = sumSeries(s, 'hireSpend');
    var hiresGrad = sumSeries(s, 'hiresGrad'), hiresSw = sumSeries(s, 'hiresSwitcher'), hiresLo = sumSeries(s, 'hiresLaidOff');
    var L = groupTotals(sim, 'large'), St = groupTotals(sim, 'startup');
    var nLarge = sim.companies.filter(function (c) { return c.kind === 'large'; }).length;
    var nStart = sim.companies.length - nLarge;
    var cards = [];

    // 1. The binding constraint.
    var lossRate = L.hcSum ? (L.leavers + L.layoffs + L.retired) / (L.hcSum / 4) : 0; // per year
    var hireRate = L.hcSum ? L.hires / (L.hcSum / 4) : 0;
    var capRate = cfg.hireCapPct * 4 / 100;
    var capShare = L.quarters ? L.capQuarters / L.quarters : 0;
    var largeChange = L.start ? L.end / L.start - 1 : 0;
    if (cfg.capIncludesBackfills) {
      cards.push(card(1, 'The hiring cap, not demand, sets the size of big companies.',
        'Large companies lost <b>' + fmt.pct(lossRate) + ' of their people a year</b>: voluntary attrition from a ' + cfg.halfLifeLarge + '-year half-life ('
        + fmt.pct(1 - Math.pow(0.5, 1 / cfg.halfLifeLarge)) + '), ' + cfg.layoffLargePct + '% layoffs and retirements. The cap lets them hire at most '
        + cfg.hireCapPct + '% a quarter (≈ ' + fmt.pct(capRate, 0) + ' a year), and backfills count against it, so they actually hired ' + fmt.pct(hireRate) + ' a year. '
        + fmt.pct(capShare, 0) + ' of large-company quarters ended at the cap with reqs still open. Their combined headcount went <b>'
        + fmt.int(L.start) + ' → ' + fmt.int(L.end) + ' (' + fmt.signedPct(largeChange) + ')</b>, and unemployment went from '
        + fmt.pct(first.unemployment) + ' to <b>' + fmt.pct(last.unemployment) + '</b>.'
        + '<span class="so">With attrition this high, a cap that includes replacement hiring is a shrink order. Real recruiting capacity has to scale with churn, not with headcount.</span>',
        tryBtn({ capIncludesBackfills: 0 }, 'Try exempting backfills from the cap')));
    } else {
      var lfGrowth = Math.pow(last.laborForce / first.laborForce, 1 / years) - 1;
      var empGrowth = Math.pow(last.employed / first.employed, 1 / years) - 1;
      cards.push(card(1, 'Jobs and people only balance if growth covers the layoffs.',
        'With backfills exempt from the cap, companies replaced most leavers. What moves unemployment is the gap between seats and people: funded seats at large companies grew '
        + cfg.growthLargePct + '% a year against ' + cfg.layoffLargePct + '% layoffs, so employment grew <b>' + fmt.signedPct(empGrowth) + ' a year</b>, while the engineer labour force grew <b>'
        + fmt.signedPct(lfGrowth) + ' a year</b> (' + cfg.gradPct + '% graduates in, ' + cfg.retirePct + '% retiring). Unemployment went ' + fmt.pct(first.unemployment) + ' → <b>' + fmt.pct(last.unemployment) + '</b>.'
        + '<span class="so">This is the “remaining 1%” in the brief: grads minus retirements is net new supply every year, and it lands in the pool unless companies grow faster than they lay off.</span>',
        tryBtn({ growthLargePct: cfg.growthLargePct + 3 }, 'Try ' + (cfg.growthLargePct + 3) + '% growth at large companies')));
    }

    // 2. The comp ratchet.
    var gap = last.avgBand ? last.avgComp / last.avgBand - 1 : 0;
    var leaveComp = recentEventMean(sim, W.EV.LEAVE, 4), hireComp = recentEventMean(sim, W.EV.HIRE, 4);
    var perHead = Math.pow(last.avgComp / first.avgComp, 1 / years) - 1;
    cards.push(card(2, 'Raises outrun the positions: churn quietly cuts payroll, and strands experienced people.',
      'Incumbents get ' + cfg.raisePct + '% a year while the seat they sit in grows ' + cfg.bandGrowthPct + '%. By the end, the average employee is paid <b>'
      + fmt.signedPct(gap) + ' versus their position’s band</b>. In the last year, leavers walked out at ' + fmt.money(leaveComp) + ' on average and were replaced at '
      + fmt.money(hireComp) + ' (' + fmt.signedPct(hireComp && leaveComp ? hireComp / leaveComp - 1 : null) + '). That’s why average pay per head grew only <b>'
      + fmt.signedPct(perHead) + ' a year</b>, not ' + cfg.raisePct + '%. The flip side: job-switchers ask for their inflated pay, which the band can’t meet, so <b>'
      + fmt.int(last.poolSwitcher) + '</b> of them were still looking at the end, against ' + fmt.int(last.poolLaidOff) + ' laid-off engineers, who ask ' + cfg.layoffDiscountPct + '% less and so clear faster.'
      + '<span class="so">Total hiring cost was ' + fmt.money(spend) + ' (' + cfg.hiringCostPct + '% of each hire’s comp), small next to the payroll saved by resetting seats to band.</span>',
      tryBtn({ layoffTargeting: 1 }, 'Try laying off the most over-band people first')));

    // 3. Who gets hired.
    var srcTotal = hiresGrad + hiresSw + hiresLo || 1;
    cards.push(card(3, 'Companies hire experience first; new grads queue.',
      'Of ' + fmt.int(hires) + ' hires, <b>' + fmt.pct(hiresSw / srcTotal, 0) + '</b> were job-switchers, <b>' + fmt.pct(hiresLo / srcTotal, 0) + '</b> laid-off engineers and <b>'
      + fmt.pct(hiresGrad / srcTotal, 0) + '</b> new grads, although ' + fmt.int(grads) + ' graduates entered the market. Recruiters screen the most experienced candidates on each slate first, and grads only qualify for engineer seats. At the end, '
      + fmt.int(last.poolGrad) + ' new grads were still looking, and the average person in the pool had been looking ' + last.avgIdleQ.toFixed(1) + ' quarters.'
      + '<span class="so">The pool also re-prices itself: every idle quarter, asks fall ' + cfg.reservationDecayPct + '% until someone bites. That decay is what eventually clears the market, not new jobs.</span>',
      tryBtn({ exitAfterQuarters: 8 }, 'Try letting people leave the Bay Area after 2 idle years')));

    // 4. Commute sorting.
    var rows = sim.cityStats().filter(function (r) { return r.laborForce > 300; }).sort(function (a, b) { return b.unemployment - a.unemployment; });
    var worst = rows.slice(0, 3).map(function (r) { return esc(r.name) + ' (' + fmt.pct(r.unemployment, 0) + ')'; }).join(', ');
    var best = rows.slice(-3).reverse().map(function (r) { return esc(r.name) + ' (' + fmt.pct(r.unemployment, 0) + ')'; }).join(', ');
    var hireCommute = 0, hc = 0;
    s.slice(1).forEach(function (x) { if (x.hireCommute != null) { hireCommute += x.hireCommute * x.hires; hc += x.hires; } });
    cards.push(card(4, 'Hiring pulls the workforce toward the HQs.',
      'The starting workforce was placed by population alone, so the average commute was ' + fmt.miles(first.avgCommute) + '. Because a candidate ' + cfg.nearbyMiles
      + ' miles closer is twice as likely to accept, new hires averaged <b>' + fmt.miles(hc ? hireCommute / hc : null) + '</b>, and the whole workforce now averages <b>'
      + fmt.miles(last.avgCommute) + '</b>. Unemployment is highest in ' + worst + ', and lowest in ' + best + '.'
      + '<span class="so">Distance is a quiet tax on far-out cities: their residents lose offers to closer candidates at equal pay, so they stay in the pool longer.</span>',
      tryBtn({ nearbyMiles: Math.max(5, Math.round(cfg.nearbyMiles / 2)) }, 'Try a stronger commute preference (' + Math.max(5, Math.round(cfg.nearbyMiles / 2)) + ' mi)')));

    // 5. Startups.
    var startTurnover = St.hcSum ? (St.leavers + St.layoffs) / (St.hcSum / 4) : 0;
    cards.push(card(5, 'Startups are revolving doors, and the hiring floor keeps them alive.',
      'With a ' + cfg.halfLifeStartup + '-year half-life and ' + cfg.layoffStartupPct + '% layoffs, the ' + nStart + ' startups turned over <b>' + fmt.pct(startTurnover, 0)
      + ' of their people a year</b>. The 5%-of-headcount cap would allow a 20-person startup one hire a quarter; the floor of ' + cfg.hireCapMin + ' is what lets them refill. They went '
      + fmt.int(St.start) + ' → ' + fmt.int(St.end) + ' people, capped at ' + cfg.startupMax + ' each.'
      + '<span class="so">At these rates a startup rebuilds about half of its team every year. Institutional knowledge, not headcount, is what it’s short of.</span>',
      tryBtn({ layoffStartupPct: 5 }, 'Try startups laying off 5% instead of ' + cfg.layoffStartupPct + '%')));

    var market = C.lineChart({
      labels: labels, height: 200, width: 1040, stacked: true, label: 'Employed and looking',
      series: [
        { name: 'Employed', color: 'var(--s-blue)', values: s.map(function (x) { return x.employed; }) },
        { name: 'Looking for work', color: 'var(--s-orange)', values: s.map(function (x) { return x.pool; }) },
      ],
      extraTip: function (i) { return '<div class="tt-row tt-muted">Unemployment<b>' + fmt.pct(s[i].unemployment) + '</b></div>'; },
    });

    return '<header class="sheet-head"><div><p class="eyebrow">Run summary · ' + esc(last.label) + ' · ' + quarters + ' quarters</p>'
      + '<h2 id="sheet-title">What ' + years.toFixed(years % 1 ? 1 : 0) + ' years of hiring did to the Bay Area’s engineers</h2>'
      + '<div class="badges"><span class="badge"><b>X</b> ' + sim.companies.length + ' companies (' + nLarge + ' large, ' + nStart + ' startups)</span>'
      + '<span class="badge"><b>Cap</b> ' + cfg.hireCapPct + '%/qtr, min ' + cfg.hireCapMin + (cfg.capIncludesBackfills ? ', incl. backfills' : ', backfills exempt') + '</span>'
      + '<span class="badge"><b>Half-life</b> ' + cfg.halfLifeLarge + ' y / ' + cfg.halfLifeStartup + ' y</span>'
      + '<span class="badge"><b>Layoffs</b> ' + cfg.layoffLargePct + '% / ' + cfg.layoffStartupPct + '%</span>'
      + '<span class="badge"><b>Raise vs band</b> ' + cfg.raisePct + '% / ' + cfg.bandGrowthPct + '%</span>'
      + '<span class="badge"><b>Seed</b> ' + cfg.seed + '</span></div></div>'
      + '<button class="btn icon" type="button" data-close aria-label="Close">✕</button></header>'
      + '<div class="tiles">'
      + tile('Employed engineers', fmt.int(last.employed), delta(last.employed - first.employed, true, fmt.signedPct(last.employed / first.employed - 1)) + ' from ' + fmt.int(first.employed))
      + tile('Unemployment', fmt.pct(last.unemployment), 'from ' + fmt.pct(first.unemployment) + ' · ' + fmt.int(last.pool) + ' looking')
      + tile('Hired', fmt.int(hires), fmt.int(sumSeries(s, 'promos')) + ' internal promotions')
      + tile('Left · laid off · retired', fmt.k(leavers) + ' · ' + fmt.k(layoffs) + ' · ' + fmt.k(retired), fmt.int(grads) + ' new grads arrived')
      + tile('Hiring spend', fmt.money(spend), fmt.money(spend / Math.max(1, hires)) + ' per hire')
      + tile('Avg comp', fmt.money(last.avgComp), 'from ' + fmt.money(first.avgComp) + ' · band ' + fmt.money(last.avgBand))
      + '</div>'
      + '<div class="section panel"><div class="chart-title">Employed and looking</div><p class="chart-sub">Together they are the engineer labour force; the orange band is unemployment.</p>' + market + '</div>'
      + '<div class="section"><h3>Five things this run shows</h3><div class="insights">' + cards.join('') + '</div></div>'
      + '<p class="method"><b>How it works.</b> Every engineer and manager is simulated individually, with a home city drawn in proportion to population, a level in a 1:' + cfg.span
      + ' org pyramid, a comp, and the comp of the seat they hold. Each quarter: annual raises (Q1), retirements, voluntary exits from each company’s half-life, the yearly layoff round (Q' + cfg.layoffQuarter
      + '), graduates (Q3), growth reqs, then hiring. Every open req screens a slate of ' + cfg.slate + ' from the pool and offers each candidate their ask up to the band. A candidate accepts with probability '
      + cfg.baseAcceptPct + '% × (offer ÷ ask)^' + cfg.compElasticity + ' × ½ per ' + cfg.nearbyMiles + ' miles of commute. Company headcounts for the 100 named companies are rough estimates; the other 400 companies are synthetic.</p>';
  }

  root.BWInsights = { render: render };
})(this);
