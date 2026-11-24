/*
 * Bay Area engineering workforce — simulation engine. Pure, no DOM.
 *
 * Every engineer and manager is an individual. Each has a home city, an
 * employer (or none), a level in the org pyramid, a comp, the comp of the
 * position they hold ("band"), years of experience, and a status:
 *   employed · in the talent pool (new grad / switching jobs / laid off)
 *   · retired · left the Bay Area.
 *
 * One step = one quarter, in this order:
 *   1. Q1 only: incumbents get the annual raise; position bands, open reqs
 *      and the new-grad market grow by the (smaller) band growth.
 *   2. Retirements: retirePct of the labour force per year, oldest hands most
 *      likely. A departing employee's seat becomes a backfill.
 *   3. Voluntary attrition from each company's half-life. Leavers join the
 *      pool expecting their current comp; their seat becomes a backfill.
 *   4. Layoff quarter only: large companies and startups lay off their annual
 *      share. Those seats are eliminated; the laid-off join the pool and will
 *      accept (1 − layoff discount) of their last comp.
 *   5. Graduation quarter: new grads join the pool (gradPct of labour force).
 *   6. Growth plan: each company's funded headcount grows toward its target;
 *      missing seats (by org level, kept at a 1:span pyramid) become reqs.
 *   7. Hiring: every open req, across all companies in random order, screens
 *      a slate from the pool and makes offers until one accepts. A company
 *      hires at most max(hireCapMin, hireCapPct × headcount) a quarter, and a
 *      startup never exceeds startupMax.
 *      Offer = the candidate's ask, capped at the position's band.
 *      P(accept) = base × (offer / ask)^elasticity × 2^(−commute / nearbyMiles):
 *      at equal comp, a candidate nearbyMiles closer is twice as likely to say yes.
 *      Unfilled reqs raise their band by the offer escalation.
 *   8. The pool ages: asks decay, and (optionally) long-idle people leave.
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    // Run
    years: 5,
    companies: 200,          // X: X/2 large (by size), X/2 startups
    seed: 42,
    // Rules from the brief
    startupMax: 25,
    hireCapPct: 5,           // per quarter, % of headcount
    hireCapMin: 5,
    capIncludesBackfills: 1, // 0 = only growth hires count toward the cap
    halfLifeLarge: 4,        // years
    halfLifeStartup: 2,
    layoffLargePct: 5,       // per year
    layoffStartupPct: 20,
    gradPct: 3,              // % of labour force per year
    retirePct: 2,
    layoffDiscountPct: 20,
    raisePct: 10,            // incumbents, per year
    bandGrowthPct: 2,        // a position's comp, per year
    hiringCostPct: 5,        // of the new hire's comp
    span: 10,                // engineers per manager
    nearbyMiles: 15,         // acceptance halves for every extra this-many miles
    // Candidate behaviour
    baseAcceptPct: 75,       // P(accept) at full ask, zero commute
    compElasticity: 4,
    reservationDecayPct: 2,  // per idle quarter
    switchPremiumPct: 0,     // what job-switchers ask on top of current comp
    exitAfterQuarters: 0,    // 0 = never leave the Bay Area
    // Company behaviour
    growthLargePct: 5,       // funded headcount growth per year
    growthStartupPct: 40,
    slate: 12,               // candidates screened per req per quarter
    offerEscalationPct: 3,   // band bump per unfilled quarter
    promoteSharePct: 50,     // manager seats filled from within
    layoffTargeting: 0,      // 0 random, 1 most over-band first
    freezeOnLayoff: 0,       // 1 = no hiring in a company's layoff quarter
    layoffQuarter: 1,
    gradQuarter: 3,          // 0 = spread over the year
    initialPoolPct: 3,       // initial pool, % of employed
  };

  var START_YEAR = 2027;
  var LEVEL_NAMES = ['Engineer', 'Engineering Manager', 'Senior Manager', 'Director', 'VP Engineering', 'SVP Engineering', 'EVP Engineering'];
  var MIN_EXP = [0, 4, 7, 10, 14, 17, 20];
  var MGR_BAND = [0, 290000, 380000, 500000, 700000, 950000, 1200000];
  var TIER = { A: 1.25, B: 1.1, C: 0.95, G: 1.0, S: 0.88 };
  var GRAD_COMP = 140000;
  var INTRA_CITY_MILES = 3;
  var ROAD_FACTOR = 1.2;

  var S = { EMPLOYED: 0, GRAD: 1, SWITCHER: 2, LAID_OFF: 3, RETIRED: 4, EXITED: 5 };
  var STATUS_NAMES = ['Employed', 'New grad (pool)', 'Switching jobs (pool)', 'Laid off (pool)', 'Retired', 'Left Bay Area'];
  var EV = { HIRE: 1, LEAVE: 2, LAYOFF: 3, RETIRE: 4, PROMOTE: 5, GRAD: 6, EXIT: 7 };
  var EVENT_NAMES = ['', 'Hired', 'Left voluntarily', 'Laid off', 'Retired', 'Promoted', 'Graduated', 'Left the Bay Area'];

  var FIRST = ['Aarav', 'Maya', 'Wei', 'Sofia', 'Diego', 'Priya', 'Ethan', 'Mei', 'Omar', 'Hana', 'Lucas', 'Ananya',
    'Noah', 'Yuki', 'Mateo', 'Leila', 'Jin', 'Grace', 'Ravi', 'Chloe', 'Kofi', 'Isabel', 'Arjun', 'Nadia', 'Samuel',
    'Lina', 'Hiro', 'Elena', 'Tariq', 'Zoe', 'Vikram', 'Amara', 'Daniel', 'Sakura', 'Andre', 'Fatima', 'Kai', 'Rosa',
    'Min-jun', 'Olivia', 'Felix', 'Aisha', 'Tomas', 'Ingrid', 'Raj', 'Camila', 'Ben', 'Nia', 'Luca', 'Divya',
    'Marcus', 'Ji-woo', 'Emma', 'Hamza', 'Paulo', 'Freya', 'Sanjay', 'Adaeze', 'Chen', 'Valentina'];
  var LAST = ['Patel', 'Chen', 'Garcia', 'Kim', 'Nguyen', 'Singh', 'Smith', 'Wang', 'Rodriguez', 'Lee', 'Kumar',
    'Martinez', 'Zhang', 'Johnson', 'Tran', 'Sharma', 'Lopez', 'Liu', 'Brown', 'Park', 'Gupta', 'Hernandez', 'Li',
    'Williams', 'Okafor', 'Ali', 'Nakamura', 'Rossi', 'Cohen', 'Silva', 'Murphy', 'Iyer', 'Huang', 'Davis', 'Reyes',
    'Yamamoto', 'Khan', 'Fischer', 'Mensah', 'Novak', 'Rao', 'Wu', 'Andersen', 'Moreno', 'Choi', 'Shah', 'Taylor',
    'Ortiz', 'Hoang', 'Mehta', 'Bauer', 'Adeyemi', 'Sato', 'Popescu', 'Yang', 'Desai', 'Walker', 'Castillo',
    'Lindqvist', 'Ibrahim'];

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function nameOf(id) {
    var h = Math.imul(id + 1, 2654435761) >>> 0;
    var g = Math.imul((id + 7) ^ 0x5bd1e995, 2246822519) >>> 0;
    return FIRST[h % FIRST.length] + ' ' + LAST[g % LAST.length];
  }

  function icBand(exp) { return 140000 * Math.pow(1.065, Math.min(exp, 16)); }

  // Counts per level for a team of `engineers` with one manager per `span`
  // reports, up to a single head. [engineers, managers, senior managers, ...]
  function pyramid(engineers, span) {
    var levels = [engineers];
    var n = engineers;
    while (n > 1 && levels.length < LEVEL_NAMES.length) {
      n = Math.ceil(n / span);
      levels.push(n);
    }
    return levels;
  }
  function pyramidTotal(engineers, span) {
    return pyramid(engineers, span).reduce(function (a, b) { return a + b; }, 0);
  }
  // The biggest pyramid that fits in `headcount` people.
  function pyramidForHeadcount(headcount, span) {
    var lo = 0, hi = Math.max(0, Math.floor(headcount));
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (pyramidTotal(mid, span) <= headcount) lo = mid; else hi = mid - 1;
    }
    return pyramid(lo, span);
  }

  function haversineMiles(a, b) {
    var R = 3958.8, toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function normalizeConfig(input) {
    var cfg = {};
    for (var k in DEFAULTS) {
      var v = input && input[k] != null ? Number(input[k]) : DEFAULTS[k];
      cfg[k] = isFinite(v) ? v : DEFAULTS[k];
    }
    cfg.years = Math.max(1, Math.min(20, Math.round(cfg.years)));
    cfg.companies = Math.max(2, Math.min(500, Math.round(cfg.companies)));
    cfg.startupMax = Math.max(3, Math.round(cfg.startupMax));
    cfg.hireCapMin = Math.max(0, Math.round(cfg.hireCapMin));
    cfg.halfLifeLarge = Math.max(0.25, cfg.halfLifeLarge);
    cfg.halfLifeStartup = Math.max(0.25, cfg.halfLifeStartup);
    cfg.span = Math.max(2, Math.round(cfg.span));
    cfg.nearbyMiles = Math.max(1, cfg.nearbyMiles);
    cfg.slate = Math.max(1, Math.round(cfg.slate));
    cfg.layoffQuarter = Math.max(1, Math.min(4, Math.round(cfg.layoffQuarter)));
    cfg.gradQuarter = Math.max(0, Math.min(4, Math.round(cfg.gradQuarter)));
    cfg.exitAfterQuarters = Math.max(0, Math.round(cfg.exitAfterQuarters));
    cfg.layoffTargeting = cfg.layoffTargeting ? 1 : 0;
    cfg.freezeOnLayoff = cfg.freezeOnLayoff ? 1 : 0;
    cfg.capIncludesBackfills = cfg.capIncludesBackfills ? 1 : 0;
    cfg.seed = Math.round(cfg.seed) >>> 0;
    return cfg;
  }

  // ------------------------------------------------------------------ agents

  var FIELDS = {
    company: Int16Array, lastCompany: Int16Array, city: Uint8Array, level: Uint8Array, status: Uint8Array,
    employers: Uint8Array, layoffs: Uint8Array, comp: Float32Array, band: Float32Array, expect: Float32Array,
    exp: Float32Array, joinedQ: Int16Array, idleQ: Int16Array, bornQ: Int16Array,
    memberPos: Int32Array, poolPos: Int32Array, activePos: Int32Array,
  };

  function Agents(capacity) {
    this.n = 0;
    this.cap = 0;
    this.grow(capacity);
  }
  Agents.prototype.grow = function (capacity) {
    for (var f in FIELDS) {
      var next = new FIELDS[f](capacity);
      if (this[f]) next.set(this[f]);
      this[f] = next;
    }
    this.cap = capacity;
  };
  Agents.prototype.create = function () {
    if (this.n >= this.cap) this.grow(Math.ceil(this.cap * 1.5) + 1024);
    var a = this.n++;
    this.company[a] = -1;
    this.lastCompany[a] = -1;
    this.memberPos[a] = -1;
    this.poolPos[a] = -1;
    this.activePos[a] = -1;
    return a;
  };

  function Events() {
    this.n = 0;
    this.cap = 0;
    this.grow(65536);
  }
  Events.prototype.grow = function (capacity) {
    var f = { agent: Int32Array, q: Int16Array, type: Uint8Array, company: Int16Array, value: Float32Array };
    for (var k in f) {
      var next = new f[k](capacity);
      if (this[k]) next.set(this[k]);
      this[k] = next;
    }
    this.cap = capacity;
  };
  Events.prototype.push = function (agent, q, type, company, value) {
    if (this.n >= this.cap) this.grow(this.cap * 2);
    var i = this.n++;
    this.agent[i] = agent;
    this.q[i] = q;
    this.type[i] = type;
    this.company[i] = company;
    this.value[i] = value;
  };

  // ------------------------------------------------------------------ simulation

  function WorkforceSim(input, data) {
    var cfg = this.cfg = normalizeConfig(input);
    var rng = this.rng = mulberry32(cfg.seed);
    this.cities = data.cities;
    this.universe = data.companies;
    this.q = 0;
    this.quarters = cfg.years * 4;
    this.gradComp = GRAD_COMP;
    this.bandIndex = 1;      // cumulative band growth since start
    this.retireCarry = 0;
    this.gradCarry = 0;
    this.agents = new Agents(1024);
    this.events = new Events();
    this.pool = [];
    this.active = [];
    this.series = [];

    // Commute miles between every pair of cities.
    var nC = this.cities.length;
    this.dist = [];
    for (var i = 0; i < nC; i++) {
      this.dist.push(new Float32Array(nC));
      for (var j = 0; j < nC; j++) {
        this.dist[i][j] = i === j ? INTRA_CITY_MILES
          : Math.max(INTRA_CITY_MILES, haversineMiles(this.cities[i], this.cities[j]) * ROAD_FACTOR);
      }
    }
    var cityIndex = {};
    this.cities.forEach(function (c, idx) { cityIndex[c.name] = idx; });
    this.cityIndex = cityIndex;
    var popCum = [], tot = 0;
    this.cities.forEach(function (c) { tot += c.pop; popCum.push(tot); });
    this.popCum = popCum;
    this.popTotal = tot;

    // X companies: the X/2 largest, plus X/2 startups.
    var nLarge = Math.floor(cfg.companies / 2);
    var nStart = cfg.companies - nLarge;
    var large = this.universe.filter(function (c) { return c.kind !== 'startup'; }).slice(0, nLarge);
    var startups = this.universe.filter(function (c) { return c.kind === 'startup'; }).slice(0, nStart);
    var self = this;
    this.companies = large.concat(startups).map(function (u, idx) {
      var kind = u.kind === 'startup' ? 'startup' : 'large';
      var mult = TIER[u.payTier] || 1;
      return {
        idx: idx, uid: u.id, name: u.name, sector: u.sector, kind: kind, sourceKind: u.kind,
        synthetic: u.synthetic, payTier: u.payTier, mult: mult,
        city: cityIndex[u.city], cityName: u.city, engineersData: u.engineers,
        members: [], levelCount: [0, 0, 0, 0, 0, 0, 0], reqs: [], target: 0, startHc: 0,
        frozen: false, capQ: 0, hiredQ: 0,
        series: { hc: [], hires: [], leavers: [], layoffs: [], retired: [], promos: [], planned: [], cap: [], unfilled: [],
          payroll: [], hireSpend: [], avgComp: [], avgBand: [], commute: [], levels: [] },
        totals: { hires: 0, leavers: 0, layoffs: 0, retired: 0, promos: 0, hireSpend: 0 },
        qc: null,
      };
    });
    this.companyByUid = {};
    this.companies.forEach(function (c) { self.companyByUid[c.uid] = c; });

    this.populate();
    this.snapshot();
  }

  var P = WorkforceSim.prototype;

  P.rand = function () { return this.rng(); };
  P.randInt = function (n) { return Math.floor(this.rng() * n); };
  P.lognormal = function (sigma) {
    var u = 1 - this.rng(), v = this.rng();
    return Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
  };
  P.homeCity = function () {
    var r = this.rng() * this.popTotal, cum = this.popCum;
    var lo = 0, hi = cum.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    return lo;
  };
  P.levelBand = function (c, level) {
    return (level === 0 ? icBand(4) : MGR_BAND[level]) * c.mult * this.bandIndex;
  };

  // ---- list bookkeeping (swap-remove, O(1))
  P.joinCompany = function (a, c, level) {
    var A = this.agents;
    A.company[a] = c.idx;
    A.level[a] = level;
    A.status[a] = S.EMPLOYED;
    A.memberPos[a] = c.members.length;
    c.members.push(a);
    c.levelCount[level]++;
  };
  P.leaveCompany = function (a) {
    var A = this.agents, c = this.companies[A.company[a]];
    var i = A.memberPos[a], last = c.members.pop();
    if (last !== a) { c.members[i] = last; A.memberPos[last] = i; }
    A.memberPos[a] = -1;
    c.levelCount[A.level[a]]--;
    A.lastCompany[a] = c.idx;
    A.company[a] = -1;
    return c;
  };
  P.joinPool = function (a, status, ask) {
    var A = this.agents;
    A.status[a] = status;
    A.expect[a] = ask;
    A.idleQ[a] = 0;
    A.poolPos[a] = this.pool.length;
    this.pool.push(a);
  };
  P.leavePool = function (a) {
    var A = this.agents, i = A.poolPos[a], last = this.pool.pop();
    if (last !== a) { this.pool[i] = last; A.poolPos[last] = i; }
    A.poolPos[a] = -1;
  };
  P.joinActive = function (a) {
    this.agents.activePos[a] = this.active.length;
    this.active.push(a);
  };
  P.leaveActive = function (a) {
    var A = this.agents, i = A.activePos[a], last = this.active.pop();
    if (last !== a) { this.active[i] = last; A.activePos[last] = i; }
    A.activePos[a] = -1;
  };

  // ---- initial workforce
  P.populate = function () {
    var cfg = this.cfg, A = this.agents, self = this;
    var maxStartupEng = pyramidForHeadcount(cfg.startupMax, cfg.span)[0];
    this.companies.forEach(function (c) {
      var eng = c.kind === 'startup' ? Math.min(c.engineersData, maxStartupEng) : c.engineersData;
      var counts = pyramid(eng, cfg.span);
      counts.forEach(function (count, level) {
        for (var k = 0; k < count; k++) {
          var a = A.create();
          var u = self.rand();
          var exp = level === 0 ? 25 * Math.pow(u, 1.7) : MIN_EXP[level] + 3 + 14 * u;
          A.exp[a] = exp;
          A.city[a] = self.homeCity();
          var band = (level === 0 ? icBand(exp) : MGR_BAND[level]) * c.mult * self.lognormal(0.1);
          A.band[a] = band;
          A.comp[a] = band;
          var tenureYears = c.kind === 'startup' ? 3 * self.rand() : Math.min(15, -Math.log(1 - self.rand()) * 5.8);
          A.joinedQ[a] = -Math.round(tenureYears * 4);
          A.employers[a] = 1 + Math.floor(exp / 4 * self.rand());
          A.bornQ[a] = -1;
          self.joinCompany(a, c, level);
          self.joinActive(a);
        }
      });
      c.startHc = c.members.length;
      c.target = c.startHc;
    });

    // An initial talent pool: a mix of new grads, job-switchers and laid-off engineers.
    var n = Math.round(this.employedCount() * cfg.initialPoolPct / 100);
    for (var i = 0; i < n; i++) {
      var a = A.create();
      var r = this.rand();
      var status = r < 0.25 ? S.GRAD : r < 0.65 ? S.SWITCHER : S.LAID_OFF;
      var exp = status === S.GRAD ? 0 : 1 + 20 * Math.pow(this.rand(), 1.5);
      A.exp[a] = exp;
      A.city[a] = this.homeCity();
      A.level[a] = exp >= MIN_EXP[1] && this.rand() < 0.12 ? 1 : 0;
      A.employers[a] = status === S.GRAD ? 0 : 1 + Math.floor(exp / 4);
      A.bornQ[a] = -1;
      var market = status === S.GRAD ? GRAD_COMP : icBand(exp) * 1.05 * this.lognormal(0.1);
      A.comp[a] = market;
      this.joinPool(a, status, status === S.LAID_OFF ? market * (1 - cfg.layoffDiscountPct / 100) : market);
      this.joinActive(a);
    }
  };

  P.employedCount = function () {
    var n = 0;
    for (var i = 0; i < this.companies.length; i++) n += this.companies[i].members.length;
    return n;
  };

  Object.defineProperty(P, 'done', { get: function () { return this.q >= this.quarters; } });

  P.label = function (q) {
    if (q === 0) return 'Start';
    var qq = q - 1;
    return 'Q' + (qq % 4 + 1) + ' ' + (START_YEAR + Math.floor(qq / 4));
  };

  // ------------------------------------------------------------------ one quarter

  P.step = function () {
    if (this.done) return null;
    var cfg = this.cfg, A = this.agents;
    var qIdx = this.q;               // 0-based quarter being simulated
    var qOfYear = qIdx % 4 + 1;
    var self = this;
    var flow = this.flow = {
      hires: 0, leavers: 0, layoffs: 0, retired: 0, grads: 0, promos: 0, exits: 0,
      hireSpend: 0, hireComp: 0, hireCommute: 0, fillAge: 0,
      bySource: [0, 0, 0, 0], pairs: {},
    };
    this.companies.forEach(function (c) {
      c.qc = { hires: 0, leavers: 0, layoffs: 0, retired: 0, promos: 0, hireSpend: 0 };
      c.frozen = false;
    });

    // 1. Annual comp cycle.
    if (qOfYear === 1 && qIdx > 0) {
      var raise = 1 + cfg.raisePct / 100, growth = 1 + cfg.bandGrowthPct / 100;
      for (var a = 0; a < A.n; a++) {
        if (A.status[a] === S.EMPLOYED) { A.comp[a] *= raise; A.band[a] *= growth; }
      }
      this.companies.forEach(function (c) { c.reqs.forEach(function (r) { r.band *= growth; }); });
      this.gradComp *= growth;
      this.bandIndex *= growth;
    }

    // 2. Retirements.
    this.retire();

    // 3. Voluntary attrition.
    var pLarge = 1 - Math.pow(0.5, 1 / (4 * cfg.halfLifeLarge));
    var pStart = 1 - Math.pow(0.5, 1 / (4 * cfg.halfLifeStartup));
    this.companies.forEach(function (c) {
      var p = c.kind === 'large' ? pLarge : pStart;
      for (var i = c.members.length - 1; i >= 0; i--) {
        if (self.rand() < p) self.quit(c.members[i]);
      }
    });

    // 4. Layoffs.
    if (qOfYear === cfg.layoffQuarter) this.layoffRound();

    // 5. New grads.
    this.graduate(qOfYear);

    // 6. Growth plan → reqs.
    this.companies.forEach(function (c) { self.plan(c); });

    // 7. Hiring.
    this.hire();

    // 8. The pool ages.
    this.agePool();

    for (var e = 0; e < A.n; e++) if (A.status[e] === S.EMPLOYED) A.exp[e] += 0.25;

    this.q++;
    this.snapshot();
    return this.series[this.series.length - 1];
  };

  P.retire = function () {
    var cfg = this.cfg, A = this.agents;
    this.retireCarry += (this.employedCount() + this.pool.length) * cfg.retirePct / 100 / 4;
    var n = Math.floor(this.retireCarry);
    this.retireCarry -= n;
    var tries = n * 400;
    while (n > 0 && tries-- > 0 && this.active.length) {
      var a = this.active[this.randInt(this.active.length)];
      var w = Math.min(1, Math.pow(A.exp[a] / 35, 3));
      if (this.rand() >= w) continue;
      if (A.status[a] === S.EMPLOYED) {
        var level = A.level[a], band = A.band[a];
        var c = this.leaveCompany(a);
        c.qc.retired++;
        this.events.push(a, this.q, EV.RETIRE, c.idx, A.comp[a]);
        this.backfill(c, level, band);
      } else {
        this.leavePool(a);
        this.events.push(a, this.q, EV.RETIRE, -1, A.comp[a]);
      }
      A.status[a] = S.RETIRED;
      this.leaveActive(a);
      this.flow.retired++;
      n--;
    }
  };

  P.quit = function (a) {
    var A = this.agents, level = A.level[a], band = A.band[a];
    var c = this.leaveCompany(a);
    this.joinPool(a, S.SWITCHER, A.comp[a] * (1 + this.cfg.switchPremiumPct / 100));
    c.qc.leavers++;
    this.flow.leavers++;
    this.events.push(a, this.q, EV.LEAVE, c.idx, A.comp[a]);
    this.backfill(c, level, band);
  };

  // A vacated seat: managers are often replaced from within, which opens the
  // promotee's old seat instead.
  P.backfill = function (c, level, band) {
    var A = this.agents;
    if (level >= 1 && this.rand() * 100 < this.cfg.promoteSharePct && c.members.length) {
      var best = -1, i, a;
      if (level - 1 === 0) {
        for (i = 0; i < 24; i++) {
          a = c.members[this.randInt(c.members.length)];
          if (A.level[a] === 0 && A.exp[a] >= MIN_EXP[level] && (best < 0 || A.exp[a] > A.exp[best])) best = a;
        }
      } else {
        for (i = 0; i < c.members.length; i++) {
          a = c.members[i];
          if (A.level[a] === level - 1 && A.exp[a] >= MIN_EXP[level] && (best < 0 || A.exp[a] > A.exp[best])) best = a;
        }
      }
      if (best >= 0) {
        var oldBand = A.band[best];
        c.levelCount[A.level[best]]--;
        A.level[best] = level;
        c.levelCount[level]++;
        A.band[best] = band;
        A.comp[best] = Math.max(A.comp[best] * 1.1, band * 0.9);
        c.qc.promos++;
        this.flow.promos++;
        this.events.push(best, this.q, EV.PROMOTE, c.idx, A.comp[best]);
        this.backfill(c, level - 1, oldBand);
        return;
      }
    }
    c.reqs.push({ level: level, band: band, age: 0, kind: 0 });
  };

  P.layoffRound = function () {
    var cfg = this.cfg, A = this.agents, self = this;
    this.companies.forEach(function (c) {
      var rate = (c.kind === 'large' ? cfg.layoffLargePct : cfg.layoffStartupPct) / 100;
      var expected = c.members.length * rate;
      var n = Math.floor(expected) + (self.rand() < expected - Math.floor(expected) ? 1 : 0);
      if (n <= 0) return;
      var victims;
      if (cfg.layoffTargeting === 1) {
        victims = c.members.slice().sort(function (x, y) { return A.comp[y] / A.band[y] - A.comp[x] / A.band[x]; }).slice(0, n);
      } else {
        victims = [];
        var picked = {};
        while (victims.length < n && victims.length < c.members.length) {
          var a = c.members[self.randInt(c.members.length)];
          if (!picked[a]) { picked[a] = true; victims.push(a); }
        }
      }
      victims.forEach(function (v) {
        self.leaveCompany(v);
        A.layoffs[v]++;
        self.joinPool(v, S.LAID_OFF, A.comp[v] * (1 - cfg.layoffDiscountPct / 100));
        self.events.push(v, self.q, EV.LAYOFF, c.idx, A.comp[v]);
      });
      c.qc.layoffs += victims.length;
      self.flow.layoffs += victims.length;
      // Laid-off seats are eliminated: funded headcount is what's left plus open backfills.
      c.reqs = c.reqs.filter(function (r) { return r.kind === 0; });
      c.target = c.members.length + c.reqs.length;
      if (cfg.freezeOnLayoff) c.frozen = true;
    });
  };

  P.graduate = function (qOfYear) {
    var cfg = this.cfg, A = this.agents;
    var lf = this.employedCount() + this.pool.length;
    if (cfg.gradQuarter === 0) this.gradCarry += lf * cfg.gradPct / 100 / 4;
    else if (qOfYear === cfg.gradQuarter) this.gradCarry += lf * cfg.gradPct / 100;
    var n = Math.floor(this.gradCarry);
    this.gradCarry -= n;
    for (var i = 0; i < n; i++) {
      var a = A.create();
      A.city[a] = this.homeCity();
      A.level[a] = 0;
      A.exp[a] = 0;
      A.employers[a] = 0;
      A.bornQ[a] = this.q;
      A.comp[a] = 0;
      this.joinPool(a, S.GRAD, this.gradComp * this.lognormal(0.08));
      this.joinActive(a);
      this.events.push(a, this.q, EV.GRAD, -1, A.expect[a]);
    }
    this.flow.grads += n;
  };

  // Funded headcount grows toward plan; gaps in the pyramid become growth reqs.
  P.plan = function (c) {
    var cfg = this.cfg;
    var g = (c.kind === 'large' ? cfg.growthLargePct : cfg.growthStartupPct) / 100;
    c.target *= Math.pow(1 + g, 0.25);
    if (c.kind === 'startup') c.target = Math.min(cfg.startupMax, c.target);
    var want = pyramidForHeadcount(Math.round(c.target), cfg.span);
    var open = [0, 0, 0, 0, 0, 0, 0];
    c.reqs.forEach(function (r) { open[r.level]++; });
    for (var level = 0; level < want.length; level++) {
      var gap = want[level] - c.levelCount[level] - open[level];
      for (var k = 0; k < gap; k++) c.reqs.push({ level: level, band: this.levelBand(c, level), age: 0, kind: 1 });
    }
  };

  P.eligible = function (a, level) {
    var A = this.agents;
    return A.exp[a] >= MIN_EXP[level] && A.level[a] + 1 >= level;
  };

  P.hire = function () {
    var cfg = this.cfg;
    var queue = [];
    this.companies.forEach(function (c) {
      c.capQ = Math.max(cfg.hireCapMin, Math.floor(cfg.hireCapPct / 100 * c.members.length));
      c.hiredQ = 0;
      c.plannedQ = c.reqs.length;
      if (c.frozen) return;
      c.reqs.forEach(function (r) { queue.push(c, r); });
    });
    // Fisher–Yates over (company, req) pairs so no company gets first pick.
    var pairs = queue.length / 2;
    for (var i = pairs - 1; i > 0; i--) {
      var j = this.randInt(i + 1);
      var tc = queue[2 * i], tr = queue[2 * i + 1];
      queue[2 * i] = queue[2 * j]; queue[2 * i + 1] = queue[2 * j + 1];
      queue[2 * j] = tc; queue[2 * j + 1] = tr;
    }
    for (var k = 0; k < pairs; k++) {
      var c = queue[2 * k], r = queue[2 * k + 1];
      var capped = cfg.capIncludesBackfills || r.kind === 1;
      if (capped && c.hiredQ >= c.capQ) continue;
      if (c.kind === 'startup' && c.members.length >= cfg.startupMax) continue;
      if (this.fill(c, r)) { r.filled = true; if (capped) c.hiredQ++; }
    }
    var esc = 1 + cfg.offerEscalationPct / 100;
    this.companies.forEach(function (c) {
      c.reqs = c.reqs.filter(function (r) { return !r.filled; });
      c.reqs.forEach(function (r) { r.age++; r.band *= esc; });
      c.capHit = c.hiredQ >= c.capQ && c.reqs.some(function (r) { return cfg.capIncludesBackfills || r.kind === 1; });
    });
  };

  // Screen a slate from the pool; offer to the most experienced first.
  P.fill = function (c, r) {
    var cfg = this.cfg, A = this.agents, pool = this.pool;
    if (!pool.length) return false;
    var slate = [];
    for (var t = 0; t < cfg.slate * 4 && slate.length < cfg.slate; t++) {
      var a = pool[this.randInt(pool.length)];
      if (this.eligible(a, r.level) && slate.indexOf(a) < 0) slate.push(a);
    }
    slate.sort(function (x, y) { return A.exp[y] - A.exp[x]; });
    var base = cfg.baseAcceptPct / 100;
    for (var s = 0; s < slate.length; s++) {
      var cand = slate[s];
      var ask = A.expect[cand];
      var offer = Math.min(r.band, ask);
      var miles = this.dist[A.city[cand]][c.city];
      var p = base * Math.pow(offer / ask, cfg.compElasticity) * Math.pow(2, -miles / cfg.nearbyMiles);
      if (this.rand() < p) {
        this.onboard(cand, c, r, offer, miles);
        return true;
      }
    }
    return false;
  };

  P.onboard = function (a, c, r, offer, miles) {
    var A = this.agents, flow = this.flow;
    var source = A.status[a];
    this.leavePool(a);
    this.joinCompany(a, c, r.level);
    A.comp[a] = offer;
    A.band[a] = r.band;
    A.joinedQ[a] = this.q;
    A.employers[a] = Math.min(255, A.employers[a] + 1);
    var spend = offer * this.cfg.hiringCostPct / 100;
    c.qc.hires++;
    c.qc.hireSpend += spend;
    flow.hires++;
    flow.hireSpend += spend;
    flow.hireComp += offer;
    flow.hireCommute += miles;
    flow.fillAge += r.age;
    flow.bySource[source]++;
    var key = A.city[a] + ':' + c.city;
    flow.pairs[key] = (flow.pairs[key] || 0) + 1;
    this.events.push(a, this.q, EV.HIRE, c.idx, offer);
  };

  P.agePool = function () {
    var cfg = this.cfg, A = this.agents, decay = 1 - cfg.reservationDecayPct / 100;
    var floor = this.gradComp * 0.85;
    for (var i = this.pool.length - 1; i >= 0; i--) {
      var a = this.pool[i];
      A.idleQ[a]++;
      A.expect[a] = Math.max(floor, A.expect[a] * decay);
      if (cfg.exitAfterQuarters > 0 && A.idleQ[a] >= cfg.exitAfterQuarters) {
        this.leavePool(a);
        this.leaveActive(a);
        A.status[a] = S.EXITED;
        this.flow.exits++;
        this.events.push(a, this.q, EV.EXIT, -1, A.expect[a]);
      }
    }
  };

  // ------------------------------------------------------------------ readouts

  P.snapshot = function () {
    var A = this.agents, self = this;
    var employedLarge = 0, employedStartup = 0, payroll = 0, compSum = 0, bandSum = 0, commuteSum = 0, n = 0;
    var openReqs = 0, backfills = 0, oldReqs = 0, capHit = 0;
    this.companies.forEach(function (c) {
      var cPay = 0, cBand = 0, cCommute = 0;
      for (var i = 0; i < c.members.length; i++) {
        var a = c.members[i];
        cPay += A.comp[a];
        cBand += A.band[a];
        cCommute += self.dist[A.city[a]][c.city];
      }
      var hc = c.members.length;
      if (c.kind === 'large') employedLarge += hc; else employedStartup += hc;
      payroll += cPay; compSum += cPay; bandSum += cBand; commuteSum += cCommute; n += hc;
      openReqs += c.reqs.length;
      c.reqs.forEach(function (r) { if (r.kind === 0) backfills++; if (r.age >= 2) oldReqs++; });
      if (c.capHit) capHit++;
      var s = c.series, qc = c.qc || { hires: 0, leavers: 0, layoffs: 0, retired: 0, promos: 0, hireSpend: 0 };
      s.hc.push(hc);
      s.hires.push(qc.hires); s.leavers.push(qc.leavers); s.layoffs.push(qc.layoffs);
      s.retired.push(qc.retired); s.promos.push(qc.promos);
      s.planned.push(c.plannedQ || 0); s.cap.push(c.capQ || 0); s.unfilled.push(c.reqs.length);
      s.payroll.push(cPay / 4); s.hireSpend.push(qc.hireSpend);
      s.avgComp.push(hc ? cPay / hc : 0); s.avgBand.push(hc ? cBand / hc : 0);
      s.commute.push(hc ? cCommute / hc : 0);
      s.levels.push(c.levelCount.slice());
      c.totals.hires += qc.hires; c.totals.leavers += qc.leavers; c.totals.layoffs += qc.layoffs;
      c.totals.retired += qc.retired; c.totals.promos += qc.promos; c.totals.hireSpend += qc.hireSpend;
    });
    var poolBy = [0, 0, 0, 0];
    var idleSum = 0;
    for (var p = 0; p < this.pool.length; p++) { poolBy[A.status[this.pool[p]]]++; idleSum += A.idleQ[this.pool[p]]; }
    var retired = 0, exited = 0;
    for (var a = 0; a < A.n; a++) { if (A.status[a] === S.RETIRED) retired++; else if (A.status[a] === S.EXITED) exited++; }
    var f = this.flow || { hires: 0, leavers: 0, layoffs: 0, retired: 0, grads: 0, promos: 0, exits: 0, hireSpend: 0,
      hireComp: 0, hireCommute: 0, fillAge: 0, bySource: [0, 0, 0, 0], pairs: {} };
    var pairs = Object.keys(f.pairs).map(function (k) {
      var parts = k.split(':');
      return [Number(parts[0]), Number(parts[1]), f.pairs[k]];
    }).sort(function (x, y) { return y[2] - x[2]; });
    var employed = employedLarge + employedStartup;
    var lf = employed + this.pool.length;
    this.series.push({
      q: this.q, label: this.label(this.q),
      employed: employed, employedLarge: employedLarge, employedStartup: employedStartup,
      pool: this.pool.length, poolGrad: poolBy[S.GRAD], poolSwitcher: poolBy[S.SWITCHER], poolLaidOff: poolBy[S.LAID_OFF],
      laborForce: lf, unemployment: lf ? this.pool.length / lf : 0, avgIdleQ: this.pool.length ? idleSum / this.pool.length : 0,
      retiredTotal: retired, exitedTotal: exited,
      hires: f.hires, leavers: f.leavers, layoffs: f.layoffs, retired: f.retired, grads: f.grads, promos: f.promos, exits: f.exits,
      hiresGrad: f.bySource[S.GRAD], hiresSwitcher: f.bySource[S.SWITCHER], hiresLaidOff: f.bySource[S.LAID_OFF],
      openReqs: openReqs, backfillReqs: backfills, growthReqs: openReqs - backfills, oldReqs: oldReqs, capHitCompanies: capHit,
      payroll: payroll / 4, hireSpend: f.hireSpend,
      avgComp: n ? compSum / n : 0, avgBand: n ? bandSum / n : 0,
      avgHireComp: f.hires ? f.hireComp / f.hires : null,
      avgCommute: n ? commuteSum / n : 0, hireCommute: f.hires ? f.hireCommute / f.hires : null,
      avgFillAge: f.hires ? f.fillAge / f.hires : null,
      gradComp: this.gradComp,
      pairs: pairs.slice(0, 120),
    });
  };

  // Residents of each city right now.
  P.cityStats = function () {
    var A = this.agents, nC = this.cities.length, self = this;
    var rows = this.cities.map(function (c, i) {
      return { id: i, name: c.name, region: c.region, pop: c.pop, employed: 0, poolGrad: 0, poolSwitcher: 0, poolLaidOff: 0,
        retired: 0, compSum: 0, commuteSum: 0, employers: {} };
    });
    for (var a = 0; a < A.n; a++) {
      var row = rows[A.city[a]], st = A.status[a];
      if (st === S.EMPLOYED) {
        row.employed++;
        row.compSum += A.comp[a];
        var co = A.company[a];
        row.commuteSum += self.dist[A.city[a]][self.companies[co].city];
        row.employers[co] = (row.employers[co] || 0) + 1;
      } else if (st === S.GRAD) row.poolGrad++;
      else if (st === S.SWITCHER) row.poolSwitcher++;
      else if (st === S.LAID_OFF) row.poolLaidOff++;
      else if (st === S.RETIRED) row.retired++;
    }
    rows.forEach(function (r) {
      r.pool = r.poolGrad + r.poolSwitcher + r.poolLaidOff;
      r.laborForce = r.employed + r.pool;
      r.unemployment = r.laborForce ? r.pool / r.laborForce : 0;
      r.avgComp = r.employed ? r.compSum / r.employed : 0;
      r.avgCommute = r.employed ? r.commuteSum / r.employed : 0;
      r.engineersPer1000 = r.laborForce / r.pop * 1000;
      r.topEmployers = Object.keys(r.employers).map(function (k) { return [Number(k), r.employers[k]]; })
        .sort(function (x, y) { return y[1] - x[1]; }).slice(0, 5);
    });
    void nC;
    return rows;
  };

  // Where a company's people live.
  P.companyResidents = function (c) {
    var A = this.agents, counts = new Array(this.cities.length).fill(0);
    for (var i = 0; i < c.members.length; i++) counts[A.city[c.members[i]]]++;
    return counts;
  };

  P.agentRecord = function (a) {
    var A = this.agents, co = A.company[a], last = A.lastCompany[a];
    var company = co >= 0 ? this.companies[co] : null;
    return {
      id: a, name: nameOf(a), status: A.status[a], statusName: STATUS_NAMES[A.status[a]],
      city: A.city[a], cityName: this.cities[A.city[a]].name,
      company: co, companyName: company ? company.name : '',
      lastCompanyName: last >= 0 ? this.companies[last].name : '',
      level: A.level[a], levelName: LEVEL_NAMES[A.level[a]],
      comp: A.comp[a], band: A.band[a], ask: A.expect[a], exp: A.exp[a],
      tenureYears: company ? (this.q - A.joinedQ[a]) / 4 : null,
      idleQ: A.idleQ[a], employers: A.employers[a], layoffs: A.layoffs[a],
      commute: company ? this.dist[A.city[a]][company.city] : null,
    };
  };

  P.history = function (a) {
    var E = this.events, A = this.agents, out = [];
    for (var i = 0; i < E.n; i++) {
      if (E.agent[i] !== a) continue;
      out.push({ q: E.q[i], label: this.label(E.q[i] + 1), type: E.type[i], typeName: EVENT_NAMES[E.type[i]],
        company: E.company[i], companyName: E.company[i] >= 0 ? this.companies[E.company[i]].name : '', value: E.value[i] });
    }
    // People in the starting workforce: where they were when the run began.
    if (A.bornQ[a] === -1) {
      var first = out[0];
      var leftFrom = first && first.type !== EV.HIRE && first.type !== EV.GRAD && first.company >= 0 ? first.company : -1;
      var startCo = leftFrom >= 0 ? leftFrom : !first && A.status[a] === S.EMPLOYED ? A.company[a] : -1;
      out.unshift({ q: -1, label: 'Start', type: 0, typeName: startCo >= 0 ? 'In the starting workforce' : 'Looking for work at the start',
        company: startCo, companyName: startCo >= 0 ? this.companies[startCo].name : '', value: 0 });
    }
    return out;
  };

  P.runToEnd = function () {
    while (!this.done) this.step();
    return this;
  };

  var api = {
    DEFAULTS: DEFAULTS, LEVEL_NAMES: LEVEL_NAMES, MIN_EXP: MIN_EXP, STATUS: S, STATUS_NAMES: STATUS_NAMES,
    EV: EV, EVENT_NAMES: EVENT_NAMES, START_YEAR: START_YEAR,
    normalizeConfig: normalizeConfig, pyramid: pyramid, pyramidForHeadcount: pyramidForHeadcount,
    haversineMiles: haversineMiles, nameOf: nameOf, WorkforceSim: WorkforceSim,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Workforce = api;
})(this);
