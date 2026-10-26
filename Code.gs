// Shopping split: Google Sheet as the database, Apps Script as the free host.
// Sheets used (created automatically): "Shopping" (current) and "Cleared" (archive).

// Names, currency and categories live in the "Settings" sheet (set on first run in the app).
const HEADERS = ['Date', 'Person', 'Amount', 'Category', 'Description', 'ID'];

function doGet() {
  let page;
  for (const name of ['Index', 'index', 'Index.html', 'index.html']) {   // tolerate however the file was named
    try { page = HtmlService.createHtmlOutputFromFile(name); break; } catch (e) {}
  }
  if (!page) throw new Error('Add an HTML file named Index to this project');
  return page
    .setTitle('Shopping split')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function sheet_(name, extraHeader) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const h = extraHeader ? HEADERS.concat(extraHeader) : HEADERS;
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd');
  }
  return sh;
}

function day_(v) {
  return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v);
}

function rows_(sh) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, HEADERS.length + 1).getValues()
    .filter(r => r[1] && r[2] !== '')
    .map(r => ({
      date: day_(r[0]),
      clearedOn: r[6] ? day_(r[6]) : '',
      person: r[1], amount: Number(r[2]), category: r[3] || 'Other', description: r[4], id: r[5],
    }));
}

// Settings sheet: A = key, B = value. Returns null until the first-run setup is saved.
function settings_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
  if (!sh || sh.getLastRow() < 1) return null;
  const kv = {};
  sh.getRange(1, 1, sh.getLastRow(), 2).getValues().forEach(r => kv[r[0]] = String(r[1]));
  const people = [kv.person1, kv.person2].filter(Boolean);
  if (people.length !== 2) return null;
  const categories = (kv.categories || '').split(',').map(c => c.trim()).filter(Boolean);
  return { people, categories, currency: kv.currency || '' };
}

function saveSettings(person1, person2, currency, categories) {
  person1 = String(person1 || '').trim();
  person2 = String(person2 || '').trim();
  const cats = [...new Set(String(categories || '').split(',').map(c => c.trim()).filter(Boolean))];
  if (!person1 || !person2) throw new Error('Enter both names');
  if (person1.toLowerCase() === person2.toLowerCase()) throw new Error('The two names must be different');
  if (!cats.length) throw new Error('Enter at least one category');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const old = settings_();
    // If names changed, rename them in existing rows so history stays attached.
    if (old) {
      const map = { [old.people[0]]: person1, [old.people[1]]: person2 };
      ['Shopping', 'Cleared'].forEach(n => {
        const sh = ss.getSheetByName(n);
        if (!sh || sh.getLastRow() < 2) return;
        const rng = sh.getRange(2, 2, sh.getLastRow() - 1, 1);
        rng.setValues(rng.getValues().map(r => [map[r[0]] || r[0]]));
      });
    }
    const sh = ss.getSheetByName('Settings') || ss.insertSheet('Settings');
    sh.clear();
    sh.getRange(1, 1, 4, 2).setValues([
      ['person1', person1], ['person2', person2], ['currency', String(currency || '').trim()], ['categories', cats.join(', ')],
    ]);
    sh.getRange('A:A').setFontWeight('bold');
  } finally { lock.releaseLock(); }
  return getState();
}

// Everything the UI needs in one call.
function getState() {
  const cfg = settings_();
  if (!cfg) return { needsSetup: true };
  const PEOPLE = cfg.people;
  const items = rows_(sheet_('Shopping')).reverse();     // newest first
  const paid = {};
  PEOPLE.forEach(p => paid[p] = 0);
  items.forEach(i => { if (i.person in paid) paid[i.person] += i.amount; });
  const total = PEOPLE.reduce((s, p) => s + paid[p], 0);
  // Positive net = that person is owed money.
  const net = {};
  PEOPLE.forEach(p => net[p] = paid[p] - total / PEOPLE.length);
  const [a, b] = PEOPLE;
  const amount = Math.round(Math.abs(net[a]) * 100) / 100;
  const debt = amount === 0 ? null : { from: net[a] < 0 ? a : b, to: net[a] < 0 ? b : a, amount };
  const cats = cfg.categories.slice();
  const cl = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Cleared');
  // Cleared payments, newest first; used for history and insights.
  const history = (cl ? rows_(cl) : []).sort((x, y) => y.date < x.date ? -1 : y.date > x.date ? 1 : 0);
  items.concat(history).forEach(i => { if (i.category && !cats.includes(i.category)) cats.push(i.category); });
  return { people: PEOPLE, categories: cats, currency: cfg.currency, items, history, paid, total, debt };
}

function addExpense(person, amount, category, description, date) {
  amount = Math.round(Number(amount) * 100) / 100;
  const cfg = settings_();
  if (!cfg || !cfg.people.includes(person)) throw new Error('Unknown person');
  if (!(amount > 0)) throw new Error('Enter an amount above 0');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = date ? new Date(date + 'T12:00:00') : new Date();
    sheet_('Shopping').appendRow([d, person, amount, String(category || 'Other').trim(), String(description || '').trim(), Utilities.getUuid()]);
  } finally { lock.releaseLock(); }
  return getState();
}

function deleteExpense(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_('Shopping');
    const ids = sh.getRange(2, 6, Math.max(sh.getLastRow() - 1, 1), 1).getValues().flat();
    const idx = ids.indexOf(id);
    if (idx >= 0) sh.deleteRow(idx + 2);
  } finally { lock.releaseLock(); }
  return getState();
}

// Settle up: move every current row to "Cleared" (stamped with the clear date).
function clearAll() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_('Shopping');
    const n = sh.getLastRow() - 1;
    if (n >= 1) {
      const data = sh.getRange(2, 1, n, HEADERS.length).getValues().filter(r => r[1] && r[2] !== '');
      const stamp = new Date();
      const out = data.map(r => r.concat([stamp]));
      const cl = sheet_('Cleared', ['Cleared on']);
      if (out.length) {
        cl.getRange(cl.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
        cl.getRange(cl.getLastRow() - out.length + 1, 1, out.length, 1).setNumberFormat('yyyy-mm-dd');
        cl.getRange(cl.getLastRow() - out.length + 1, 7, out.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      }
      sh.deleteRows(2, n);
    }
  } finally { lock.releaseLock(); }
  return getState();
}
