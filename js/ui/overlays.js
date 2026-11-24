/* BayWork overlays — company (org chart, hiring plan), city, raw data, employee, run summary. */
(function (root) {
  'use strict';

  var C = root.BWCharts, fmt = C.fmt, esc = C.esc, attr = C.attr, delta = C.delta;
  var W = root.Workforce;
  var S = W.STATUS;
  var STATUS_COLORS = ['var(--s-blue)', 'var(--s-yellow)', 'var(--s-violet)', 'var(--s-red)', 'var(--s-gray)', 'var(--muted)'];
  var LEVEL_COLORS = ['var(--s-blue)', 'var(--s-aqua)', 'var(--s-orange)', 'var(--s-violet)', 'var(--s-yellow)', 'var(--s-red)', 'var(--s-gray)'];
  var TIER_NAMES = { A: 'Top-of-market pay', B: 'Market pay', C: 'Below-market pay', G: 'Growth-stage pay', S: 'Startup cash pay' };

  function Overlays(opts) {
    this.overlay = opts.overlay;
    this.sheet = opts.sheet;
    this.app = opts.app;
    this.stack = [];
    var self = this;
    this.overlay.addEventListener('click', function (e) {
      if (e.target === self.overlay || e.target.closest('[data-close]')) { self.close(); return; }
      var back = e.target.closest('[data-back]');
      if (back) { self.back(); return; }
      var go = e.target.closest('[data-go]');
      if (go) {
        var kind = go.getAttribute('data-go'), id = Number(go.getAttribute('data-id'));
        if (kind === 'company') self.company(id);
        else if (kind === 'universe') self.universeCompany(id);
        else if (kind === 'city') self.city(id);
        else if (kind === 'employee') self.employee(id);
        return;
      }
      var showMap = e.target.closest('[data-show-map]');
      if (showMap) {
        var company = self.sim().companies[Number(showMap.getAttribute('data-id'))];
        self.close();
        self.app.selectCompany(company);
        return;
      }
      var patch = e.target.closest('[data-patch]');
      if (patch) self.app.applyPatch(JSON.parse(patch.getAttribute('data-patch')));
    });
  }

  var O = Overlays.prototype;

  O.sim = function () { return this.app.sim(); };

  O.show = function (render, entry) {
    if (entry) this.stack.push(entry);
    this.sheet.innerHTML = render();
    this.overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    this.sheet.focus();
  };
  O.close = function () {
    this.overlay.hidden = true;
    document.body.style.overflow = '';
    this.stack = [];
    this.app.hideTip();
  };
  O.isOpen = function () { return !this.overlay.hidden; };
  O.back = function () {
    this.stack.pop();
    var prev = this.stack.pop();
    if (!prev) { this.close(); return; }
    this[prev.kind].apply(this, prev.args);
  };

  function head(eyebrow, title, badges, canGoBack) {
    return '<header class="sheet-head"><div><p class="eyebrow">' + eyebrow + '</p><h2 id="sheet-title">' + esc(title) + '</h2>'
      + '<div class="badges">' + badges.join('') + '</div></div>'
      + '<div style="display:flex;gap:8px">' + (canGoBack ? '<button class="btn" type="button" data-back>← Back</button>' : '')
      + '<button class="btn icon" type="button" data-close aria-label="Close">✕</button></div></header>';
  }
  function badge(label, value, cls) { return '<span class="badge ' + (cls || '') + '">' + (value != null ? '<b>' + esc(label) + '</b> ' + esc(value) : esc(label)) + '</span>'; }
  function tile(label, value, sub) {
    return '<div class="tile"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div><div class="kpi-sub">' + (sub || '') + '</div></div>';
  }
  function tabs(id, items, active) {
    return '<div class="tabs" role="tablist" data-tabs="' + id + '">' + items.map(function (t) {
      return '<button class="tab" role="tab" type="button" data-tab="' + t[0] + '" aria-selected="' + (t[0] === active) + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  }
  function wireTabs(sheet, id, onTab) {
    var bar = sheet.querySelector('[data-tabs="' + id + '"]');
    if (!bar) return;
    bar.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (!t) return;
      bar.querySelectorAll('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b === t)); });
      onTab(t.getAttribute('data-tab'));
    });
  }

  // ---------------------------------------------------------------- org chart

  function levelTitle(level, top) { return level === top ? 'CTO / Head of Engineering' : W.LEVEL_NAMES[level]; }

  function buildOrg(sim, c) {
    var A = sim.agents;
    var byLevel = [[], [], [], [], [], [], []];
    c.members.forEach(function (a) { byLevel[A.level[a]].push(a); });
    byLevel.forEach(function (l) { l.sort(function (x, y) { return A.exp[y] - A.exp[x]; }); });
    var present = [];
    byLevel.forEach(function (l, i) { if (l.length) present.push(i); });
    return { byLevel: byLevel, present: present, top: present.length ? present[present.length - 1] : 0 };
  }
  // Reports of member #p at `level`: the next populated level down, split evenly.
  function reportsOf(org, level, p) {
    var idx = org.present.indexOf(level);
    if (idx <= 0) return null;
    var childLevel = org.present[idx - 1];
    var nP = org.byLevel[level].length, nC = org.byLevel[childLevel].length;
    var from = Math.ceil(p * nC / nP), to = Math.ceil((p + 1) * nC / nP);
    return { level: childLevel, from: from, to: to };
  }
  function nodeHtml(sim, org, level, p) {
    var A = sim.agents, a = org.byLevel[level][p];
    var rep = reportsOf(org, level, p);
    var n = rep ? rep.to - rep.from : 0;
    return '<li><button class="node' + (n ? '' : ' leaf') + '" type="button" data-level="' + level + '" data-p="' + p + '" aria-expanded="false">'
      + '<span class="caret">' + (n ? '▸' : '') + '</span><i class="lvl-dot" style="background:' + LEVEL_COLORS[level] + '"></i>'
      + '<span class="who">' + esc(W.nameOf(a)) + '</span><span class="role">' + esc(levelTitle(level, org.top)) + '</span>'
      + '<span class="span">' + fmt.money(A.comp[a]) + (n ? ' · ' + n + ' reports' : '') + '</span></button></li>';
  }
  function childrenHtml(sim, org, level, p) {
    var rep = reportsOf(org, level, p);
    if (!rep) return '';
    var html = '<ul>', shown = 0;
    for (var i = rep.from; i < rep.to && shown < 40; i++, shown++) html += nodeHtml(sim, org, rep.level, i);
    if (rep.to - rep.from > shown) html += '<li class="more">+ ' + fmt.int(rep.to - rep.from - shown) + ' more</li>';
    return html + '</ul>';
  }
  function orgPanel(sim, c) {
    var org = buildOrg(sim, c);
    var A = sim.agents;
    var maxN = Math.max.apply(null, org.byLevel.map(function (l) { return l.length; }).concat([1]));
    var rows = org.present.slice().reverse().map(function (level, i, arr) {
      var list = org.byLevel[level];
      var below = i < arr.length - 1 ? org.byLevel[arr[i + 1]].length : null;
      var span = below != null ? below / list.length : null;
      var avg = list.reduce(function (s, a) { return s + A.comp[a]; }, 0) / list.length;
      var w = Math.max(2, Math.log10(list.length + 1) / Math.log10(maxN + 1) * 100);
      // The head of an org naturally has few reports; only flag the levels below.
      var warn = span != null && level !== org.top && (span > sim.cfg.span * 1.4 || span < sim.cfg.span * 0.6);
      return '<div class="pyr-row"><div class="lvl">' + esc(levelTitle(level, org.top)) + '</div>'
        + '<div class="pyr-bar-wrap"><div class="pyr-bar" style="width:' + w.toFixed(1) + '%;background:' + LEVEL_COLORS[level] + '">' + fmt.int(list.length) + '</div></div>'
        + '<div class="meta">avg ' + fmt.money(avg) + (span != null ? ' · <span class="' + (warn ? 'warn' : '') + '">1:' + span.toFixed(1) + '</span>' : '') + '</div></div>';
    }).join('');
    var tree = '<div class="tree"><ul>' + org.byLevel[org.top].map(function (a, p) { return nodeHtml(sim, org, org.top, p); }).join('') + '</ul></div>';
    return { org: org, html: '<div class="grid2"><div class="panel"><div class="chart-title">Org pyramid</div><p class="chart-sub" style="margin-bottom:10px">Bar width on a log scale. Ratio = people per manager one level down; target 1:' + sim.cfg.span + ' (red when far off).</p><div class="pyramid">' + rows + '</div></div>'
      + '<div class="panel"><div class="chart-title">Reporting tree</div><p class="chart-sub" style="margin-bottom:10px">Click a manager to see their reports. Most experienced people listed first.</p>' + tree + '</div></div>' };
  }
  function wireTree(container, sim, getOrg) {
    container.addEventListener('click', function (e) {
      var org = getOrg();
      var node = e.target.closest('.node');
      if (!org) return;
      if (!node || node.classList.contains('leaf')) return;
      var li = node.parentElement;
      var open = node.getAttribute('aria-expanded') === 'true';
      if (open) {
        var ul = li.querySelector(':scope > ul');
        if (ul) ul.remove();
        node.setAttribute('aria-expanded', 'false');
        node.querySelector('.caret').textContent = '▸';
      } else {
        li.insertAdjacentHTML('beforeend', childrenHtml(sim, org, Number(node.getAttribute('data-level')), Number(node.getAttribute('data-p'))));
        node.setAttribute('aria-expanded', 'true');
        node.querySelector('.caret').textContent = '▾';
      }
    });
  }

  // ---------------------------------------------------------------- company

  O.company = function (idx, tab) {
    var self = this, sim = this.sim(), c = sim.companies[idx];
    tab = tab || 'org';
    this.show(function () {
      var s = c.series, n = s.hc.length - 1, hc = c.members.length;
      var mgrs = hc - c.levelCount[0];
      var uni = sim.universe[c.uid];
      var badges = [
        badge(c.kind === 'large' ? 'Large company' : 'Startup'), badge('HQ', c.cityName), badge(c.sector),
        badge(TIER_NAMES[c.payTier]), badge('Rank', '#' + uni.rank),
        c.synthetic ? badge('Synthetic company', null, 'synthetic') : badge('Engineers (estimate)', fmt.int(c.engineersData)),
      ];
      var payGap = s.avgBand[n] ? s.avgComp[n] / s.avgBand[n] - 1 : null;
      return head('Company', c.name, badges, self.stack.length > 1)
        + '<div class="tiles">'
        + tile('Headcount', fmt.int(hc), delta(hc - c.startHc, true, fmt.signedInt(hc - c.startHc)) + ' since start')
        + tile('Engineers · managers', fmt.int(c.levelCount[0]) + ' · ' + fmt.int(mgrs), '1 manager per ' + (mgrs ? (c.levelCount[0] / c.levelCount[1] || 0).toFixed(1) : '—') + ' engineers')
        + tile('Open reqs', fmt.int(c.reqs.length), c.reqs.filter(function (r) { return r.kind === 0; }).length + ' backfills · cap ' + (s.cap[n] || Math.max(sim.cfg.hireCapMin, Math.floor(sim.cfg.hireCapPct / 100 * hc))) + '/qtr')
        + tile('Hired · left · laid off', fmt.k(c.totals.hires) + ' · ' + fmt.k(c.totals.leavers) + ' · ' + fmt.k(c.totals.layoffs), fmt.int(c.totals.retired) + ' retired · ' + fmt.int(c.totals.promos) + ' promoted')
        + tile('Hiring spend', fmt.money(c.totals.hireSpend), sim.cfg.hiringCostPct + '% of each hire’s comp')
        + tile('Avg comp vs band', payGap == null ? '—' : fmt.signedPct(payGap), fmt.money(s.avgComp[n]) + ' avg comp')
        + tile('Avg commute', fmt.miles(s.commute[n]), delta(s.commute[n] - s.commute[0], false, (s.commute[n] - s.commute[0] >= 0 ? '+' : '−') + Math.abs(s.commute[n] - s.commute[0]).toFixed(1) + ' mi') + ' since start')
        + '</div>'
        + '<div class="section">' + tabs('company', [['org', 'Org chart'], ['plan', 'Hiring plan'], ['people', 'People'], ['homes', 'Where they live']], tab)
        + '<div id="company-body"></div></div>';
    }, { kind: 'company', args: [idx, tab] });
    var body = this.sheet.querySelector('#company-body');
    var currentOrg = null;
    wireTree(body, sim, function () { return currentOrg; });
    var render = function (t) {
      self.stack[self.stack.length - 1].args = [idx, t];
      currentOrg = null;
      if (t === 'org') {
        var o = orgPanel(sim, c);
        body.innerHTML = o.html;
        currentOrg = o.org;
      } else if (t === 'plan') body.innerHTML = planPanel(sim, c);
      else if (t === 'people') {
        body.innerHTML = '<div id="people-table"></div>';
        self.employeeTable(body.querySelector('#people-table'), { company: c.idx }, { hideCompany: true });
      } else body.innerHTML = homesPanel(sim, c);
    };
    wireTabs(this.sheet, 'company', render);
    render(tab);
  };

  function planPanel(sim, c) {
    var s = c.series, labels = sim.series.map(function (x) { return x.label; });
    var hcChart = C.lineChart({ labels: labels, height: 150, width: 520, label: 'Headcount', zero: false,
      series: [{ name: 'Headcount', color: 'var(--s-blue)', values: s.hc, kind: 'line' }] });
    var flows = C.barChart({ labels: labels.slice(1), height: 150, width: 520, label: 'Hires and departures',
      series: [
        { name: 'Hired', color: 'var(--s-blue)', values: s.hires.slice(1) },
        { name: 'Left', color: 'var(--s-violet)', values: s.leavers.slice(1), sign: -1 },
        { name: 'Laid off', color: 'var(--s-red)', values: s.layoffs.slice(1), sign: -1 },
        { name: 'Retired', color: 'var(--s-gray)', values: s.retired.slice(1), sign: -1 },
      ] });
    var rows = '';
    for (var i = 1; i < s.hc.length; i++) {
      var capped = s.hires[i] >= s.cap[i] && s.unfilled[i] > 0;
      rows += '<tr><td>' + esc(labels[i]) + '</td><td class="r">' + fmt.int(s.hc[i - 1]) + '</td><td class="r">' + fmt.int(s.planned[i]) + '</td>'
        + '<td class="r">' + fmt.int(s.cap[i]) + '</td><td class="r"' + (capped ? ' style="color:var(--bad);font-weight:650" title="Hit the hiring cap"' : '') + '>' + fmt.int(s.hires[i]) + '</td>'
        + '<td class="r">' + fmt.int(s.leavers[i]) + '</td><td class="r">' + fmt.int(s.layoffs[i]) + '</td><td class="r">' + fmt.int(s.retired[i]) + '</td>'
        + '<td class="r">' + fmt.int(s.promos[i]) + '</td><td class="r"><b>' + fmt.int(s.hc[i]) + '</b></td><td class="r">' + fmt.int(s.unfilled[i]) + '</td>'
        + '<td class="r">' + fmt.money(s.payroll[i]) + '</td><td class="r">' + fmt.money(s.hireSpend[i]) + '</td></tr>';
    }
    if (!rows) rows = '<tr><td colspan="13" class="muted" style="text-align:center;padding:24px">Run the simulation to see the quarter-by-quarter plan.</td></tr>';
    return '<div class="grid2"><div class="panel"><div class="chart-title">Headcount</div>' + hcChart + '</div>'
      + '<div class="panel"><div class="chart-title">Hires vs departures per quarter</div>' + flows + '</div></div>'
      + '<div class="section"><div class="tbl-wrap"><table class="data"><thead><tr><th>Quarter</th><th class="r">Start</th><th class="r">Open reqs</th><th class="r">Cap</th><th class="r">Hired</th><th class="r">Left</th><th class="r">Laid off</th><th class="r">Retired</th><th class="r">Promoted</th><th class="r">End</th><th class="r">Unfilled</th><th class="r">Payroll</th><th class="r">Hiring spend</th></tr></thead><tbody>'
      + rows + '</tbody></table></div><p class="chart-sub" style="margin-top:6px">Open reqs = backfills + growth seats at hiring time. Hired in red = the company hit its quarterly cap with reqs still open.</p></div>';
  }

  function homesPanel(sim, c) {
    var counts = sim.companyResidents(c);
    var rows = counts.map(function (n, i) { return [i, n]; }).filter(function (r) { return r[1] > 0; }).sort(function (a, b) { return b[1] - a[1]; });
    var max = rows.length ? rows[0][1] : 1, total = c.members.length || 1;
    var bars = rows.slice(0, 18).map(function (r) {
      var miles = sim.dist[r[0]][c.city];
      return '<div class="bar-row"><button class="row-link" type="button" data-go="city" data-id="' + r[0] + '"><span class="nm">' + esc(sim.cities[r[0]].name) + '</span></button>'
        + '<div class="track"><div class="fill" style="width:' + (r[1] / max * 100).toFixed(1) + '%"></div></div><div class="v">' + fmt.pct(r[1] / total, 0) + ' · ' + miles.toFixed(0) + 'mi</div></div>';
    }).join('');
    return '<div class="panel"><div class="card-head"><div><div class="chart-title">Where ' + esc(c.name) + '’s people live</div><p class="chart-sub">Share of current employees by home city, and the drive to ' + esc(c.cityName) + '.</p></div>'
      + '<button class="btn" type="button" data-show-map data-id="' + c.idx + '">Show commute lines on map</button></div><div class="bars">' + (bars || '<p class="muted">No employees.</p>') + '</div></div>';
  }

  // A company outside the hiring plan: static profile from the dataset.
  O.universeCompany = function (uid) {
    var self = this, sim = this.sim(), u = sim.universe[uid];
    var inSim = sim.companyByUid[uid];
    if (inSim) { this.company(inSim.idx); return; }
    this.show(function () {
      var counts = W.pyramid(u.engineers, sim.cfg.span);
      var rows = counts.slice().reverse().map(function (n, i) {
        var level = counts.length - 1 - i;
        return '<div class="pyr-row"><div class="lvl">' + esc(levelTitle(level, counts.length - 1)) + '</div><div class="pyr-bar-wrap"><div class="pyr-bar" style="width:'
          + Math.max(2, Math.log10(n + 1) / Math.log10(counts[0] + 1) * 100).toFixed(1) + '%;background:' + LEVEL_COLORS[level] + '">' + fmt.int(n) + '</div></div><div class="meta"></div></div>';
      }).join('');
      return head('Company · not in this hiring plan', u.name, [badge(u.kind === 'startup' ? 'Startup' : u.kind === 'growth' ? 'Growth-stage' : 'Major'), badge('HQ', u.city), badge(u.sector),
        badge('Rank', '#' + u.rank), u.synthetic ? badge('Synthetic company', null, 'synthetic') : badge('Engineers (estimate)', fmt.int(u.engineers))], self.stack.length > 1)
        + '<div class="panel"><div class="chart-title">Org pyramid at a 1:' + sim.cfg.span + ' span</div><p class="chart-sub" style="margin-bottom:10px">'
        + fmt.int(counts.reduce(function (a, b) { return a + b; }, 0)) + ' people. Raise “Companies in the hiring plan” to simulate this company.</p><div class="pyramid">' + rows + '</div></div>';
    }, { kind: 'universeCompany', args: [uid] });
  };

  // ---------------------------------------------------------------- city

  O.city = function (i) {
    var self = this, sim = this.sim();
    this.show(function () {
      var r = sim.cityStats()[i];
      var emp = r.topEmployers.map(function (e) {
        var c = sim.companies[e[0]];
        return '<div class="bar-row"><button class="row-link" type="button" data-go="company" data-id="' + c.idx + '"><span class="nm">' + esc(c.name) + '</span></button>'
          + '<div class="track"><div class="fill" style="width:' + (e[1] / r.topEmployers[0][1] * 100).toFixed(1) + '%;background:var(--s-blue)"></div></div><div class="v">' + fmt.int(e[1]) + '</div></div>';
      }).join('');
      var status = [['Employed', r.employed, 'var(--s-blue)'], ['New grads looking', r.poolGrad, 'var(--s-yellow)'], ['Switching jobs', r.poolSwitcher, 'var(--s-violet)'], ['Laid off, looking', r.poolLaidOff, 'var(--s-red)'], ['Retired', r.retired, 'var(--s-gray)']];
      var maxS = Math.max.apply(null, status.map(function (x) { return x[1]; }).concat([1]));
      return head('City · ' + esc(r.region), r.name, [badge('Population', fmt.int(r.pop)), badge('Engineers per 1,000 residents', r.engineersPer1000.toFixed(1))], self.stack.length > 1)
        + '<div class="tiles">'
        + tile('Engineers living here', fmt.int(r.laborForce), 'employed or looking')
        + tile('Unemployed', fmt.int(r.pool), fmt.pct(r.unemployment) + ' of local engineers')
        + tile('Avg comp (employed)', fmt.money(r.avgComp), '')
        + tile('Avg commute', fmt.miles(r.avgCommute), 'to their employer’s HQ')
        + '</div><div class="section grid2">'
        + '<div class="panel"><div class="chart-title" style="margin-bottom:8px">Residents by status</div><div class="bars">' + status.map(function (x) {
          return '<div class="bar-row"><span>' + x[0] + '</span><div class="track"><div class="fill" style="width:' + (x[1] / maxS * 100).toFixed(1) + '%;background:' + x[2] + '"></div></div><div class="v">' + fmt.int(x[1]) + '</div></div>';
        }).join('') + '</div></div>'
        + '<div class="panel"><div class="chart-title" style="margin-bottom:8px">Top employers of residents</div><div class="bars">' + (emp || '<p class="muted">None yet.</p>') + '</div></div></div>'
        + '<div class="section"><h3>Residents</h3><div id="city-people"></div></div>';
    }, { kind: 'city', args: [i] });
    this.employeeTable(this.sheet.querySelector('#city-people'), { city: i }, {});
  };

  // ---------------------------------------------------------------- employee

  O.employee = function (a) {
    var self = this, sim = this.sim();
    this.show(function () {
      var r = sim.agentRecord(a);
      var hist = sim.history(a);
      var EVC = ['var(--ink-2)', 'var(--s-blue)', 'var(--s-violet)', 'var(--s-red)', 'var(--s-gray)', 'var(--s-aqua)', 'var(--s-yellow)', 'var(--muted)'];
      var tl = hist.map(function (h) {
        var where = h.companyName ? ' · ' + esc(h.companyName) : '';
        var val = h.type === W.EV.GRAD ? 'asking ' + fmt.money(h.value) : h.value ? fmt.money(h.value) : '';
        return '<li><i style="background:' + EVC[h.type] + '"></i><div><b>' + esc(h.typeName) + '</b>' + where + '</div><div class="when">' + esc(h.label) + (val ? ' · ' + val : '') + '</div></li>';
      }).join('');
      var badges = [
        '<span class="badge"><span class="status-pill"><i style="background:' + STATUS_COLORS[r.status] + '"></i>' + esc(r.statusName) + '</span></span>',
        badge(r.levelName), badge('Lives in', r.cityName), badge('ID', '#' + r.id),
      ];
      return head('Engineer', r.name, badges, self.stack.length > 1)
        + '<div class="tiles">'
        + (r.status === S.EMPLOYED
          ? tile('Employer', '<button class="row-link" type="button" data-go="company" data-id="' + r.company + '" style="font-size:18px;padding:0;margin:0"><span class="nm">' + esc(r.companyName) + '</span></button>', fmt.years(r.tenureYears) + ' tenure')
            + tile('Comp', fmt.money(r.comp), 'band ' + fmt.money(r.band) + ' (' + fmt.signedPct(r.comp / r.band - 1) + ')')
            + tile('Commute', fmt.miles(r.commute), r.cityName + ' → ' + esc(sim.companies[r.company].cityName))
          : tile('Asking', r.status <= S.LAID_OFF ? fmt.money(r.ask) : '—', r.lastCompanyName ? 'last at ' + esc(r.lastCompanyName) : '')
            + tile('Looking for', r.status <= S.LAID_OFF ? r.idleQ + ' quarters' : '—', ''))
        + tile('Experience', fmt.years(r.exp), r.employers + ' employers so far' + (r.layoffs ? ' · laid off ' + r.layoffs + '×' : ''))
        + '</div><div class="section grid2"><div class="panel"><div class="chart-title" style="margin-bottom:10px">Career in this simulation</div>'
        + (tl ? '<ul class="timeline">' + tl + '</ul>' : '<p class="muted">Nothing has happened yet: in the starting workforce since before the run.</p>') + '</div>'
        + '<div class="panel"><div class="chart-title" style="margin-bottom:8px">Raw record</div><table class="data"><tbody>'
        + [['Status', r.statusName], ['Level', r.levelName], ['Home city', r.cityName], ['Employer', r.companyName || '—'], ['Last employer', r.lastCompanyName || '—'],
          ['Comp', fmt.money(r.comp)], ['Position band', r.status === S.EMPLOYED ? fmt.money(r.band) : '—'], ['Asking (if looking)', r.status >= 1 && r.status <= 3 ? fmt.money(r.ask) : '—'],
          ['Experience', fmt.years(r.exp)], ['Employers', r.employers], ['Times laid off', r.layoffs]].map(function (x) {
          return '<tr><td class="muted">' + x[0] + '</td><td class="r">' + esc(x[1]) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }, { kind: 'employee', args: [a] });
  };

  // ---------------------------------------------------------------- raw data

  O.data = function (tab, filter) {
    var self = this;
    tab = tab || 'employees';
    this.show(function () {
      return head('Raw data', 'Cities, companies and every engineer', [badge('Click any row for detail'), badge('Download as CSV')], self.stack.length > 1)
        + tabs('data', [['employees', 'Employees'], ['companies', 'Companies'], ['cities', 'Cities'], ['quarters', 'Quarters']], tab)
        + '<div id="data-body"></div>';
    }, { kind: 'data', args: [tab, filter] });
    var body = this.sheet.querySelector('#data-body');
    var render = function (t) {
      self.stack[self.stack.length - 1].args = [t, filter];
      if (t === 'employees') self.employeeTable(body, filter || {}, {});
      else if (t === 'companies') self.companyTable(body);
      else if (t === 'cities') self.cityTable(body);
      else self.quarterTable(body);
    };
    wireTabs(this.sheet, 'data', render);
    render(tab);
  };

  // Generic sortable, paged table over row ids.
  function Table(container, opts) {
    this.c = container;
    this.holder = document.createElement('div');
    container.appendChild(this.holder);
    this.o = opts;
    this.page = 0;
    this.sortKey = opts.sortKey;
    this.sortDir = opts.sortDir || -1;
    this.ids = opts.ids;
    this.sort();
    this.render();
    var self = this;
    this.holder.addEventListener('click', function (e) {
      var th = e.target.closest('th[data-key]');
      if (th) {
        var k = th.getAttribute('data-key');
        if (self.sortKey === k) self.sortDir *= -1; else { self.sortKey = k; self.sortDir = -1; }
        self.sort(); self.page = 0; self.render();
        return;
      }
      var pg = e.target.closest('[data-page]');
      if (pg) { self.page = Math.max(0, Math.min(self.pages() - 1, self.page + Number(pg.getAttribute('data-page')))); self.render(); return; }
      if (e.target.closest('[data-csv]')) { self.csv(); return; }
      var tr = e.target.closest('tr[data-id]');
      if (tr && opts.onRow) opts.onRow(Number(tr.getAttribute('data-id')));
    });
  }
  Table.prototype.pages = function () { return Math.max(1, Math.ceil(this.ids.length / (this.o.pageSize || 50))); };
  Table.prototype.sort = function () {
    var col = this.o.columns.filter(function (c) { return c.key === this.sortKey; }, this)[0];
    if (!col) return;
    var vals = new Map(), dir = this.sortDir;
    for (var i = 0; i < this.ids.length; i++) vals.set(this.ids[i], col.get(this.ids[i]));
    var ids = Array.prototype.slice.call(this.ids);
    ids.sort(function (a, b) {
      var x = vals.get(a), y = vals.get(b);
      if (x === y) return a - b;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : 1) * dir;
    });
    this.ids = ids;
  };
  Table.prototype.render = function () {
    var o = this.o, size = o.pageSize || 50, from = this.page * size, self = this;
    var head = '<tr>' + o.columns.map(function (c) {
      var sorted = c.key === self.sortKey ? ' aria-sort="' + (self.sortDir > 0 ? 'ascending' : 'descending') + '"' : '';
      return '<th data-key="' + c.key + '"' + (c.num ? ' class="r"' : '') + sorted + '>' + c.label + '</th>';
    }).join('') + '</tr>';
    var rows = '';
    for (var i = from; i < Math.min(from + size, this.ids.length); i++) {
      var id = this.ids[i];
      rows += '<tr data-id="' + id + '">' + o.columns.map(function (c) {
        var v = c.get(id);
        return '<td' + (c.num ? ' class="r"' : '') + '>' + (c.html ? c.html(v, id) : esc(c.fmt ? c.fmt(v, id) : v == null ? '—' : v)) + '</td>';
      }).join('') + '</tr>';
    }
    if (!rows) rows = '<tr><td colspan="' + o.columns.length + '" class="muted" style="text-align:center;padding:24px">No rows match.</td></tr>';
    var html = '<div class="tbl-wrap"><table class="data"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="pager"><span>' + fmt.int(this.ids.length ? from + 1 : 0) + '–' + fmt.int(Math.min(from + size, this.ids.length)) + ' of ' + fmt.int(this.ids.length) + '</span>'
      + '<div class="btns"><button class="btn" type="button" data-csv>Download CSV</button><button class="btn" type="button" data-page="-1"' + (this.page ? '' : ' disabled') + '>← Prev</button>'
      + '<button class="btn" type="button" data-page="1"' + (this.page < this.pages() - 1 ? '' : ' disabled') + '>Next →</button></div></div>';
    this.holder.innerHTML = html;
  };
  Table.prototype.csv = function () {
    var o = this.o;
    var q = function (v) { var s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var lines = [o.columns.map(function (c) { return q(c.label); }).join(',')];
    for (var i = 0; i < this.ids.length; i++) {
      var id = this.ids[i];
      lines.push(o.columns.map(function (c) { var v = c.get(id); return q(c.csv ? c.csv(v, id) : v); }).join(','));
    }
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (o.name || 'data') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  O.employeeTable = function (container, filter, opts) {
    var self = this, sim = this.sim(), A = sim.agents;
    filter = Object.assign({ q: '', status: 'active', company: null, city: null, level: null }, filter || {});
    var companyOpts = sim.companies.map(function (c) { return '<option value="' + c.idx + '"' + (filter.company === c.idx ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
    var cityOpts = sim.cities.map(function (c, i) { return '<option value="' + i + '"' + (filter.city === i ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
    var statusOpts = [['active', 'Employed + looking'], ['all', 'Everyone'], ['0', 'Employed'], ['pool', 'Looking (all)'], ['1', 'New grads looking'], ['2', 'Switching jobs'], ['3', 'Laid off, looking'], ['4', 'Retired'], ['5', 'Left Bay Area']]
      .map(function (s) { return '<option value="' + s[0] + '"' + (String(filter.status) === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('');
    var levelOpts = W.LEVEL_NAMES.map(function (n, i) { return '<option value="' + i + '"' + (filter.level === i ? ' selected' : '') + '>' + n + '</option>'; }).join('');
    container.innerHTML = '<div class="tbl-tools">'
      + '<input type="search" placeholder="Search name or #id" value="' + attr(filter.q) + '" data-f="q" aria-label="Search employees">'
      + '<select data-f="status" aria-label="Status">' + statusOpts + '</select>'
      + (opts.hideCompany ? '' : '<select data-f="company" aria-label="Company"><option value="">All companies</option>' + companyOpts + '</select>')
      + '<select data-f="city" aria-label="Home city"><option value="">All cities</option>' + cityOpts + '</select>'
      + '<select data-f="level" aria-label="Level"><option value="">All levels</option>' + levelOpts + '</select>'
      + '<span class="spacer"></span><span class="muted" data-count></span></div>';
    var table = null;
    var build = function () {
      var ids = [];
      var q = filter.q.trim().toLowerCase(), qId = q.charAt(0) === '#' ? Number(q.slice(1)) : NaN;
      for (var a = 0; a < A.n; a++) {
        var st = A.status[a];
        if (filter.status === 'active' && st > 3) continue;
        if (filter.status === 'pool' && (st < 1 || st > 3)) continue;
        if (/^\d$/.test(String(filter.status)) && st !== Number(filter.status)) continue;
        if (filter.company != null && A.company[a] !== filter.company) continue;
        if (filter.city != null && A.city[a] !== filter.city) continue;
        if (filter.level != null && A.level[a] !== filter.level) continue;
        if (q) {
          if (!isNaN(qId)) { if (a !== qId) continue; }
          else if (W.nameOf(a).toLowerCase().indexOf(q) < 0) continue;
        }
        ids.push(a);
      }
      if (table) table.holder.remove();
      table = new Table(container, {
        ids: ids, pageSize: 50, sortKey: 'comp', name: 'employees',
        onRow: function (id) { self.employee(id); },
        columns: [
          { key: 'id', label: 'ID', num: true, get: function (a) { return a; }, fmt: function (v) { return '#' + v; } },
          { key: 'name', label: 'Name', get: function (a) { return W.nameOf(a); } },
          { key: 'status', label: 'Status', get: function (a) { return A.status[a]; }, html: function (v) { return '<span class="status-pill"><i style="background:' + STATUS_COLORS[v] + '"></i>' + esc(W.STATUS_NAMES[v]) + '</span>'; }, csv: function (v) { return W.STATUS_NAMES[v]; } },
          { key: 'company', label: 'Company', get: function (a) { var c = A.company[a]; return c >= 0 ? sim.companies[c].name : null; } },
          { key: 'level', label: 'Level', get: function (a) { return A.level[a]; }, fmt: function (v) { return W.LEVEL_NAMES[v]; }, csv: function (v) { return W.LEVEL_NAMES[v]; } },
          { key: 'city', label: 'Home city', get: function (a) { return sim.cities[A.city[a]].name; } },
          { key: 'commute', label: 'Commute', num: true, get: function (a) { var c = A.company[a]; return c >= 0 ? sim.dist[A.city[a]][sim.companies[c].city] : null; }, fmt: function (v) { return v == null ? '—' : v.toFixed(1) + ' mi'; }, csv: function (v) { return v == null ? '' : v.toFixed(1); } },
          { key: 'comp', label: 'Comp', num: true, get: function (a) { return A.status[a] === S.EMPLOYED ? A.comp[a] : null; }, fmt: function (v) { return v == null ? '—' : fmt.money(v); }, csv: function (v) { return v == null ? '' : Math.round(v); } },
          { key: 'band', label: 'Band', num: true, get: function (a) { return A.status[a] === S.EMPLOYED ? A.band[a] : null; }, fmt: function (v) { return v == null ? '—' : fmt.money(v); }, csv: function (v) { return v == null ? '' : Math.round(v); } },
          { key: 'ask', label: 'Asking', num: true, get: function (a) { var s = A.status[a]; return s >= 1 && s <= 3 ? A.expect[a] : null; }, fmt: function (v) { return v == null ? '—' : fmt.money(v); }, csv: function (v) { return v == null ? '' : Math.round(v); } },
          { key: 'exp', label: 'Experience', num: true, get: function (a) { return A.exp[a]; }, fmt: function (v) { return v.toFixed(1) + ' y'; }, csv: function (v) { return v.toFixed(2); } },
          { key: 'tenure', label: 'Tenure', num: true, get: function (a) { return A.status[a] === S.EMPLOYED ? (sim.q - A.joinedQ[a]) / 4 : null; }, fmt: function (v) { return v == null ? '—' : v.toFixed(1) + ' y'; }, csv: function (v) { return v == null ? '' : v.toFixed(2); } },
          { key: 'employers', label: 'Employers', num: true, get: function (a) { return A.employers[a]; } },
          { key: 'layoffs', label: 'Laid off', num: true, get: function (a) { return A.layoffs[a]; } },
        ],
      });
      container.querySelector('[data-count]').textContent = fmt.int(ids.length) + ' people';
    };
    var timer = null;
    container.querySelector('.tbl-tools').addEventListener('input', function (e) {
      var f = e.target.getAttribute('data-f');
      if (!f) return;
      var v = e.target.value;
      filter[f] = f === 'q' || f === 'status' ? v : v === '' ? null : Number(v);
      clearTimeout(timer);
      timer = setTimeout(build, f === 'q' ? 200 : 0);
    });
    build();
  };

  O.companyTable = function (container) {
    var self = this, sim = this.sim();
    var uni = sim.universe;
    container.innerHTML = '<div class="tbl-tools"><span class="muted">All 500 companies in the universe. ' + sim.companies.length + ' are in the hiring plan (X); the rest are shown from the dataset.</span></div>';
    var simOf = function (u) { return sim.companyByUid[u]; };
    new Table(container, {
      ids: uni.map(function (u) { return u.id; }), pageSize: 50, sortKey: 'rank', sortDir: 1, name: 'companies',
      onRow: function (id) { self.universeCompany(id); },
      columns: [
        { key: 'rank', label: '#', num: true, get: function (u) { return uni[u].rank; } },
        { key: 'name', label: 'Company', get: function (u) { return uni[u].name; }, html: function (v, u) { return esc(v) + (uni[u].synthetic ? ' <span class="muted">(synthetic)</span>' : ''); } },
        { key: 'kind', label: 'Type', get: function (u) { return uni[u].kind === 'major' ? 'Major' : uni[u].kind === 'growth' ? 'Growth-stage' : 'Startup'; } },
        { key: 'city', label: 'HQ', get: function (u) { return uni[u].city; } },
        { key: 'sector', label: 'Sector', get: function (u) { return uni[u].sector; } },
        { key: 'eng', label: 'Engineers (data)', num: true, get: function (u) { return uni[u].engineers; }, fmt: fmt.int },
        { key: 'plan', label: 'In plan', get: function (u) { var c = simOf(u); return c ? (c.kind === 'large' ? 'Large' : 'Startup') : null; } },
        { key: 'hc', label: 'Headcount now', num: true, get: function (u) { var c = simOf(u); return c ? c.members.length : null; }, fmt: function (v) { return v == null ? '—' : fmt.int(v); } },
        { key: 'chg', label: 'Change', num: true, get: function (u) { var c = simOf(u); return c && c.startHc ? c.members.length / c.startHc - 1 : null; }, fmt: function (v) { return v == null ? '—' : fmt.signedPct(v); } },
        { key: 'reqs', label: 'Open reqs', num: true, get: function (u) { var c = simOf(u); return c ? c.reqs.length : null; }, fmt: function (v) { return v == null ? '—' : fmt.int(v); } },
        { key: 'hires', label: 'Hired', num: true, get: function (u) { var c = simOf(u); return c ? c.totals.hires : null; }, fmt: function (v) { return v == null ? '—' : fmt.int(v); } },
        { key: 'left', label: 'Left', num: true, get: function (u) { var c = simOf(u); return c ? c.totals.leavers : null; }, fmt: function (v) { return v == null ? '—' : fmt.int(v); } },
        { key: 'laid', label: 'Laid off', num: true, get: function (u) { var c = simOf(u); return c ? c.totals.layoffs : null; }, fmt: function (v) { return v == null ? '—' : fmt.int(v); } },
        { key: 'spend', label: 'Hiring spend', num: true, get: function (u) { var c = simOf(u); return c ? c.totals.hireSpend : null; }, fmt: function (v) { return v == null ? '—' : fmt.money(v); } },
      ],
    });
  };

  O.cityTable = function (container) {
    var self = this, sim = this.sim();
    var rows = sim.cityStats();
    container.innerHTML = '';
    new Table(container, {
      ids: rows.map(function (r) { return r.id; }), pageSize: 60, sortKey: 'lf', name: 'cities',
      onRow: function (id) { self.city(id); },
      columns: [
        { key: 'name', label: 'City', get: function (i) { return rows[i].name; } },
        { key: 'region', label: 'Region', get: function (i) { return rows[i].region; } },
        { key: 'pop', label: 'Population', num: true, get: function (i) { return rows[i].pop; }, fmt: fmt.int },
        { key: 'lf', label: 'Engineers', num: true, get: function (i) { return rows[i].laborForce; }, fmt: fmt.int },
        { key: 'emp', label: 'Employed', num: true, get: function (i) { return rows[i].employed; }, fmt: fmt.int },
        { key: 'grad', label: 'Grads looking', num: true, get: function (i) { return rows[i].poolGrad; }, fmt: fmt.int },
        { key: 'sw', label: 'Switching', num: true, get: function (i) { return rows[i].poolSwitcher; }, fmt: fmt.int },
        { key: 'lo', label: 'Laid off', num: true, get: function (i) { return rows[i].poolLaidOff; }, fmt: fmt.int },
        { key: 'u', label: 'Unemployment', num: true, get: function (i) { return rows[i].unemployment; }, fmt: function (v) { return fmt.pct(v); } },
        { key: 'comp', label: 'Avg comp', num: true, get: function (i) { return rows[i].avgComp; }, fmt: fmt.money },
        { key: 'commute', label: 'Avg commute', num: true, get: function (i) { return rows[i].avgCommute; }, fmt: fmt.miles },
        { key: 'per', label: 'Eng / 1k residents', num: true, get: function (i) { return rows[i].engineersPer1000; }, fmt: function (v) { return v.toFixed(1); } },
      ],
    });
  };

  O.quarterTable = function (container) {
    var sim = this.sim(), s = sim.series;
    container.innerHTML = '';
    new Table(container, {
      ids: s.map(function (x, i) { return i; }), pageSize: 100, sortKey: 'q', sortDir: 1, name: 'quarters',
      columns: [
        { key: 'q', label: 'Quarter', get: function (i) { return i; }, fmt: function (v) { return s[v].label; }, csv: function (v) { return s[v].label; } },
        { key: 'emp', label: 'Employed', num: true, get: function (i) { return s[i].employed; }, fmt: fmt.int },
        { key: 'pool', label: 'Looking', num: true, get: function (i) { return s[i].pool; }, fmt: fmt.int },
        { key: 'u', label: 'Unemployment', num: true, get: function (i) { return s[i].unemployment; }, fmt: function (v) { return fmt.pct(v); } },
        { key: 'hires', label: 'Hired', num: true, get: function (i) { return s[i].hires; }, fmt: fmt.int },
        { key: 'left', label: 'Left', num: true, get: function (i) { return s[i].leavers; }, fmt: fmt.int },
        { key: 'laid', label: 'Laid off', num: true, get: function (i) { return s[i].layoffs; }, fmt: fmt.int },
        { key: 'ret', label: 'Retired', num: true, get: function (i) { return s[i].retired; }, fmt: fmt.int },
        { key: 'grads', label: 'New grads', num: true, get: function (i) { return s[i].grads; }, fmt: fmt.int },
        { key: 'reqs', label: 'Open reqs', num: true, get: function (i) { return s[i].openReqs; }, fmt: fmt.int },
        { key: 'comp', label: 'Avg comp', num: true, get: function (i) { return s[i].avgComp; }, fmt: fmt.money },
        { key: 'band', label: 'Avg band', num: true, get: function (i) { return s[i].avgBand; }, fmt: fmt.money },
        { key: 'spend', label: 'Hiring spend', num: true, get: function (i) { return s[i].hireSpend; }, fmt: fmt.money },
        { key: 'commute', label: 'Avg commute', num: true, get: function (i) { return s[i].avgCommute; }, fmt: fmt.miles },
      ],
    });
  };

  // ---------------------------------------------------------------- summary

  O.summary = function () {
    var sim = this.sim();
    this.show(function () { return root.BWInsights.render(sim); }, { kind: 'summary', args: [] });
  };

  root.BWOverlays = Overlays;
})(this);
