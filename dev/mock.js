// Local preview harness: runs the real Code.gs against an in-memory fake of Google Sheets,
// seeded with made-up demo data. Add ?empty to the URL to see the first-run setup screen.
(function () {
  class Sheet {
    constructor() { this.d = []; }
    getLastRow() { return this.d.length; }
    getRange(r, c, nr = 1, nc = 1) {
      const t = this;
      const R = {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = t.d[r - 1 + i] || [];
            out.push(Array.from({ length: nc }, (_, j) => row[c - 1 + j] === undefined ? '' : row[c - 1 + j]));
          }
          return out;
        },
        setValues(v) { v.forEach((row, i) => { t.d[r - 1 + i] = t.d[r - 1 + i] || []; row.forEach((x, j) => t.d[r - 1 + i][c - 1 + j] = x); }); return R; },
        setValue(x) { t.d[r - 1] = t.d[r - 1] || []; t.d[r - 1][c - 1] = x; return R; },
        setFontWeight() { return R; }, setNumberFormat() { return R; },
      };
      return R;
    }
    appendRow(r) { this.d.push(r); }
    deleteRow(i) { this.d.splice(i - 1, 1); }
    deleteRows(i, n) { this.d.splice(i - 1, n); }
    setFrozenRows() {}
    clear() { this.d = []; }
  }
  const sheets = {};
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => sheets[n] = new Sheet() };
  const pad = n => String(n).padStart(2, '0');
  const env = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => 'id-' + Math.random().toString(36).slice(2),
      formatDate: d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    },
    Session: { getScriptTimeZone: () => 'UTC' },
    HtmlService: {},
  };
  const api = new Function(...Object.keys(env), window.__CODE_GS + '\n;return { getState, addExpense, deleteExpense, clearAll, saveSettings };')(...Object.values(env));

  // ---- demo data ----
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const TYPES = [
    ['Groceries', 0.38, 14, 78, ['Lidl', 'Tesco', 'Aldi', 'Sainsbury’s', 'Weekly shop', 'Milk and bits']],
    ['Eating out', 0.14, 18, 90, ['Pizza night', 'Brunch', 'Curry', 'Pub lunch', 'Takeaway']],
    ['Household', 0.14, 6, 70, ['Dunelm', 'IKEA', 'Cleaning stuff', 'Lightbulbs', 'Bin bags']],
    ['Entertainment', 0.08, 10, 60, ['Cinema', 'Concert tickets', 'Bowling']],
    ['Car', 0.1, 25, 75, ['Fuel', 'Fuel', 'Parking', 'Car wash']],
    ['Gift', 0.08, 12, 65, ['Birthday present', 'Flowers', 'Card and gift']],
    ['Pets', 0.07, 8, 55, ['Cat food', 'Litter', 'Vet']],
    ['Holiday', 0.01, 180, 520, ['Hotel', 'Train tickets']],
  ];
  function seedDemo() {
    api.saveSettings('Alex', 'Sam', '£', TYPES.map(t => t[0]).join(', '));
    const now = new Date(), first = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(now.getFullYear(), now.getMonth() - 13, 1);
    const items = [];
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      const n = rnd() < 0.7 ? 1 + Math.floor(rnd() * 2) : 0;
      for (let k = 0; k < n; k++) {
        let x = rnd(), t = TYPES[0];
        for (const ty of TYPES) { if (x < ty[1]) { t = ty; break; } x -= ty[1]; }
        const weekendBoost = (d.getDay() === 6 || d.getDay() === 0) && rnd() < 0.4;
        items.push({
          date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
          person: rnd() < 0.58 ? 'Alex' : 'Sam', cat: t[0], desc: pick(t[4]),
          amt: (t[2] + rnd() * (t[3] - t[2])) * (weekendBoost ? 1.3 : 1),
        });
      }
    }
    const firstStr = first.getFullYear() + '-' + pad(first.getMonth() + 1) + '-01';
    const add = i => api.addExpense(i.person, i.amt.toFixed(2), i.cat, i.desc, i.date);
    items.filter(i => i.date < firstStr).forEach(add);
    api.clearAll();
    items.filter(i => i.date >= firstStr).forEach(add);
  }
  if (!/[?&]empty/.test(location.search)) seedDemo();

  window.google = { script: { run: new Proxy({}, { get(_, name) {
    if (name === 'withSuccessHandler' || name === 'withFailureHandler') return null;
    return null;
  } }) } };
  function runner(ok, fail) {
    return new Proxy({}, { get(_, name) {
      if (name === 'withSuccessHandler') return f => runner(f, fail);
      if (name === 'withFailureHandler') return f => runner(ok, f);
      return (...args) => setTimeout(() => {
        try { const r = JSON.parse(JSON.stringify(api[name](...args))); ok && ok(r); }
        catch (e) { fail && fail(e); }
      }, 0);
    } });
  }
  window.google = { script: { run: runner() } };
})();
