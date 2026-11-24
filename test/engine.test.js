// Engine invariants. Run: node test/engine.test.js
'use strict';
const assert = require('assert');
const W = require('../js/engine.js');
const data = { cities: require('../js/data/cities.js'), companies: require('../js/data/companies.js') };
const S = W.STATUS;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('  FAIL ' + name + '\n       ' + e.message);
    process.exitCode = 1;
  }
}
const make = (over) => new W.WorkforceSim(Object.assign({ companies: 60, years: 3 }, over), data);
function near(actual, expected, tol, label) {
  assert(Math.abs(actual - expected) <= tol, `${label}: ${actual.toFixed(3)} vs ${expected.toFixed(3)} (±${tol})`);
}

// Check every bookkeeping structure agrees with every agent's status.
function checkBooks(sim) {
  const A = sim.agents;
  let employed = 0, inPool = 0;
  for (let a = 0; a < A.n; a++) {
    const st = A.status[a];
    if (st === S.EMPLOYED) {
      employed++;
      const c = sim.companies[A.company[a]];
      assert(c && c.members[A.memberPos[a]] === a, `agent ${a} missing from its company`);
      assert.strictEqual(A.poolPos[a], -1, `employed agent ${a} also in pool`);
    } else if (st >= S.GRAD && st <= S.LAID_OFF) {
      inPool++;
      assert.strictEqual(sim.pool[A.poolPos[a]], a, `agent ${a} missing from pool`);
      assert.strictEqual(A.company[a], -1, `pool agent ${a} has a company`);
    } else {
      assert(A.poolPos[a] === -1 && A.memberPos[a] === -1 && A.activePos[a] === -1, `inactive agent ${a} still listed`);
    }
  }
  assert.strictEqual(employed, sim.employedCount(), 'employed count');
  assert.strictEqual(inPool, sim.pool.length, 'pool count');
  assert.strictEqual(employed + inPool, sim.active.length, 'active list');
  sim.companies.forEach((c) => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    c.members.forEach((a) => counts[A.level[a]]++);
    assert.deepStrictEqual(counts, c.levelCount, `${c.name} level counts drifted`);
  });
}

console.log('Workforce engine tests');

test('org pyramid: one manager per 10 reports, up to a single head', () => {
  assert.deepStrictEqual(W.pyramid(32000, 10), [32000, 3200, 320, 32, 4, 1]);
  assert.deepStrictEqual(W.pyramid(21, 10), [21, 3, 1]);
  assert.deepStrictEqual(W.pyramidForHeadcount(25, 10), [21, 3, 1]);
  const sim = make({});
  sim.companies.forEach((c) => {
    const eng = c.kind === 'startup' ? Math.min(c.engineersData, 21) : c.engineersData;
    assert.deepStrictEqual(c.levelCount.slice(0, W.pyramid(eng, 10).length), W.pyramid(eng, 10), c.name);
  });
});

test('X companies: X/2 largest plus X/2 startups (≤ 25 people)', () => {
  const sim = make({ companies: 40 });
  const large = sim.companies.filter((c) => c.kind === 'large');
  assert.strictEqual(large.length, 20);
  assert.deepStrictEqual(large.map((c) => c.name).slice(0, 3), ['Google', 'Apple', 'Meta']);
  sim.companies.filter((c) => c.kind === 'startup').forEach((c) => assert(c.members.length <= 25, c.name));
});

test('homes are spread in proportion to city population', () => {
  const sim = make({ companies: 200, years: 1 });
  const rows = sim.cityStats();
  const total = rows.reduce((s, r) => s + r.laborForce, 0);
  const sf = rows.find((r) => r.name === 'San Francisco'), sj = rows.find((r) => r.name === 'San Jose');
  near(sf.laborForce / total, sf.pop / sim.popTotal, 0.01, 'SF share');
  near(sj.laborForce / total, sj.pop / sim.popTotal, 0.01, 'SJ share');
});

test('bookkeeping stays consistent every quarter', () => {
  const sim = make({ exitAfterQuarters: 6, layoffTargeting: 1 });
  while (!sim.done) { sim.step(); checkBooks(sim); }
});

test('startups never exceed the max headcount', () => {
  const sim = make({ growthStartupPct: 300 });
  while (!sim.done) {
    sim.step();
    sim.companies.filter((c) => c.kind === 'startup').forEach((c) => assert(c.members.length <= 25, `${c.name} at ${c.members.length}`));
  }
});

test('no company hires more than max(5, 5% of headcount) in a quarter', () => {
  const sim = make({ growthLargePct: 40, growthStartupPct: 200 }).runToEnd();
  sim.companies.forEach((c) => {
    c.series.hires.forEach((h, i) => {
      if (i === 0) return;
      assert(h <= c.series.cap[i], `${c.name} hired ${h} > cap ${c.series.cap[i]} in ${sim.series[i].label}`);
      assert(c.series.cap[i] >= 5, 'cap floor of 5');
    });
  });
});

test('with backfills exempt, only growth hires are capped', () => {
  const a = make({}).runToEnd(), b = make({ capIncludesBackfills: 0 }).runToEnd();
  assert(b.series.at(-1).employed > a.series.at(-1).employed, 'exempting backfills should keep more people employed');
});

test('voluntary attrition matches the half-lives (4 y large, 2 y startup)', () => {
  const sim = make({ companies: 200, years: 2 });
  let leftL = 0, baseL = 0, leftS = 0, baseS = 0;
  while (!sim.done) {
    const before = sim.companies.map((c) => c.members.length);
    sim.step();
    sim.companies.forEach((c, i) => {
      if (c.kind === 'large') { leftL += c.qc.leavers; baseL += before[i]; } else { leftS += c.qc.leavers; baseS += before[i]; }
    });
  }
  near(leftL / baseL, 1 - Math.pow(0.5, 1 / 16), 0.002, 'large quarterly attrition');
  near(leftS / baseS, 1 - Math.pow(0.5, 1 / 8), 0.01, 'startup quarterly attrition');
});

test('Q1 layoffs: 5% at large companies, 20% at startups; laid-off ask 20% less', () => {
  const sim = make({ companies: 200, years: 2 });
  for (let i = 0; i < 4; i++) sim.step();
  const before = sim.companies.map((c) => c.members.length);
  const evStart = sim.events.n;
  sim.step(); // Q1 of year 2
  sim.companies.forEach((c, i) => {
    const rate = c.kind === 'large' ? 0.05 : 0.2;
    // Layoffs come after this quarter's retirements and voluntary exits.
    const expected = (before[i] - c.qc.leavers - c.qc.retired) * rate;
    assert(c.qc.layoffs === Math.floor(expected) || c.qc.layoffs === Math.ceil(expected), `${c.name} laid off ${c.qc.layoffs} vs ${expected}`);
  });
  const E = sim.events, A = sim.agents;
  let checked = 0;
  for (let e = evStart; e < E.n; e++) {
    if (E.type[e] !== W.EV.LAYOFF) continue;
    const a = E.agent[e];
    if (A.status[a] !== S.LAID_OFF) continue; // already re-hired or retired
    const expectAsk = Math.max(sim.gradComp * 0.85, E.value[e] * 0.8 * 0.98); // one quarter of ask decay
    near(A.expect[a], expectAsk, 1, `agent ${a} ask`);
    checked++;
  }
  assert(checked > 1000, 'too few laid-off agents checked');
});

test('raises: incumbents +10% a year, their position band +2%', () => {
  const sim = make({ promoteSharePct: 0 });
  for (let i = 0; i < 4; i++) sim.step();
  const A = sim.agents, snap = new Map();
  for (let a = 0; a < A.n; a++) if (A.status[a] === S.EMPLOYED) snap.set(a, [A.company[a], A.comp[a], A.band[a]]);
  sim.step();
  let n = 0;
  snap.forEach((v, a) => {
    if (A.status[a] !== S.EMPLOYED || A.company[a] !== v[0] || A.joinedQ[a] >= 4) return;
    near(A.comp[a] / v[1], 1.10, 1e-4, 'raise');
    near(A.band[a] / v[2], 1.02, 1e-4, 'band growth');
    n++;
  });
  assert(n > 10000, 'too few stayers checked');
});

test('new grads: 3% of the labour force each Q3; retirements ≈ 2% a year', () => {
  const sim = make({ companies: 200, years: 2 });
  let retired = 0;
  for (let i = 0; i < 8; i++) {
    const lf = sim.employedCount() + sim.pool.length;
    const s = sim.step();
    retired += s.retired;
    // Grads arrive after this quarter's retirements have left the labour force.
    if (i % 4 === 2) near(s.grads, (lf - s.retired) * 0.03, 1, 'grad intake');
    else assert.strictEqual(s.grads, 0, 'grads outside Q3');
  }
  const lf = sim.series.at(-1).laborForce;
  near(retired / 2 / lf, 0.02, 0.002, 'annual retirement rate');
});

test('offers never exceed the band, and hiring costs 5% of comp', () => {
  const sim = make({});
  const A = sim.agents;
  for (let i = 0; i < 6; i++) {
    const s = sim.step();
    let spend = 0;
    for (let a = 0; a < A.n; a++) {
      if (A.status[a] === S.EMPLOYED && A.joinedQ[a] === sim.q - 1) {
        assert(A.comp[a] <= A.band[a] + 1e-3 || A.level[a] > 0, `agent ${a} paid above band`);
      }
    }
    sim.companies.forEach((c) => { spend += c.qc.hireSpend; });
    near(s.hireSpend, spend, 1e-3, 'spend total');
    if (s.hires) near(s.hireSpend / (s.avgHireComp * s.hires), 0.05, 1e-6, 'hiring cost share');
  }
});

test('commute: new hires live closer to work than the starting workforce', () => {
  const sim = make({ companies: 200, years: 2 }).runToEnd();
  const start = sim.series[0].avgCommute;
  sim.series.slice(1).forEach((s) => assert(s.hireCommute < start - 3, `${s.label}: hires commute ${s.hireCommute} vs ${start}`));
});

test('people leave the Bay Area only when that option is on', () => {
  assert.strictEqual(make({}).runToEnd().series.at(-1).exitedTotal, 0);
  assert(make({ exitAfterQuarters: 4 }).runToEnd().series.at(-1).exitedTotal > 0);
});

test('same seed reproduces the run; another seed differs', () => {
  const a = make({}).runToEnd(), b = make({}).runToEnd(), c = make({ seed: 7 }).runToEnd();
  assert.deepStrictEqual(a.series.map((s) => s.employed), b.series.map((s) => s.employed));
  assert.notDeepStrictEqual(a.series.map((s) => s.employed), c.series.map((s) => s.employed));
});

test('an agent history reads back in order', () => {
  const sim = make({}).runToEnd();
  const E = sim.events;
  const a = E.agent[Math.floor(E.n / 2)];
  const h = sim.history(a);
  assert(h.length >= 1);
  for (let i = 1; i < h.length; i++) assert(h[i].q >= h[i - 1].q, 'history out of order');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
