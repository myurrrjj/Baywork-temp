/*
 * The company universe: 500 Bay Area–headquartered companies.
 *
 *  - 100 named companies. Engineer counts are rough, rounded estimates of
 *    each company's Bay Area engineering workforce, made for this model; they
 *    are not sourced figures. HQ is placed at the city level.
 *  - 150 synthetic growth-stage companies (30–140 engineers).
 *  - 250 synthetic startups (4–22 engineers, so ≤ 25 people with managers).
 *
 * Synthetic names are invented from word lists and marked synthetic: true.
 * The universe is fixed (its own seed), independent of the simulation seed.
 *
 * payTier sets a company's pay bands: A top of market, B market, C below
 * market (G growth-stage, S startup cash comp).
 */
(function (root) {
  'use strict';

  // [name, HQ city, Bay Area engineers (estimate), sector, payTier]
  var MAJORS = [
    ['Google', 'Mountain View', 32000, 'Internet', 'A'],
    ['Apple', 'Cupertino', 24000, 'Hardware', 'A'],
    ['Meta', 'Menlo Park', 15000, 'Internet', 'A'],
    ['NVIDIA', 'Santa Clara', 10500, 'Semiconductors', 'A'],
    ['Cisco', 'San Jose', 8000, 'Networking', 'B'],
    ['Salesforce', 'San Francisco', 7000, 'Enterprise software', 'B'],
    ['Intel', 'Santa Clara', 6000, 'Semiconductors', 'C'],
    ['LinkedIn', 'Sunnyvale', 5000, 'Internet', 'A'],
    ['Broadcom', 'Palo Alto', 4500, 'Semiconductors', 'B'],
    ['Adobe', 'San Jose', 4500, 'Enterprise software', 'B'],
    ['AMD', 'Santa Clara', 4000, 'Semiconductors', 'B'],
    ['Applied Materials', 'Santa Clara', 4000, 'Semiconductor equipment', 'C'],
    ['Synopsys', 'Sunnyvale', 4000, 'Chip design software', 'B'],
    ['Uber', 'San Francisco', 4000, 'Mobility', 'A'],
    ['Intuit', 'Mountain View', 3500, 'Fintech', 'B'],
    ['Cadence', 'San Jose', 3000, 'Chip design software', 'B'],
    ['ServiceNow', 'Santa Clara', 3000, 'Enterprise software', 'B'],
    ['Workday', 'Pleasanton', 3000, 'Enterprise software', 'B'],
    ['Lam Research', 'Fremont', 3000, 'Semiconductor equipment', 'C'],
    ['PayPal', 'San Jose', 3000, 'Fintech', 'B'],
    ['Palo Alto Networks', 'Santa Clara', 3000, 'Security', 'B'],
    ['Visa', 'San Francisco', 2500, 'Fintech', 'B'],
    ['Netflix', 'Los Gatos', 2500, 'Internet', 'A'],
    ['KLA', 'Milpitas', 2500, 'Semiconductor equipment', 'C'],
    ['Stripe', 'South San Francisco', 2500, 'Fintech', 'A'],
    ['Juniper Networks', 'Sunnyvale', 2200, 'Networking', 'B'],
    ['Databricks', 'San Francisco', 2200, 'Data & AI', 'A'],
    ['Waymo', 'Mountain View', 2000, 'Autonomous vehicles', 'A'],
    ['Airbnb', 'San Francisco', 2000, 'Internet', 'A'],
    ['DoorDash', 'San Francisco', 2000, 'Internet', 'A'],
    ['Block', 'Oakland', 2000, 'Fintech', 'B'],
    ['eBay', 'San Jose', 2000, 'Internet', 'B'],
    ['Western Digital', 'San Jose', 2000, 'Storage', 'C'],
    ['NetApp', 'San Jose', 1800, 'Storage', 'B'],
    ['Arista Networks', 'Santa Clara', 1800, 'Networking', 'A'],
    ['OpenAI', 'San Francisco', 1800, 'AI', 'A'],
    ['Kaiser Permanente', 'Oakland', 1500, 'Healthcare', 'C'],
    ['Wells Fargo', 'San Francisco', 1500, 'Banking', 'C'],
    ['Fortinet', 'Sunnyvale', 1500, 'Security', 'B'],
    ['Snowflake', 'San Mateo', 1500, 'Data & AI', 'A'],
    ['Roblox', 'San Mateo', 1500, 'Gaming', 'A'],
    ['Electronic Arts', 'Redwood City', 1500, 'Gaming', 'B'],
    ['Pinterest', 'San Francisco', 1400, 'Internet', 'A'],
    ['Intuitive Surgical', 'Sunnyvale', 1400, 'Medical devices', 'B'],
    ['HP Inc.', 'Palo Alto', 1400, 'Hardware', 'C'],
    ['Lucid Motors', 'Newark', 1400, 'Automotive', 'B'],
    ['Zoox', 'Foster City', 1400, 'Autonomous vehicles', 'A'],
    ['Super Micro Computer', 'San Jose', 1400, 'Hardware', 'C'],
    ['Marvell', 'Santa Clara', 1400, 'Semiconductors', 'B'],
    ['Anthropic', 'San Francisco', 1200, 'AI', 'A'],
    ['Instacart', 'San Francisco', 1200, 'Internet', 'A'],
    ['Lyft', 'San Francisco', 1100, 'Mobility', 'A'],
    ['Autodesk', 'San Francisco', 1100, 'Design software', 'B'],
    ['Nutanix', 'San Jose', 1100, 'Cloud infrastructure', 'B'],
    ['Pure Storage', 'Santa Clara', 1100, 'Storage', 'B'],
    ['Splunk', 'San Francisco', 1000, 'Data & AI', 'B'],
    ['Genentech', 'South San Francisco', 900, 'Biotech', 'B'],
    ['Okta', 'San Francisco', 900, 'Security', 'B'],
    ['Zscaler', 'San Jose', 900, 'Security', 'B'],
    ['Informatica', 'Redwood City', 900, 'Data & AI', 'B'],
    ['Dropbox', 'San Francisco', 850, 'Internet', 'A'],
    ['Twilio', 'San Francisco', 800, 'Communications', 'B'],
    ['Zoom', 'San Jose', 800, 'Communications', 'B'],
    ['Reddit', 'San Francisco', 800, 'Internet', 'A'],
    ['Unity', 'San Francisco', 750, 'Gaming', 'B'],
    ['Equinix', 'Redwood City', 750, 'Cloud infrastructure', 'C'],
    ['Confluent', 'Mountain View', 750, 'Data & AI', 'A'],
    ['Guidewire', 'San Mateo', 700, 'Enterprise software', 'B'],
    ['Samsara', 'San Francisco', 700, 'IoT', 'A'],
    ['Robinhood', 'Menlo Park', 700, 'Fintech', 'A'],
    ['DocuSign', 'San Francisco', 700, 'Enterprise software', 'B'],
    ['Figma', 'San Francisco', 650, 'Design software', 'A'],
    ['Rippling', 'San Francisco', 650, 'Enterprise software', 'A'],
    ['Rubrik', 'Palo Alto', 650, 'Security', 'B'],
    ['Affirm', 'San Francisco', 600, 'Fintech', 'A'],
    ['Box', 'Redwood City', 600, 'Enterprise software', 'B'],
    ['Cohesity', 'San Jose', 600, 'Storage', 'B'],
    ['Veeva Systems', 'Pleasanton', 600, 'Life-sciences software', 'B'],
    ['Applied Intuition', 'Mountain View', 600, 'Autonomous vehicles', 'A'],
    ['Nuro', 'Mountain View', 550, 'Autonomous vehicles', 'A'],
    ['Gap Inc.', 'San Francisco', 500, 'Retail', 'C'],
    ['Gusto', 'San Francisco', 500, 'Enterprise software', 'B'],
    ['Plaid', 'San Francisco', 500, 'Fintech', 'A'],
    ['Chime', 'San Francisco', 500, 'Fintech', 'A'],
    ['Asana', 'San Francisco', 450, 'Enterprise software', 'B'],
    ['Zendesk', 'San Francisco', 450, 'Enterprise software', 'B'],
    ['Yelp', 'San Francisco', 450, 'Internet', 'B'],
    ['Scale AI', 'San Francisco', 450, 'AI', 'A'],
    ['Discord', 'San Francisco', 400, 'Internet', 'A'],
    ['PG&E', 'Oakland', 400, 'Utilities', 'C'],
    ['Enphase Energy', 'Fremont', 400, 'Energy', 'C'],
    ['GoPro', 'San Mateo', 350, 'Hardware', 'C'],
    ['Safeway', 'Pleasanton', 350, 'Retail', 'C'],
    ['Fivetran', 'Oakland', 350, 'Data & AI', 'A'],
    ['Cerebras Systems', 'Sunnyvale', 350, 'Semiconductors', 'A'],
    ['Ross Stores', 'Dublin', 300, 'Retail', 'C'],
    ['Glean', 'Palo Alto', 300, 'AI', 'A'],
    ['Notion', 'San Francisco', 300, 'Enterprise software', 'A'],
    ['10x Genomics', 'Pleasanton', 250, 'Biotech', 'B'],
    ['Grammarly', 'San Francisco', 250, 'AI', 'B'],
  ];

  // Where new companies cluster.
  var HUBS = [
    ['San Francisco', 34], ['Palo Alto', 9], ['San Jose', 7], ['Mountain View', 6], ['Sunnyvale', 5],
    ['Santa Clara', 5], ['San Mateo', 5], ['Redwood City', 5], ['Menlo Park', 5], ['Oakland', 5],
    ['Berkeley', 3], ['South San Francisco', 3], ['Emeryville', 2], ['Fremont', 2], ['Burlingame', 1],
    ['Los Altos', 1], ['Cupertino', 1], ['Pleasanton', 1],
  ];
  var SECTORS = ['AI', 'Developer tools', 'Fintech', 'Security', 'Robotics', 'Climate', 'Health', 'Data & AI',
    'Enterprise software', 'Consumer', 'Biotech', 'Semiconductors', 'Gaming', 'IoT'];
  var WORD_A = ['Arbor', 'Basalt', 'Bramble', 'Cairn', 'Cinder', 'Corvid', 'Dovetail', 'Driftwood', 'Eddy',
    'Fennel', 'Fieldstone', 'Gossamer', 'Halyard', 'Heron', 'Inlet', 'Jasper', 'Kiln', 'Larkspur', 'Loam',
    'Marram', 'Nimbus', 'Oakum', 'Orchard', 'Petrel', 'Quillon', 'Rookery', 'Saltmarsh', 'Sorrel',
    'Tamarack', 'Thistle', 'Umber', 'Vellum', 'Wren', 'Yarrow', 'Zephyrine', 'Alder', 'Bluff', 'Chert',
    'Delft', 'Estuary', 'Flint', 'Grove', 'Hollow', 'Isobar', 'Juniperus', 'Kelp', 'Lodestar', 'Mesa',
    'Nettle', 'Ochre', 'Pinnacle', 'Quarry', 'Redtail', 'Sedge', 'Tidepool', 'Upland', 'Verdant', 'Willet'];
  var WORD_B = ['Labs', 'AI', 'Systems', 'Robotics', 'Bio', 'Data', 'Cloud', 'Health', 'Works', 'Security',
    'Analytics', 'Devices', 'Logic', 'Networks', 'Energy', 'Software', 'Dynamics', 'Machines', 'Compute',
    'Finance', 'Materials', 'Mobility', 'Signal', 'Fabric'];

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

  function build() {
    var rng = mulberry32(2026);
    var hubTotal = HUBS.reduce(function (s, h) { return s + h[1]; }, 0);
    function hub() {
      var r = rng() * hubTotal;
      for (var i = 0; i < HUBS.length; i++) { r -= HUBS[i][1]; if (r <= 0) return HUBS[i][0]; }
      return HUBS[0][0];
    }
    var used = {};
    MAJORS.forEach(function (m) { used[m[0]] = true; });
    function name() {
      for (;;) {
        var n = WORD_A[Math.floor(rng() * WORD_A.length)] + ' ' + WORD_B[Math.floor(rng() * WORD_B.length)];
        if (!used[n]) { used[n] = true; return n; }
      }
    }

    var list = MAJORS.map(function (m) {
      return { name: m[0], city: m[1], engineers: m[2], sector: m[3], payTier: m[4], kind: 'major', synthetic: false };
    });
    var i;
    for (i = 0; i < 150; i++) {
      // Log-uniform 30–140 engineers.
      var e = Math.round(30 * Math.pow(140 / 30, rng()));
      list.push({ name: name(), city: hub(), engineers: e, sector: SECTORS[Math.floor(rng() * SECTORS.length)],
        payTier: 'G', kind: 'growth', synthetic: true });
    }
    for (i = 0; i < 250; i++) {
      list.push({ name: name(), city: hub(), engineers: 4 + Math.floor(rng() * 19), sector: SECTORS[Math.floor(rng() * SECTORS.length)],
        payTier: 'S', kind: 'startup', synthetic: true });
    }
    // Rank by engineers; startups keep their (random) order at the tail.
    var ranked = list.filter(function (c) { return c.kind !== 'startup'; })
      .sort(function (a, b) { return b.engineers - a.engineers; })
      .concat(list.filter(function (c) { return c.kind === 'startup'; }));
    ranked.forEach(function (c, idx) { c.id = idx; c.rank = idx + 1; });
    return ranked;
  }

  var COMPANIES = build();
  if (typeof module !== 'undefined' && module.exports) module.exports = COMPANIES;
  else root.BAY_COMPANIES = COMPANIES;
})(this);
