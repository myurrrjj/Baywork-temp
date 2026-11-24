/* BayWork app — controls, run loop, dashboard and wiring. */
(function () {
  'use strict';

  var W = window.Workforce, Charts = window.BWCharts, fmt = Charts.fmt, esc = Charts.esc, delta = Charts.delta;
  var DATA = { cities: window.BAY_CITIES, companies: window.BAY_COMPANIES };

  var CONTROLS = [
    { group: 'Scope', items: [
      { key: 'companies', label: 'Companies in the hiring plan', sym: 'X', min: 2, max: 500, step: 2, hint: 'Half are the largest companies, half are startups.' },
      { key: 'years', label: 'Years to simulate', unit: 'y', min: 1, max: 15, step: 1 },
      { key: 'seed', label: 'Seed', min: 0, max: 99999, step: 1, noSlider: true, hint: 'Same seed and settings, same run.' },
    ] },
    { group: 'Rules from the brief', items: [
      { key: 'startupMax', label: 'Startup max headcount', min: 5, max: 100, step: 1 },
      { key: 'hireCapPct', label: 'Hiring cap per quarter', unit: '% of HC', min: 1, max: 20, step: 0.5, decimals: 1 },
      { key: 'hireCapMin', label: 'Cap floor', unit: 'hires', min: 0, max: 20, step: 1, hint: 'When the percentage is smaller than this.' },
      { key: 'capIncludesBackfills', label: 'Backfills count toward the cap', toggle: true, hint: 'Off: only growth hires are capped.' },
      { key: 'halfLifeLarge', label: 'Employee half-life, large', unit: 'y', min: 0.5, max: 10, step: 0.5, decimals: 1 },
      { key: 'halfLifeStartup', label: 'Employee half-life, startup', unit: 'y', min: 0.5, max: 10, step: 0.5, decimals: 1 },
      { key: 'layoffLargePct', label: 'Layoffs per year, large', unit: '%', min: 0, max: 30, step: 1 },
      { key: 'layoffStartupPct', label: 'Layoffs per year, startup', unit: '%', min: 0, max: 50, step: 1 },
      { key: 'gradPct', label: 'New grads per year', unit: '% of LF', min: 0, max: 10, step: 0.5, decimals: 1 },
      { key: 'retirePct', label: 'Retirements per year', unit: '% of LF', min: 0, max: 10, step: 0.5, decimals: 1 },
      { key: 'layoffDiscountPct', label: 'Laid-off comp discount', unit: '%', min: 0, max: 50, step: 1 },
      { key: 'raisePct', label: 'Annual raise, incumbents', unit: '%', min: 0, max: 25, step: 1 },
      { key: 'bandGrowthPct', label: 'Annual growth, position comp', unit: '%', min: 0, max: 15, step: 0.5, decimals: 1 },
      { key: 'hiringCostPct', label: 'Hiring cost', unit: '% of comp', min: 0, max: 30, step: 1 },
      { key: 'span', label: 'Engineers per manager', unit: ':1', min: 3, max: 20, step: 1 },
      { key: 'nearbyMiles', label: '2× likelier to accept per', unit: 'mi closer', min: 2, max: 60, step: 1, hint: 'At equal comp, a candidate this much closer accepts twice as often.' },
    ] },
    { group: 'Candidate behaviour', items: [
      { key: 'baseAcceptPct', label: 'Acceptance at full ask, next door', unit: '%', min: 5, max: 100, step: 5 },
      { key: 'compElasticity', label: 'Comp sensitivity', unit: 'exp.', min: 0, max: 15, step: 0.5, decimals: 1, hint: 'P ∝ (offer ÷ ask)^this.' },
      { key: 'reservationDecayPct', label: 'Ask drops per idle quarter', unit: '%', min: 0, max: 10, step: 0.5, decimals: 1 },
      { key: 'switchPremiumPct', label: 'Switchers ask on top of pay', unit: '%', min: 0, max: 30, step: 1 },
      { key: 'exitAfterQuarters', label: 'Leave Bay Area after idle', unit: 'qtrs', min: 0, max: 20, step: 1, hint: '0 = never.' },
    ] },
    { group: 'Company behaviour', items: [
      { key: 'growthLargePct', label: 'Funded growth, large', unit: '%/y', min: -10, max: 30, step: 1 },
      { key: 'growthStartupPct', label: 'Funded growth, startups', unit: '%/y', min: 0, max: 200, step: 5 },
      { key: 'slate', label: 'Candidates screened per req', min: 1, max: 40, step: 1 },
      { key: 'offerEscalationPct', label: 'Offer bump per unfilled quarter', unit: '%', min: 0, max: 15, step: 0.5, decimals: 1 },
      { key: 'promoteSharePct', label: 'Manager seats filled from within', unit: '%', min: 0, max: 100, step: 5 },
      { key: 'layoffTargeting', label: 'Who gets laid off', choice: [[0, 'At random'], [1, 'Most over band']] },
      { key: 'freezeOnLayoff', label: 'Freeze hiring in the layoff quarter', toggle: true },
      { key: 'layoffQuarter', label: 'Layoff round', choice: [[1, 'Q1'], [2, 'Q2'], [3, 'Q3'], [4, 'Q4']] },
      { key: 'gradQuarter', label: 'Graduates arrive', choice: [[3, 'Q3'], [0, 'Spread']] },
      { key: 'initialPoolPct', label: 'Initially looking', unit: '% of employed', min: 0, max: 15, step: 0.5, decimals: 1 },
    ] },
  ];
  var SPEEDS = [0.5, 1, 2, 4, 8];
  var LAYERS = [['hqs', 'Company HQs', 'var(--s-blue)'], ['startups', 'Startups', 'var(--s-aqua)'], ['residents', 'Where engineers live', 'var(--s-orange)'], ['flows', 'Hiring flows', 'var(--s-blue)']];

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    cfg: Object.assign({}, W.DEFAULTS),
    sim: null, status: 'ready', speed: 2, timer: null, chartTab: 'market', cityRows: null,
  };
  var inputs = {};

  // ---------------------------------------------------------------- controls

  function decimals(c) { return c.decimals || 0; }
  function clamp(c, v) {
    if (c.toggle) return v === true || v === 1 || v === '1' ? 1 : 0;
    if (c.choice) return Number(v);
    v = Number(v);
    if (!isFinite(v)) v = W.DEFAULTS[c.key];
    if (c.min != null) v = Math.max(c.min, v);
    if (c.max != null && !c.noSlider) v = Math.min(c.max, v);
    return decimals(c) ? Number(v.toFixed(decimals(c))) : Math.round(v);
  }

  function buildControls() {
    var html = '';
    CONTROLS.forEach(function (g) {
      html += '<details class="group" open><summary>' + g.group + '</summary>';
      g.items.forEach(function (c) {
        var id = 'in-' + c.key;
        var labelHtml = '<label for="' + id + '">' + c.label + (c.sym ? ' <span class="sym">' + c.sym + '</span>' : '') + '</label>';
        if (c.toggle) {
          html += '<div class="ctl"><div class="ctl-head">' + labelHtml + '<label class="switch"><input type="checkbox" id="' + id + '" data-key="' + c.key + '"><span class="track"></span></label></div>'
            + (c.hint ? '<p class="ctl-hint">' + c.hint + '</p>' : '') + '</div>';
        } else if (c.choice) {
          html += '<div class="ctl"><div class="ctl-head"><span style="font-weight:550">' + c.label + '</span></div><div class="choice" role="group" aria-label="' + c.label + '">'
            + c.choice.map(function (o) { return '<button class="seg" type="button" data-key="' + c.key + '" data-val="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
        } else {
          html += '<div class="ctl"><div class="ctl-head">' + labelHtml + '<span class="ctl-val">'
            + (c.noSlider ? '<button class="dice" type="button" id="dice">Shuffle</button>' : '')
            + '<input type="number" id="' + id + '" data-key="' + c.key + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '">'
            + (c.unit ? '<span>' + c.unit + '</span>' : '') + '</span></div>'
            + (c.noSlider ? '' : '<input type="range" data-key="' + c.key + '" aria-label="' + c.label + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '">')
            + (c.hint ? '<p class="ctl-hint">' + c.hint + '</p>' : '') + '</div>';
        }
        inputs[c.key] = { def: c };
      });
      html += '</details>';
    });
    $('config').innerHTML = html;
    Object.keys(inputs).forEach(function (k) {
      var c = inputs[k];
      c.num = document.querySelector('#config input[data-key="' + k + '"]:not([type="range"])');
      c.range = document.querySelector('#config input[type="range"][data-key="' + k + '"]');
      c.segs = document.querySelectorAll('#config .seg[data-key="' + k + '"]');
    });
    var cfgEl = $('config');
    cfgEl.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-key');
      if (k && e.target.type === 'range') setConfig(k, e.target.value);
    });
    cfgEl.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-key');
      if (!k) return;
      if (e.target.type === 'checkbox') setConfig(k, e.target.checked ? 1 : 0);
      else if (e.target.type === 'number') setConfig(k, e.target.value);
    });
    cfgEl.addEventListener('click', function (e) {
      var seg = e.target.closest('.seg[data-key]');
      if (seg) setConfig(seg.getAttribute('data-key'), seg.getAttribute('data-val'));
    });
    $('dice').addEventListener('click', function () { setConfig('seed', Math.floor(Math.random() * 99999)); });
    syncControls();
  }

  function syncControls() {
    Object.keys(inputs).forEach(function (k) {
      var c = inputs[k], v = state.cfg[k];
      if (c.def.toggle) c.num.checked = !!v;
      else if (c.def.choice) c.segs.forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-val')) === Number(v))); });
      else {
        c.num.value = decimals(c.def) ? Number(v).toFixed(decimals(c.def)) : v;
        if (c.range) {
          c.range.value = v;
          c.range.style.setProperty('--pct', ((v - c.def.min) / (c.def.max - c.def.min) * 100) + '%');
        }
      }
    });
  }

  function locked() { return state.status === 'running' || state.status === 'paused'; }

  function setConfig(key, raw) {
    if (locked()) return;
    state.cfg[key] = clamp(inputs[key].def, raw);
    syncControls();
    clearTimeout(setConfig.t);
    setConfig.t = setTimeout(newRun, 120);
  }

  function lockControls() {
    var lock = locked();
    document.querySelector('.sidebar').classList.toggle('locked', lock);
    document.querySelectorAll('#config input, #config .seg, #dice').forEach(function (e) { e.disabled = lock; });
    $('btn-defaults').disabled = lock;
  }

  // ---------------------------------------------------------------- run control

  function newRun() {
    stopTimer();
    state.sim = new W.WorkforceSim(state.cfg, DATA);
    state.cityRows = state.sim.cityStats();
    map.setSim(state.sim);
    map.update(state.cityRows);
    $('company-list').innerHTML = state.sim.companies.filter(function (c) { return c.kind === 'large'; })
      .map(function (c) { return '<option value="' + Charts.attr(c.name) + '"></option>'; }).join('');
    setStatus('ready');
    renderAll();
  }

  function setStatus(s) {
    state.status = s;
    var labels = { ready: 'Start', running: 'Stop', paused: 'Resume', finished: 'Start again' };
    $('btn-start-label').textContent = labels[s];
    $('btn-start').classList.toggle('is-running', s === 'running');
    var st = $('status');
    st.dataset.state = s;
    st.textContent = { ready: 'Ready', running: 'Running', paused: 'Stopped', finished: 'Finished' }[s];
    $('btn-step').disabled = s === 'running' || s === 'finished';
    $('btn-summary').disabled = !(state.sim && state.sim.q > 0);
    lockControls();
  }

  function start() {
    if (state.status === 'finished') newRun();
    setStatus('running');
    tick();
  }
  function stop() { stopTimer(); setStatus('paused'); }
  function stopTimer() { clearTimeout(state.timer); state.timer = null; }
  function toggle() { if (state.status === 'running') stop(); else start(); }

  function stepOnce() {
    if (state.sim.done) return;
    state.sim.step();
    state.cityRows = state.sim.cityStats();
    map.update(state.cityRows);
    renderAll();
    if (state.sim.done) finish();
    else if (state.status === 'ready') setStatus('paused');
  }

  function tick() {
    if (state.status !== 'running') return;
    var t0 = performance.now();
    stepOnce();
    if (state.status !== 'running') return;
    var wait = Math.max(0, 1000 / state.speed - (performance.now() - t0));
    state.timer = setTimeout(tick, wait);
  }

  function finish() {
    stopTimer();
    setStatus('finished');
    overlays.summary();
  }

  // ---------------------------------------------------------------- dashboard

  function renderAll() {
    var sim = state.sim, s = sim.series, last = s[s.length - 1], first = s[0];
    $('clock').textContent = last.label;
    $('clock-q').textContent = sim.q + ' of ' + sim.quarters + ' quarters';
    $('progress').style.width = (sim.q / sim.quarters * 100) + '%';
    $('btn-summary').disabled = !(sim.q > 0);
    renderKpis(first, last, s);
    renderCharts();
    renderMovers();
    renderFocus();
  }

  function kpi(label, value, sub) {
    return '<div class="kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div><div class="kpi-sub">' + sub + '</div></div>';
  }

  function renderKpis(first, last, s) {
    var total = s.slice(1).reduce(function (t, x) { return t + x.hireSpend; }, 0);
    var gap = last.avgBand ? last.avgComp / last.avgBand - 1 : 0;
    $('kpis').innerHTML =
      kpi('Employed engineers', fmt.int(last.employed),
        delta(last.employed - first.employed, true, fmt.signedPct(last.employed / first.employed - 1)) + '<span>' + fmt.k(last.employedLarge) + ' large · ' + fmt.k(last.employedStartup) + ' startups</span>')
      + kpi('Unemployment', fmt.pct(last.unemployment),
        delta(last.unemployment - first.unemployment, false, (last.unemployment >= first.unemployment ? '+' : '−') + Math.abs((last.unemployment - first.unemployment) * 100).toFixed(1) + ' pts')
        + '<span>' + fmt.k(last.pool) + ' looking</span>')
      + kpi('Open reqs', fmt.int(last.openReqs),
        '<span>' + (last.openReqs ? fmt.pct(last.oldReqs / last.openReqs, 0) : '0%') + ' open 2+ qtrs · ' + last.capHitCompanies + ' at cap</span>')
      + kpi('Pay vs position band', fmt.signedPct(gap), '<span>' + fmt.money(last.avgComp) + ' avg · band ' + fmt.money(last.avgBand) + '</span>')
      + kpi('Hiring spend', fmt.money(last.hireSpend), '<span>this quarter · ' + fmt.money(total) + ' to date</span>')
      + kpi('Avg commute', fmt.miles(last.avgCommute), '<span>new hires ' + (last.hireCommute != null ? fmt.miles(last.hireCommute) : '—') + ' · start ' + fmt.miles(first.avgCommute) + '</span>');
  }

  var CHART_TABS = [['market', 'Jobs & people'], ['flows', 'Flows'], ['pay', 'Pay & commute']];

  function renderCharts() {
    var s = state.sim.series, labels = s.map(function (x) { return x.label; });
    var pick = function (k) { return s.map(function (x) { return x[k]; }); };
    var flowLabels = labels.slice(1), fpick = function (k) { return pick(k).slice(1); };
    var block = function (title, sub, chart) {
      return '<div class="chart-block"><div class="chart-title">' + title + '</div><div class="chart-sub">' + sub + '</div>' + chart + '</div>';
    };
    var html;
    if (state.chartTab === 'market') {
      html = block('Employed vs looking', 'The engineer labour force, stacked.', Charts.lineChart({
        labels: labels, stacked: true, label: 'Employed and looking',
        series: [{ name: 'Employed', color: 'var(--s-blue)', values: pick('employed') }, { name: 'Looking', color: 'var(--s-orange)', values: pick('pool') }],
        extraTip: function (i) { return '<div class="tt-row tt-muted">Unemployment<b>' + fmt.pct(s[i].unemployment) + '</b></div>'; },
      }))
        + block('Who is looking', 'The talent pool by how they got there.', Charts.lineChart({
          labels: labels, stacked: true, label: 'Talent pool composition',
          series: [
            { name: 'New grads', color: 'var(--s-yellow)', values: pick('poolGrad') },
            { name: 'Switching jobs', color: 'var(--s-violet)', values: pick('poolSwitcher') },
            { name: 'Laid off', color: 'var(--s-red)', values: pick('poolLaidOff') },
          ],
        }));
    } else if (state.chartTab === 'flows') {
      html = block('In and out each quarter', 'Hires up; departures down.', s.length > 1 ? Charts.barChart({
        labels: flowLabels, label: 'Quarterly flows',
        series: [
          { name: 'Hired', color: 'var(--s-blue)', values: fpick('hires') },
          { name: 'Left', color: 'var(--s-violet)', values: fpick('leavers'), sign: -1 },
          { name: 'Laid off', color: 'var(--s-red)', values: fpick('layoffs'), sign: -1 },
          { name: 'Retired', color: 'var(--s-gray)', values: fpick('retired'), sign: -1 },
        ],
      }) : emptyChart())
        + block('Who got hired', 'Hires by where they came from.', s.length > 1 ? Charts.barChart({
          labels: flowLabels, label: 'Hires by source',
          series: [
            { name: 'Switchers', color: 'var(--s-violet)', values: fpick('hiresSwitcher') },
            { name: 'Laid off', color: 'var(--s-red)', values: fpick('hiresLaidOff') },
            { name: 'New grads', color: 'var(--s-yellow)', values: fpick('hiresGrad') },
          ],
        }) : emptyChart());
    } else {
      html = block('Pay', 'Incumbents get the raise; seats grow slower.', Charts.lineChart({
        labels: labels, label: 'Average comp', yFormat: fmt.money, zero: false,
        series: [
          { name: 'Avg employee', color: 'var(--s-blue)', values: pick('avgComp'), kind: 'line', format: fmt.money },
          { name: 'Avg position band', color: 'var(--s-gray)', values: pick('avgBand'), kind: 'line', format: fmt.money },
          { name: 'Avg new hire', color: 'var(--s-orange)', values: pick('avgHireComp'), kind: 'line', format: fmt.money },
        ],
      }))
        + block('Commute', 'Miles from home to HQ.', Charts.lineChart({
          labels: labels, label: 'Average commute', yFormat: function (v) { return v.toFixed(0) + ' mi'; }, zero: false,
          series: [
            { name: 'All employees', color: 'var(--s-blue)', values: pick('avgCommute'), kind: 'line', format: fmt.miles },
            { name: 'New hires', color: 'var(--s-orange)', values: pick('hireCommute'), kind: 'line', format: fmt.miles },
          ],
        }));
    }
    $('chart-body').innerHTML = html;
  }
  function emptyChart() { return '<p class="muted" style="padding:28px 0;text-align:center">Run a quarter to see flows.</p>'; }

  function renderMovers() {
    var list = state.sim.companies.filter(function (c) { return c.kind === 'large' && c.startHc >= 150; }).map(function (c) {
      return { c: c, d: c.members.length / c.startHc - 1 };
    });
    var up = list.slice().sort(function (a, b) { return b.d - a.d; }).slice(0, 5);
    var down = list.slice().sort(function (a, b) { return a.d - b.d; }).slice(0, 5);
    var rowsOf = function (arr) {
      return arr.map(function (m) {
        return '<button class="row-link" type="button" data-company="' + m.c.idx + '"><span class="nm">' + esc(m.c.name) + '</span><span class="vv">'
          + delta(m.d, true, fmt.signedPct(m.d)) + '</span></button>';
      }).join('');
    };
    $('movers').innerHTML = state.sim.q === 0
      ? '<p class="muted">Start the run to see which companies grow and shrink.</p>'
      : '<div class="movers"><div><h4>Grew most</h4>' + rowsOf(up) + '</div><div><h4>Shrank most</h4>' + rowsOf(down) + '</div></div>';
  }

  function renderFocus() {
    var focus = $('map-focus'), c = map.selected;
    if (!c) { focus.hidden = true; return; }
    focus.hidden = false;
    focus.innerHTML = '<div>Commute lines: where <b>' + esc(c.name) + '</b>’s ' + fmt.int(c.members.length) + ' people live</div>'
      + '<button class="btn" type="button" data-company="' + c.idx + '">Profile</button><button class="btn icon" type="button" id="focus-clear" aria-label="Clear selection">✕</button>';
  }

  // ---------------------------------------------------------------- tooltip

  var tipEl = $('tooltip');
  function showTip(html, e) {
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    var pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    tipEl.style.left = Math.max(8, x) + 'px';
    tipEl.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { tipEl.hidden = true; }
  document.addEventListener('mousemove', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t) showTip(t.getAttribute('data-tip'), e);
    else if (!(e.target.closest && e.target.closest('#map .hq, #map .startup, #map .city-dot'))) hideTip();
  });

  function companyTip(c) {
    var hc = c.members.length, d = c.startHc ? hc / c.startHc - 1 : 0, last = c.series.hc.length - 1;
    return '<div class="tt-title">' + esc(c.name) + '</div><div class="tt-muted">' + esc(c.sector) + ' · ' + esc(c.cityName) + (c.synthetic ? ' · synthetic' : '') + '</div>'
      + '<div class="tt-row">Headcount<b>' + fmt.int(hc) + '</b></div>'
      + '<div class="tt-row">Change since start<b>' + fmt.signedPct(d) + '</b></div>'
      + '<div class="tt-row">Open reqs<b>' + fmt.int(c.reqs.length) + '</b></div>'
      + (last ? '<div class="tt-row">Hired last quarter<b>' + fmt.int(c.series.hires[last]) + '</b></div>' : '')
      + '<div class="tt-muted" style="margin-top:4px">Click for org chart and hiring plan</div>';
  }
  function cityTip(i) {
    var r = state.cityRows[i];
    return '<div class="tt-title">' + esc(r.name) + '</div><div class="tt-muted">' + esc(r.region) + ' · pop. ' + fmt.int(r.pop) + '</div>'
      + '<div class="tt-row">Engineers living here<b>' + fmt.int(r.laborForce) + '</b></div>'
      + '<div class="tt-row">Looking for work<b>' + fmt.int(r.pool) + '</b></div>'
      + '<div class="tt-row">Unemployment<b>' + fmt.pct(r.unemployment) + '</b></div>'
      + '<div class="tt-row">Avg commute<b>' + fmt.miles(r.avgCommute) + '</b></div>'
      + '<div class="tt-muted" style="margin-top:4px">Click for residents</div>';
  }

  // ---------------------------------------------------------------- wiring

  var map = new window.BWMap($('map'), {
    geo: window.BAY_GEO, cities: DATA.cities,
    on: {
      company: function (c) { openOverlay(function () { overlays.company(c.idx); }); },
      city: function (i) { openOverlay(function () { overlays.city(i); }); },
      companyHover: function (c, e) { showTip(companyTip(c), e); },
      cityHover: function (i, e) { showTip(cityTip(i), e); },
      leave: hideTip,
    },
  });

  var overlays = new window.BWOverlays({
    overlay: $('overlay'), sheet: $('sheet'),
    app: {
      sim: function () { return state.sim; },
      hideTip: hideTip,
      selectCompany: function (c) { map.select(c); map.focusOn(c, 2); renderFocus(); },
      applyPatch: function (patch) {
        overlays.close();
        Object.keys(patch).forEach(function (k) { state.cfg[k] = clamp(inputs[k].def, patch[k]); });
        syncControls();
        newRun();
        start();
      },
    },
  });

  // Opening a detail view pauses the run so the numbers hold still.
  function openOverlay(fn) {
    if (state.status === 'running') stop();
    hideTip();
    fn();
  }

  $('btn-start').addEventListener('click', toggle);
  $('btn-step').addEventListener('click', function () { if (state.status !== 'running') stepOnce(); });
  $('btn-reset').addEventListener('click', function () { overlays.close(); newRun(); });
  $('btn-data').addEventListener('click', function () { openOverlay(function () { overlays.data('employees'); }); });
  $('btn-summary').addEventListener('click', function () { openOverlay(function () { overlays.summary(); }); });
  $('btn-defaults').addEventListener('click', function () {
    if (locked()) return;
    state.cfg = Object.assign({}, W.DEFAULTS);
    syncControls();
    newRun();
  });

  $('speed').innerHTML = SPEEDS.map(function (v) {
    return '<button class="seg" type="button" data-speed="' + v + '" aria-pressed="' + (v === state.speed) + '">' + (v < 1 ? '½' : v) + '×</button>';
  }).join('');
  $('speed').addEventListener('click', function (e) {
    var b = e.target.closest('[data-speed]');
    if (!b) return;
    state.speed = Number(b.getAttribute('data-speed'));
    $('speed').querySelectorAll('.seg').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
  });
  $('speed').title = 'Quarters per second';

  $('layers').innerHTML = LAYERS.map(function (l) {
    return '<button class="chip-btn" type="button" data-layer="' + l[0] + '" aria-pressed="true"><i class="dot" style="background:' + l[2] + '"></i>' + l[1] + '</button>';
  }).join('');
  $('layers').addEventListener('click', function (e) {
    var b = e.target.closest('[data-layer]');
    if (!b) return;
    var on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    map.setLayer(b.getAttribute('data-layer'), on);
  });

  $('chart-tabs').innerHTML = CHART_TABS.map(function (t) {
    return '<button class="tab" role="tab" type="button" data-tab="' + t[0] + '" aria-selected="' + (t[0] === state.chartTab) + '">' + t[1] + '</button>';
  }).join('');
  $('chart-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    state.chartTab = b.getAttribute('data-tab');
    $('chart-tabs').querySelectorAll('.tab').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
    renderCharts();
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-company]');
    if (b && !e.target.closest('#overlay')) { openOverlay(function () { overlays.company(Number(b.getAttribute('data-company'))); }); return; }
    if (e.target.closest('#focus-clear')) { map.select(null); renderFocus(); }
  });

  $('company-search').addEventListener('change', function (e) {
    var q = e.target.value.trim().toLowerCase();
    var c = state.sim.companies.filter(function (x) { return x.name.toLowerCase() === q; })[0]
      || state.sim.companies.filter(function (x) { return x.name.toLowerCase().indexOf(q) === 0; })[0];
    if (!c) return;
    map.select(c);
    map.focusOn(c, 2.4);
    renderFocus();
    e.target.value = '';
  });

  $('zoom-in').addEventListener('click', function () { map.zoomButton(1.6); });
  $('zoom-out').addEventListener('click', function () { map.zoomButton(1 / 1.6); });
  $('zoom-reset').addEventListener('click', function () { map.resetView(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlays.isOpen()) { overlays.close(); return; }
    var tag = (e.target.tagName || '').toLowerCase();
    if (e.code === 'Space' && !overlays.isOpen() && tag !== 'input' && tag !== 'button' && tag !== 'select') {
      e.preventDefault();
      toggle();
    }
  });

  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var onTheme = function () { map.setTheme(); renderLegend(); };
  if (mq.addEventListener) mq.addEventListener('change', onTheme); else if (mq.addListener) mq.addListener(onTheme);
  window.addEventListener('resize', function () { map.applyZoom(); });

  function renderLegend() {
    $('map-legend').innerHTML = '<button class="legend-close" type="button" aria-label="Hide legend">✕</button>' + map.legendHtml();
  }
  $('map-legend').addEventListener('click', function (e) {
    if (!e.target.closest('.legend-close')) return;
    $('map-legend').hidden = true;
    $('legend-open').hidden = false;
  });
  $('legend-open').addEventListener('click', function () {
    $('map-legend').hidden = false;
    $('legend-open').hidden = true;
  });

  buildControls();
  renderLegend();
  newRun();
})();
