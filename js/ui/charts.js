/* BayWork charts — formatting and small SVG charts (line, stacked area, bars). */
(function (root) {
  'use strict';

  var MINUS = '−';
  function ok(v) { return v != null && isFinite(v); }

  var fmt = {
    int: function (v) { return ok(v) ? Math.round(v).toLocaleString('en-US') : '—'; },
    k: function (v) {
      if (!ok(v)) return '—';
      var a = Math.abs(v), s = v < 0 ? MINUS : '';
      if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
      if (a >= 1e4) return s + Math.round(a / 1e3) + 'k';
      if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k';
      return s + Math.round(a);
    },
    money: function (v) {
      if (!ok(v)) return '—';
      var a = Math.abs(v), s = v < 0 ? MINUS : '';
      if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
      if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
      if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'k';
      return s + '$' + Math.round(a);
    },
    pct: function (v, d) { return ok(v) ? (v * 100).toFixed(d == null ? 1 : d) + '%' : '—'; },
    signedPct: function (v, d) {
      if (!ok(v)) return '—';
      var t = Math.abs(v * 100).toFixed(d == null ? 1 : d);
      return (Number(t) === 0 ? '' : v > 0 ? '+' : MINUS) + t + '%';
    },
    signedInt: function (v) {
      if (!ok(v)) return '—';
      var n = Math.round(v);
      return (n > 0 ? '+' : n < 0 ? MINUS : '') + Math.abs(n).toLocaleString('en-US');
    },
    signedK: function (v) {
      if (!ok(v)) return '—';
      return (v > 0.5 ? '+' : v < -0.5 ? MINUS : '') + fmt.k(Math.abs(v));
    },
    miles: function (v) { return ok(v) ? v.toFixed(1) + ' mi' : '—'; },
    years: function (v) { return ok(v) ? v.toFixed(1) + ' y' : '—'; },
    short: function (label) { return label.replace(/^Q(\d) (\d\d)(\d\d)$/, 'Q$1 ’$3'); },
  };

  function tone(v, upIsGood) {
    if (!ok(v) || Math.abs(v) < 1e-9) return 'flat';
    return (v > 0) === upIsGood ? 'good' : 'bad';
  }
  function delta(v, upIsGood, text) {
    return '<span class="delta ' + (upIsGood == null ? 'flat' : tone(v, upIsGood)) + '">' + text + '</span>';
  }
  function attr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function niceStep(span, count) {
    var raw = span / Math.max(1, count);
    var mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  function ticks(lo, hi, count) {
    if (hi - lo < 1e-9) hi = lo + 1;
    var step = niceStep(hi - lo, count);
    var out = [];
    for (var v = Math.floor(lo / step) * step; v <= hi + step * 0.999; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function legend(series) {
    return '<div class="legend-row">' + series.map(function (s) {
      return '<span><i class="key' + (s.kind === 'line' ? ' line' : '') + '" style="background:' + s.color + '"></i>' + esc(s.name) + '</span>';
    }).join('') + '</div>';
  }

  function xLabels(labels, x, H, m) {
    var n = labels.length, out = '';
    var want = Math.min(n, 5);
    for (var k = 0; k < want; k++) {
      var i = want === 1 ? 0 : Math.round(k * (n - 1) / (want - 1));
      var anchor = k === 0 ? 'start' : k === want - 1 ? 'end' : 'middle';
      out += '<text class="tick" x="' + x(i) + '" y="' + (H - m.b + 15) + '" text-anchor="' + anchor + '">' + esc(fmt.short(labels[i])) + '</text>';
    }
    return out;
  }

  function hoverColumns(labels, series, x, m, ih, yFormat, extra) {
    var n = labels.length, out = '';
    for (var i = 0; i < n; i++) {
      var half = n > 1 ? (x(1) - x(0)) / 2 : 20;
      var tip = '<div class="tt-title">' + esc(labels[i]) + '</div>' + series.map(function (s) {
        var v = s.values[i];
        return '<div class="tt-row"><i class="key' + (s.kind === 'line' ? ' line' : '') + '" style="background:' + s.color + '"></i>' + esc(s.name)
          + '<b>' + (v == null ? '—' : (s.format || yFormat)(v)) + '</b></div>';
      }).join('') + (extra ? extra(i) : '');
      out += '<g class="col"><line class="cross" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '"/>'
        + '<rect class="hit-band" x="' + (x(i) - half) + '" y="' + m.t + '" width="' + (half * 2) + '" height="' + ih + '" data-tip="' + attr(tip) + '"/></g>';
    }
    return out;
  }

  // Lines, or stacked areas when o.stacked. o.series: [{ name, color, values, kind }]
  function lineChart(o) {
    var W = o.width || 360, H = o.height || 150, m = { l: 42, r: 8, t: 8, b: 22 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var n = o.labels.length;
    var yFormat = o.yFormat || fmt.k;
    var stacks = [];
    var lo = Infinity, hi = -Infinity;
    if (o.stacked) {
      var acc = new Array(n).fill(0);
      o.series.forEach(function (s) {
        var base = acc.slice();
        acc = acc.map(function (v, i) { return v + (s.values[i] || 0); });
        stacks.push({ base: base, top: acc.slice() });
      });
      lo = 0;
      hi = Math.max.apply(null, acc.concat([1]));
    } else {
      o.series.forEach(function (s) {
        s.values.forEach(function (v) { if (ok(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
      });
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      if (o.zero !== false) lo = Math.min(0, lo);
      else { var pad = (hi - lo) * 0.15 || hi * 0.05 || 1; lo -= pad; hi += pad; }
    }
    var yt = ticks(lo, hi, 4), y0 = yt[0], y1 = yt[yt.length - 1];
    function x(i) { return m.l + (n > 1 ? i / (n - 1) : 0.5) * iw; }
    function y(v) { return m.t + ih - (v - y0) / (y1 - y0) * ih; }
    var out = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + attr(o.label || '') + '">';
    yt.forEach(function (v) {
      out += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      out += '<text class="tick" x="' + (m.l - 6) + '" y="' + (y(v) + 3.5) + '" text-anchor="end">' + yFormat(v) + '</text>';
    });
    out += xLabels(o.labels, x, H, m);
    if (o.stacked) {
      o.series.forEach(function (s, k) {
        var st = stacks[k], d = '';
        for (var i = 0; i < n; i++) d += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(st.top[i]).toFixed(1);
        for (var j = n - 1; j >= 0; j--) d += 'L' + x(j).toFixed(1) + ',' + y(st.base[j]).toFixed(1);
        out += '<path class="area" d="' + d + 'Z" style="fill:' + s.color + ';opacity:0.88"/>';
      });
    } else {
      o.series.forEach(function (s) {
        var d = '', started = false;
        s.values.forEach(function (v, i) {
          if (!ok(v)) { started = false; return; }
          d += (started ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1);
          started = true;
        });
        out += '<path class="line" d="' + d + '" style="stroke:' + s.color + (s.dashed ? ';stroke-dasharray:4 3' : '') + '"/>';
        var last = s.values.length - 1;
        if (ok(s.values[last]) && n > 1) out += '<circle class="dot" cx="' + x(last) + '" cy="' + y(s.values[last]) + '" r="3.5" style="fill:' + s.color + '"/>';
      });
    }
    out += '<line class="axis" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + (m.t + ih) + '" y2="' + (m.t + ih) + '"/>';
    out += hoverColumns(o.labels, o.series, x, m, ih, yFormat, o.extraTip);
    return legend(o.series) + out + '</svg>';
  }

  // Stacked bars; series with sign −1 stack downward from zero.
  function barChart(o) {
    var W = o.width || 360, H = o.height || 150, m = { l: 42, r: 8, t: 8, b: 22 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var n = o.labels.length;
    var yFormat = o.yFormat || fmt.k;
    var up = new Array(n).fill(0), down = new Array(n).fill(0);
    o.series.forEach(function (s) {
      s.values.forEach(function (v, i) { if ((s.sign || 1) > 0) up[i] += v || 0; else down[i] += v || 0; });
    });
    var hi = Math.max.apply(null, up.concat([1])), lo = -Math.max.apply(null, down.concat([0]));
    var yt = ticks(lo, hi, 4), y0 = yt[0], y1 = yt[yt.length - 1];
    var band = iw / Math.max(1, n), bw = Math.max(1.5, Math.min(14, band - 2));
    function xc(i) { return m.l + band * (i + 0.5); }
    function y(v) { return m.t + ih - (v - y0) / (y1 - y0) * ih; }
    var out = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + attr(o.label || '') + '">';
    yt.forEach(function (v) {
      out += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      out += '<text class="tick" x="' + (m.l - 6) + '" y="' + (y(v) + 3.5) + '" text-anchor="end">' + yFormat(Math.abs(v)) + '</text>';
    });
    out += xLabels(o.labels, xc, H, m);
    var posAcc = new Array(n).fill(0), negAcc = new Array(n).fill(0);
    o.series.forEach(function (s) {
      var sign = s.sign || 1;
      s.values.forEach(function (v, i) {
        if (!v) return;
        var from = sign > 0 ? posAcc[i] : -negAcc[i];
        var to = sign > 0 ? from + v : from - v;
        if (sign > 0) posAcc[i] += v; else negAcc[i] += v;
        var top = Math.min(y(from), y(to)), h = Math.abs(y(to) - y(from));
        out += '<rect x="' + (xc(i) - bw / 2) + '" y="' + top + '" width="' + bw + '" height="' + Math.max(0.5, h - 0.6) + '" style="fill:' + s.color + '"/>';
      });
    });
    out += '<line class="axis" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    out += hoverColumns(o.labels, o.series, function (i) { return xc(i); }, m, ih, yFormat, o.extraTip);
    return legend(o.series) + out + '</svg>';
  }

  // A tiny trend line for tables and tiles.
  function sparkline(values, color, w, h) {
    w = w || 120; h = h || 28;
    var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    if (hi - lo < 1e-9) { hi = lo + 1; }
    var n = values.length;
    var d = values.map(function (v, i) {
      return (i ? 'L' : 'M') + (n > 1 ? i / (n - 1) * (w - 4) + 2 : w / 2).toFixed(1) + ',' + (h - 3 - (v - lo) / (hi - lo) * (h - 6)).toFixed(1);
    }).join('');
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  root.BWCharts = {
    fmt: fmt, tone: tone, delta: delta, attr: attr, esc: esc, ticks: ticks,
    lineChart: lineChart, barChart: barChart, sparkline: sparkline, legend: legend,
  };
})(this);
