/**
 * UI-only regression checks for the standalone monitor dashboard.
 *
 * The dashboard is intentionally a single dependency-free HTML file.  This
 * test loads its inline script in a small VM DOM shim so render functions and
 * the ECharts point-click handler can be exercised without a browser install.
 * It does not alter dashboard.html or make network requests.
 *
 * Run from the app directory:
 *   node monitor-dashboard/test_dashboard_ui_regression.mjs
 */

import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dashboardPath = path.join(here, 'dashboard.html');
const html = fs.readFileSync(dashboardPath, 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(inline.length, 1, 'dashboard should contain exactly one inline script');

const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      innerHTML: '',
      textContent: '',
      className: '',
      classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute() {},
      removeAttribute() {},
      scrollIntoView() {},
      focus() {},
      closest() { return null; },
    });
  }
  return elements.get(id);
}

element('app');
element('loadingOverlay');
element('loadingText');
element('dashboardToast');
element('footerText');
element('refreshBtn');
element('refreshIcon');
element('refreshLabel');
element('dataTime');

const chartHandlers = {};
const chart = {
  dispose() {},
  setOption() {},
  resize() {},
  on(event, handler) { chartHandlers[event] = handler; },
};

const documentShim = {
  querySelector(selector) {
    if (selector.startsWith('#')) return element(selector.slice(1));
    return null;
  },
  querySelectorAll() { return []; },
  addEventListener() {},
  documentElement: { scrollHeight: 0 },
};

const windowShim = {
  __cpsDateDismissBound: false,
  addEventListener() {},
  scrollTo() {},
  parent: { postMessage() {} },
  location: { origin: 'http://localhost' },
};

const responses = new Map();
const fetchShim = async (url) => {
  const key = String(url).replace(/^\/monitor-api/, '');
  const body = responses.get(key) ?? [];
  return { ok: true, status: 200, async json() { return body; } };
};

const sandbox = {
  console,
  document: documentShim,
  window: windowShim,
  ResizeObserver: class { observe() {} },
  echarts: { init() { return chart; } },
  fetch: fetchShim,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame(callback) { return setTimeout(callback, 0); },
  cancelAnimationFrame(id) { clearTimeout(id); },
  Date,
  URL,
  URLSearchParams,
  Math,
  Number,
  String,
  JSON,
  encodeURIComponent,
  decodeURIComponent,
};
const context = vm.createContext(sandbox);
vm.runInContext(inline[0][1], context, { filename: dashboardPath });

function run(source) {
  return vm.runInContext(source, context, { filename: `${dashboardPath}:test` });
}

function setState(module, drillFilter = null) {
  run(`
    state.activeModule = ${JSON.stringify(module)};
    state.periodStart = '2026-08-10';
    state.periodEnd = '2026-08-12';
    state.selectedPeriod = 'custom';
    state.dateDraftPeriod = 'custom';
    state.moduleLoading = '';
    state.dashboardLoading = false;
    state.refreshing = false;
    state.drillFilter = ${JSON.stringify(drillFilter)};
    state.drillRows = [];
    state.drillPage = 1;
    state.activeMetrics = ['content_count'];
    state.kpiCards = [
      {key:'content_count',data_status:'ready',current_value:2,total_value:4,ratio:50},
      {key:'link_count',data_status:'ready',current_value:4,total_value:5,ratio:80},
      {key:'play_count',data_status:'ready',current_value:240,total_value:320,ratio:75},
      {key:'store_traffic',data_status:'ready',current_value:60,total_value:300,ratio:20},
      {key:'store_sales',data_status:'ready',current_value:90},
      {key:'jd_clicks',data_status:'unavailable',current_value:null},
      {key:'jd_amount',data_status:'ready',current_value:5400},
    ];
    state.dailyCurve = [
      {date:'2026-08-10',new_content:2,play_count:100},
      {date:'2026-08-11',new_content:1,play_count:90},
      {date:'2026-08-12',new_content:1,play_count:50},
    ];
    state.prevCurve = [];
    state.todayTasks = {items:[]};
    state.topCreators = [];
    state.brandRankings = [];
    state.creatorComparisons = [];
    state.thunderbirdCreators = [];
    state.actionPlan = {};
    state.autoAnalysis = null;
    state.roiRows = [];
  `);
}

function appHTML() {
  return element('app').innerHTML;
}

function count(value, pattern) {
  return (value.match(pattern) || []).length;
}

function render() {
  run('renderApp()');
  return appHTML();
}

const detailRows = Array.from({ length: 51 }, (_, index) => ({
  content_id: `D${index + 1}`,
  title: `内容标题${index + 1}`,
  url: `https://example.test/video/${index + 1}`,
  account: `账号${index + 1}`,
  creator_name: `账号${index + 1}`,
  play_count: index + 1,
  interaction_count: index + 2,
  comment_blue_link_count: index % 3,
  blue_link_count: index % 3,
  thunderbird_link_count: index % 2,
  date: '2026-08-11',
}));
responses.set('/content-detail?date=2026-08-11&limit=5000&start_date=2026-08-10&end_date=2026-08-12', detailRows);

// 1) Platform overview owns exactly one mounted drill-down section.
setState('platform', { type: 'date', value: '2026-08-11', dateKey: '2026-08-11' });
let output = render();
assert.equal(count(output, /id="drilldownSection"/g), 1, 'platform overview must mount one drill-down section');

// 2) Simulate an ECharts date-point click.  The immediate render must show the
// selected date title; the awaited fetch must then populate the field table.
assert.equal(typeof chartHandlers.click, 'function', 'ECharts click handler must be registered');
chartHandlers.click({ dataIndex: 1, axisValue: '2026-08-11' });
output = appHTML();
assert.match(output, /2026-08-11 内容明细/, 'date click must show the selected date title');
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(run('state.drillRows.length'), 51, 'date click must load all matching content rows');
run('renderDrilldownTable()');
output = element('drilldownContent').innerHTML;
for (const header of ['标题', '账号', '播放', '互动', '评论区蓝链数', '雷鸟蓝链数']) {
  assert.match(output, new RegExp(header), `drill-down table must include ${header}`);
}
assert.match(output, /https:\/\/example\.test\/video\/1/, 'drill-down must preserve content links');
assert.match(output, /共 51 条 · 第 1\/2 页/, 'drill-down must paginate in pages of 50');
// Header + exactly 50 first-page rows; no 51st row should render yet.
assert.equal(count(output, /<tbody>/g), 1);
const tableBody = output.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '';
assert.equal(count(tableBody, /<tr>/g), 50, 'first drill-down page must contain 50 rows');
assert.doesNotMatch(output, /内容标题51/, 'second-page row must not appear on first page');

// 3) Industry and creator workbench drill-downs remain single, non-duplicated
// sections when their own clickable rows set the shared drill filter.
for (const module of ['industry', 'creator']) {
  setState(module, { type: 'creator_name', value: '账号1' });
  output = render();
  assert.equal(count(output, /id="drilldownSection"/g), 1, `${module} must render one drill-down section`);
}

console.log('PASS: dashboard UI drill-down, date click, 50-row pagination, and module uniqueness');
