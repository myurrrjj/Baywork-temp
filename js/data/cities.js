/*
 * Bay Area cities that engineers commute from, out to Pleasanton.
 * Coordinates are city centres; population is the 2020 Census count
 * (Castro Valley is a census-designated place). Region is for colour only.
 */
(function (root) {
  'use strict';

  // [name, lat, lon, population, region]
  var ROWS = [
    ['San Francisco', 37.7749, -122.4194, 873965, 'San Francisco'],
    ['Daly City', 37.6879, -122.4702, 104901, 'Peninsula'],
    ['South San Francisco', 37.6547, -122.4077, 66105, 'Peninsula'],
    ['San Bruno', 37.6305, -122.4111, 43908, 'Peninsula'],
    ['Pacifica', 37.6138, -122.4869, 38640, 'Peninsula'],
    ['Millbrae', 37.5985, -122.3872, 23216, 'Peninsula'],
    ['Burlingame', 37.5841, -122.3661, 31386, 'Peninsula'],
    ['San Mateo', 37.5630, -122.3255, 105661, 'Peninsula'],
    ['Foster City', 37.5585, -122.2711, 33805, 'Peninsula'],
    ['Belmont', 37.5202, -122.2758, 28335, 'Peninsula'],
    ['San Carlos', 37.5072, -122.2605, 30722, 'Peninsula'],
    ['Redwood City', 37.4852, -122.2364, 84292, 'Peninsula'],
    ['Half Moon Bay', 37.4636, -122.4286, 11795, 'Peninsula'],
    ['Menlo Park', 37.4530, -122.1817, 33780, 'Peninsula'],
    ['Palo Alto', 37.4419, -122.1430, 68572, 'South Bay'],
    ['Los Altos', 37.3852, -122.1141, 31625, 'South Bay'],
    ['Mountain View', 37.3861, -122.0839, 82376, 'South Bay'],
    ['Sunnyvale', 37.3688, -122.0363, 155805, 'South Bay'],
    ['Cupertino', 37.3230, -122.0322, 60381, 'South Bay'],
    ['Santa Clara', 37.3541, -121.9552, 127647, 'South Bay'],
    ['San Jose', 37.3382, -121.8863, 1013240, 'South Bay'],
    ['Campbell', 37.2872, -121.9500, 43959, 'South Bay'],
    ['Saratoga', 37.2638, -122.0230, 31051, 'South Bay'],
    ['Los Gatos', 37.2358, -121.9624, 33529, 'South Bay'],
    ['Milpitas', 37.4323, -121.8996, 80273, 'South Bay'],
    ['Fremont', 37.5485, -121.9886, 230504, 'East Bay'],
    ['Newark', 37.5297, -122.0402, 47529, 'East Bay'],
    ['Union City', 37.5934, -122.0438, 70143, 'East Bay'],
    ['Hayward', 37.6688, -122.0808, 162954, 'East Bay'],
    ['Castro Valley', 37.6941, -122.0864, 66441, 'East Bay'],
    ['San Leandro', 37.7249, -122.1561, 91008, 'East Bay'],
    ['Alameda', 37.7652, -122.2416, 78280, 'East Bay'],
    ['Oakland', 37.8044, -122.2712, 440646, 'East Bay'],
    ['Emeryville', 37.8313, -122.2852, 12905, 'East Bay'],
    ['Berkeley', 37.8716, -122.2727, 124321, 'East Bay'],
    ['El Cerrito', 37.9161, -122.3108, 25962, 'East Bay'],
    ['Richmond', 37.9358, -122.3477, 116448, 'East Bay'],
    ['Orinda', 37.8771, -122.1797, 19514, 'Tri-Valley & 680'],
    ['Lafayette', 37.8858, -122.1180, 25391, 'Tri-Valley & 680'],
    ['Walnut Creek', 37.9101, -122.0652, 70127, 'Tri-Valley & 680'],
    ['Pleasant Hill', 37.9480, -122.0608, 34839, 'Tri-Valley & 680'],
    ['Concord', 37.9780, -122.0311, 125410, 'Tri-Valley & 680'],
    ['Danville', 37.8216, -121.9999, 43582, 'Tri-Valley & 680'],
    ['San Ramon', 37.7799, -121.9780, 84605, 'Tri-Valley & 680'],
    ['Dublin', 37.7022, -121.9358, 72589, 'Tri-Valley & 680'],
    ['Pleasanton', 37.6624, -121.8747, 79871, 'Tri-Valley & 680'],
    ['San Rafael', 37.9735, -122.5311, 61271, 'North Bay'],
    ['Mill Valley', 37.9060, -122.5450, 14231, 'North Bay'],
    ['Sausalito', 37.8591, -122.4853, 7269, 'North Bay'],
  ];

  var CITIES = ROWS.map(function (r, i) {
    return { id: i, name: r[0], lat: r[1], lon: r[2], pop: r[3], region: r[4] };
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = CITIES;
  else root.BAY_CITIES = CITIES;
})(this);
