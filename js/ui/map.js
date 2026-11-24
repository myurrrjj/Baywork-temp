/* BayWork map — SVG Bay Area with HQs, residents, hiring flows and commute sheds. */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var fmt = root.BWCharts.fmt, esc = root.BWCharts.esc;

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function hexRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mix(a, b, t) {
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }).join(',') + ')';
  }

  // Marker radius in screen pixels.
  function hqRadius(hc) { return 2.5 + Math.sqrt(Math.max(0, hc)) / 7.5; }
  function cityRadius(n) { return 2.5 + Math.sqrt(Math.max(0, n)) / 9; }

  function MapView(svg, opts) {
    this.svg = svg;
    this.geo = opts.geo;
    this.cities = opts.cities;
    this.on = opts.on || {};
    var B = this.geo.BOUNDS;
    this.cosLat = Math.cos((B.north + B.south) / 2 * Math.PI / 180);
    this.unit = 1000 / (B.north - B.south);
    this.H = 1000;
    this.W = (B.east - B.west) * this.cosLat * this.unit;
    svg.setAttribute('viewBox', '0 0 ' + this.W.toFixed(1) + ' ' + this.H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.view = { k: 1, x: 0, y: 0 };
    this.layers = { hqs: true, startups: true, residents: true, flows: true };
    this.selected = null;
    this.readTheme();
    this.buildBase();
    this.bindZoom();
  }

  var M = MapView.prototype;

  M.project = function (lat, lon) {
    var B = this.geo.BOUNDS;
    return [(lon - B.west) * this.cosLat * this.unit, (B.north - lat) * this.unit];
  };
  M.cityXY = function (i) { var c = this.cities[i]; return this.project(c.lat, c.lon); };

  // Screen pixels per map unit at zoom 1.
  M.pxPerUnit = function () {
    var r = this.svg.getBoundingClientRect();
    if (!r.width || !r.height) return 0.75;
    return Math.min(r.width / this.W, r.height / this.H);
  };
  M.u = function (px) { return px / (this.pxPerUnit() * this.view.k); };
  // Markers shrink on small maps so a phone isn't covered by a few big HQs.
  M.sizeScale = function () {
    var r = this.svg.getBoundingClientRect();
    var side = Math.min(r.width || 760, r.height || 760);
    return Math.max(0.5, Math.min(1, side / 700));
  };

  M.readTheme = function () {
    this.colors = {
      neg: hexRgb(cssVar('--div-neg')), mid: hexRgb(cssVar('--div-mid')), pos: hexRgb(cssVar('--div-pos')),
      seq0: hexRgb(cssVar('--seq-0')), seq1: hexRgb(cssVar('--seq-1')),
      aqua: cssVar('--s-aqua'),
    };
  };

  M.changeColor = function (d) {
    var t = Math.max(-1, Math.min(1, d / 0.25));
    return t < 0 ? mix(this.colors.mid, this.colors.neg, -t) : mix(this.colors.mid, this.colors.pos, t);
  };
  M.unemploymentColor = function (u) {
    return mix(this.colors.seq0, this.colors.seq1, Math.max(0, Math.min(1, u / 0.25)));
  };

  // ---------------------------------------------------------------- base map

  M.buildBase = function () {
    var self = this, svg = this.svg;
    svg.innerHTML = '';
    this.vp = el('g', {}, svg);
    el('rect', { class: 'land', x: -2000, y: -2000, width: this.W + 4000, height: this.H + 4000 }, this.vp);
    var pts = function (ring) { return ring.map(function (p) { return self.project(p[0], p[1]).map(function (v) { return v.toFixed(1); }).join(','); }).join(' '); };
    el('polygon', { class: 'water', points: pts(this.geo.WATER) }, this.vp);
    // Extend the ocean past the west edge so panning never shows land there.
    el('rect', { class: 'water', x: -2000, y: -2000, width: 2000, height: this.H + 4000, style: 'stroke:none' }, this.vp);
    this.geo.ISLANDS.forEach(function (ring) { el('polygon', { class: 'island', points: pts(ring) }, self.vp); });
    this.geo.HIGHWAYS.forEach(function (h) { el('polyline', { class: 'road', points: pts(h.pts) }, self.vp); });
    this.geo.BRIDGES.forEach(function (b) { el('polyline', { class: 'bridge', points: pts(b) }, self.vp); });
    this.waterLabels = this.geo.LABELS.map(function (l) {
      var p = self.project(l.lat, l.lon);
      var t = el('text', { class: 'water-label', x: p[0], y: p[1], 'text-anchor': 'middle' }, self.vp);
      t.textContent = l.text;
      t._size = l.size;
      return t;
    });
    this.gCities = el('g', {}, this.vp);
    this.gShed = el('g', {}, this.vp);
    this.gFlows = el('g', {}, this.vp);
    this.gStartups = el('g', {}, this.vp);
    this.gHq = el('g', {}, this.vp);
    this.gLabels = el('g', {}, this.vp);

    this.cityDots = this.cities.map(function (c, i) {
      var p = self.cityXY(i);
      var dot = el('circle', { class: 'city-dot', cx: p[0], cy: p[1], r: 4 }, self.gCities);
      dot.addEventListener('click', function (e) { if (!self.dragMoved) self.on.city && self.on.city(i, e); });
      dot.addEventListener('mousemove', function (e) { self.on.cityHover && self.on.cityHover(i, e); });
      dot.addEventListener('mouseleave', function () { self.on.leave && self.on.leave(); });
      return dot;
    });
    this.cityLabels = this.cities.map(function (c, i) {
      var p = self.cityXY(i);
      var t = el('text', { class: 'city-label', x: p[0], y: p[1], 'text-anchor': 'middle' }, self.gLabels);
      t.textContent = c.name;
      return t;
    });
  };

  // ---------------------------------------------------------------- companies

  M.setSim = function (sim) {
    var self = this;
    this.sim = sim;
    this.selected = null;
    this.gHq.innerHTML = '';
    this.gStartups.innerHTML = '';
    this.gShed.innerHTML = '';
    this.gFlows.innerHTML = '';
    var s0 = this.pxPerUnit() / this.sizeScale();
    var rng = mulberry(17);

    // Large companies: start at their HQ city and push apart until no two overlap.
    var nodes = sim.companies.filter(function (c) { return c.kind === 'large'; }).map(function (c) {
      var p = self.cityXY(c.city);
      return { c: c, x: p[0] + (rng() - 0.5) * 6, y: p[1] + (rng() - 0.5) * 6, ax: p[0], ay: p[1], r: hqRadius(c.startHc) / s0 };
    });
    var pad = 1.2 / s0;
    for (var it = 0; it < 260; it++) {
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, min = a.r + b.r + pad;
          if (d < min) {
            var push = (min - d) / 2, ux = dx / d, uy = dy / d;
            var wa = b.r / (a.r + b.r), wb = a.r / (a.r + b.r);
            a.x -= ux * push * wa * 2; a.y -= uy * push * wa * 2;
            b.x += ux * push * wb * 2; b.y += uy * push * wb * 2;
          }
        }
      }
      nodes.forEach(function (n) { n.x += (n.ax - n.x) * 0.03; n.y += (n.ay - n.y) * 0.03; });
    }
    // Biggest drawn first so small markers sit on top.
    nodes.sort(function (x, y) { return y.r - x.r; });
    this.hqNodes = nodes.map(function (n) {
      var circle = el('circle', { class: 'hq', cx: n.x.toFixed(2), cy: n.y.toFixed(2), r: n.r }, self.gHq);
      self.bindCompany(circle, n.c);
      n.el = circle;
      n.c._xy = [n.x, n.y];
      return n;
    });
    this.hqLabels = nodes.filter(function (n) { return n.c.startHc >= 2400; }).map(function (n) {
      var t = el('text', { class: 'hq-label', x: n.x, y: n.y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, self.gLabels);
      t.textContent = n.c.name;
      return { node: n, el: t };
    });

    // Startups: small dots scattered around their HQ city.
    this.startupNodes = sim.companies.filter(function (c) { return c.kind === 'startup'; }).map(function (c) {
      var p = self.cityXY(c.city);
      var ang = rng() * Math.PI * 2, rad = 6 + rng() * 22;
      var x = p[0] + Math.cos(ang) * rad, y = p[1] + Math.sin(ang) * rad;
      var dot = el('circle', { class: 'startup', cx: x.toFixed(2), cy: y.toFixed(2), r: 2, fill: self.colors.aqua }, self.gStartups);
      self.bindCompany(dot, c);
      c._xy = [x, y];
      return { c: c, el: dot };
    });
    this.applyZoom();
  };

  M.bindCompany = function (node, c) {
    var self = this;
    node.addEventListener('click', function (e) { if (!self.dragMoved) self.on.company && self.on.company(c, e); });
    node.addEventListener('mousemove', function (e) { self.on.companyHover && self.on.companyHover(c, e); });
    node.addEventListener('mouseleave', function () { self.on.leave && self.on.leave(); });
  };

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- per-quarter update

  M.update = function (cityRows) {
    var self = this, sim = this.sim;
    if (!sim) return;
    this.cityRows = cityRows;
    this.hqNodes.forEach(function (n) {
      var c = n.c, hc = c.members.length;
      n.el.setAttribute('fill', self.changeColor(c.startHc ? hc / c.startHc - 1 : 0));
      n.px = hqRadius(hc);
    });
    this.startupNodes.forEach(function (n) {
      n.el.setAttribute('opacity', n.c.members.length ? 0.9 : 0.25);
    });
    if (cityRows) {
      cityRows.forEach(function (r, i) {
        self.cityDots[i].setAttribute('fill', self.unemploymentColor(r.unemployment));
        self.cityDots[i]._px = cityRadius(r.laborForce);
      });
    }
    this.drawFlows();
    if (this.selected) this.drawShed(this.selected);
    this.applyZoom();
  };

  M.drawFlows = function () {
    var self = this, sim = this.sim;
    this.gFlows.innerHTML = '';
    if (!this.layers.flows || !sim || sim.series.length < 2) return;
    var s = sim.series[sim.series.length - 1];
    var pairs = s.pairs.filter(function (p) { return p[0] !== p[1]; }).slice(0, 90);
    var maxN = pairs.length ? pairs[0][2] : 1;
    pairs.forEach(function (p) {
      var a = self.cityXY(p[0]), b = self.cityXY(p[1]);
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var cx = mx - dy * 0.18, cy = my + dx * 0.18;
      el('path', {
        class: 'flow', d: 'M' + a[0].toFixed(1) + ',' + a[1].toFixed(1) + 'Q' + cx.toFixed(1) + ',' + cy.toFixed(1) + ' ' + b[0].toFixed(1) + ',' + b[1].toFixed(1),
        'stroke-width': (0.6 + 3.2 * Math.sqrt(p[2] / maxN)).toFixed(2), 'stroke-opacity': (0.25 + 0.5 * p[2] / maxN).toFixed(2),
      }, self.gFlows);
    });
  };

  // Where one company's people live: a line from each home city to the HQ.
  M.drawShed = function (c) {
    var self = this;
    this.gShed.innerHTML = '';
    if (!c || !this.sim) return;
    var counts = this.sim.companyResidents(c);
    var max = Math.max.apply(null, counts.concat([1]));
    var hq = c._xy || this.cityXY(c.city);
    counts.forEach(function (n, i) {
      if (!n) return;
      var p = self.cityXY(i);
      el('line', { class: 'shed', x1: p[0], y1: p[1], x2: hq[0], y2: hq[1],
        'stroke-width': (0.5 + 5 * Math.sqrt(n / max)).toFixed(2), 'stroke-opacity': (0.25 + 0.6 * n / max).toFixed(2) }, self.gShed);
    });
  };

  M.select = function (c) {
    this.selected = c;
    var self = this;
    this.hqNodes && this.hqNodes.forEach(function (n) {
      n.el.classList.toggle('sel', n.c === c);
      n.el.classList.toggle('dim', !!c && n.c !== c);
    });
    if (c) this.drawShed(c); else this.gShed.innerHTML = '';
    void self;
  };

  M.setLayer = function (name, on) {
    this.layers[name] = on;
    this.gHq.style.display = this.layers.hqs ? '' : 'none';
    this.gStartups.style.display = this.layers.startups ? '' : 'none';
    this.gCities.style.display = this.layers.residents ? '' : 'none';
    this.drawFlows();
    this.applyZoom();
  };

  // ---------------------------------------------------------------- zoom & pan

  M.applyZoom = function () {
    var v = this.view, self = this;
    this.vp.setAttribute('transform', 'translate(' + v.x.toFixed(2) + ',' + v.y.toFixed(2) + ') scale(' + v.k.toFixed(4) + ')');
    var u = this.u(1), ms = this.sizeScale();
    (this.hqNodes || []).forEach(function (n) { n.el.setAttribute('r', ((n.px || hqRadius(n.c.startHc)) * ms * u).toFixed(3)); });
    (this.startupNodes || []).forEach(function (n) { n.el.setAttribute('r', (2.2 * u).toFixed(3)); });
    this.cityDots.forEach(function (d, i) {
      var px = self.layers.residents ? (d._px || cityRadius(self.cities[i].pop / 20)) * ms : 0;
      d.setAttribute('r', (px * u).toFixed(3));
    });
    var showAll = v.k >= 1.8;
    this.cityLabels.forEach(function (t, i) {
      var c = self.cities[i];
      var show = showAll || c.pop >= 100000;
      t.style.display = show ? '' : 'none';
      t.setAttribute('font-size', (10.5 * u).toFixed(3));
      var r = self.cityDots[i]._px || 4;
      t.setAttribute('y', (self.cityXY(i)[1] + (r + 11) * u).toFixed(2));
    });
    (this.hqLabels || []).forEach(function (l) {
      var big = (l.node.px || hqRadius(l.node.c.startHc)) * ms >= 14;
      l.el.style.display = self.layers.hqs && (big || v.k >= 2.2) ? '' : 'none';
      l.el.setAttribute('font-size', (10.5 * u).toFixed(3));
    });
    this.waterLabels.forEach(function (t) { t.setAttribute('font-size', (t._size * u).toFixed(3)); });
  };

  M.toSvg = function (clientX, clientY) {
    var pt = this.svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(this.svg.getScreenCTM().inverse());
  };

  M.zoomAt = function (factor, sx, sy) {
    var v = this.view;
    var k = Math.max(1, Math.min(10, v.k * factor));
    // Keep the point under the cursor fixed.
    v.x = sx - (sx - v.x) * (k / v.k);
    v.y = sy - (sy - v.y) * (k / v.k);
    v.k = k;
    this.clampView();
    this.applyZoom();
  };

  M.clampView = function () {
    var v = this.view;
    var minX = this.W - this.W * v.k, minY = this.H - this.H * v.k;
    v.x = Math.min(0, Math.max(minX, v.x));
    v.y = Math.min(0, Math.max(minY, v.y));
    if (v.k === 1) { v.x = 0; v.y = 0; }
  };

  M.zoomButton = function (factor) { this.zoomAt(factor, this.W / 2, this.H / 2); };
  M.resetView = function () { this.view = { k: 1, x: 0, y: 0 }; this.applyZoom(); };

  M.focusOn = function (c, k) {
    var xy = c._xy || this.cityXY(c.city);
    var v = this.view;
    v.k = k || 3;
    v.x = this.W / 2 - xy[0] * v.k;
    v.y = this.H / 2 - xy[1] * v.k;
    this.clampView();
    this.applyZoom();
  };

  M.bindZoom = function () {
    var self = this, svg = this.svg, drag = null;
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = self.toSvg(e.clientX, e.clientY);
      self.zoomAt(Math.exp(-e.deltaY * 0.0022), p.x, p.y);
    }, { passive: false });
    svg.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, vx: self.view.x, vy: self.view.y, moved: false };
      self.dragMoved = false;
    });
    window.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      self.dragMoved = true;
      svg.classList.add('dragging');
      var s = self.pxPerUnit();
      self.view.x = drag.vx + dx / s;
      self.view.y = drag.vy + dy / s;
      self.clampView();
      self.applyZoom();
    });
    window.addEventListener('pointerup', function () {
      if (!drag) return;
      svg.classList.remove('dragging');
      drag = null;
      setTimeout(function () { self.dragMoved = false; }, 0);
    });
  };

  M.setTheme = function () {
    this.readTheme();
    var self = this;
    (this.startupNodes || []).forEach(function (n) { n.el.setAttribute('fill', self.colors.aqua); });
    this.update(this.cityRows);
  };

  M.legendHtml = function () {
    var neg = mix(this.colors.mid, this.colors.neg, 1), pos = mix(this.colors.mid, this.colors.pos, 1), mid = mix(this.colors.mid, this.colors.mid, 0);
    var s0 = mix(this.colors.seq0, this.colors.seq0, 0), s1 = mix(this.colors.seq1, this.colors.seq1, 0);
    return '<h4>Company HQ</h4>'
      + '<div class="row"><svg width="64" height="30" aria-hidden="true"><circle cx="8" cy="20" r="4" fill="' + mid + '"/><circle cx="24" cy="17" r="7" fill="' + mid + '"/><circle cx="48" cy="13" r="12" fill="' + mid + '"/></svg><span>size = engineers</span></div>'
      + '<div class="row"><div class="ramp" style="background:linear-gradient(90deg,' + neg + ',' + mid + ',' + pos + ')"></div></div>'
      + '<div class="ends"><span>shrank 25%+</span><span>flat</span><span>grew 25%+</span></div>'
      + '<h4 style="margin-top:8px">Where engineers live</h4>'
      + '<div class="row"><div class="ramp" style="background:linear-gradient(90deg,' + s0 + ',' + s1 + ')"></div></div>'
      + '<div class="ends"><span>0% unemployed</span><span>25%+</span></div>'
      + '<div class="row"><svg width="28" height="10" aria-hidden="true"><path d="M2 8 Q14 0 26 8" fill="none" stroke="var(--s-blue)" stroke-width="2" stroke-dasharray="3 3"/></svg><span>this quarter’s hires, home → HQ</span></div>'
      + '<div class="row"><svg width="28" height="10" aria-hidden="true"><circle cx="6" cy="5" r="2.5" fill="var(--s-aqua)"/><circle cx="14" cy="6" r="2.5" fill="var(--s-aqua)"/><circle cx="21" cy="3" r="2.5" fill="var(--s-aqua)"/></svg><span>startups</span></div>';
  };

  root.BWMap = MapView;
})(this);
