/** Office.gs — API ของแอป Dashboard (ทิพย์/ปิ๊ก) · a = {uid,name,role} จาก token เครื่อง · p = พารามิเตอร์ */
function officeApi(a, p) {
  const owner = a.role === 'owner';
  switch (p.api) {
    case 'init': return { ok: true, today: p.withToday ? todayData(p.date) : null, me: a, shops: shops().map(s => s.name), barbers: barbers(false).map(b => ({ name: b.name, shop: b.shop, daily: b.daily, min: b.min })), rules: shops().reduce((o, s) => (o[s.name] = { method: s.method, rate: s.rate }, o), {}), types: expenseTypes(), months: monthList(), closed: list('CLOSED_MONTHS'), paid: list('PAID_MONTHS') };
    case 'today': return todayData(p.date);
    case 'month': return monthData(p.ym);
    case 'daily_get': return dailyGet(p.date, p.shop);
    case 'daily_save': return dailySave(a, p);
    case 'expense_add': return expenseAdd(a, p);
    case 'expense_list': return { ok: true, rows: expenseRows(p.ym).slice(-200).reverse() };
    case 'cash_list': return { ok: true, rows: cashRows(p.ym).reverse(), balance: cashBalance() };
    case 'pond': return pondData();
    case 'pond_paid': return pondPaid(a, p);
    case 'pond_unpay': return pondUnpay(a, p);
    case 'slip_fix': { const s = ss().getSheetByName(SH_SLIP); const row = num(p.row); if (!s || row < 2) return { ok: false, msg: 'ไม่พบสลิป' }; s.getRange(row, 5).setValue(p.amount === '' ? '' : num(p.amount)); s.getRange(row, 10).setValue('แก้โดย ' + a.name + ' ' + nowText()); return { ok: true, msg: 'แก้ยอดสลิปแล้ว', data: dailyGet(p.date, p.shop) }; }
    case 'payroll': return payrollData(p.ym);
    case 'target_set': { if (!owner) return deny(); if (!(num(p.val) > 0)) return { ok: false, msg: 'ใส่จำนวนหัวเป็นตัวเลข' }; const ok = setTarget(p.ym, p.shop, p.val); return ok ? { ok: true, msg: 'ตั้งเป้า ' + p.shop + ' ' + p.ym + ' = ' + num(p.val) + ' หัว' } : { ok: false, msg: 'ไม่พบเดือน ' + p.ym + ' หรือร้าน ' + p.shop + ' ในแผ่น ตั้งค่า (A33:D57)' }; }
    case 'close_month': if (!owner) return deny(); return closeMonth(p.ym);
    case 'paid': if (!owner) return deny(); return confirmPaid(p.ym, p.slips || {});
    case 'barber_save': if (!owner) return deny(); return barberSave(p);
    default: return { ok: false, msg: 'unknown api ' + p.api };
  }
}
function deny() { return { ok: false, msg: 'เฉพาะแอดมินเท่านั้น' }; }
function list(k) { return (prop(k) || '').split(',').filter(Boolean); }
function addList(k, v) { const l = list(k); if (!l.includes(v)) l.push(v); P().setProperty(k, l.join(',')); }
function monthList() { const out = []; const d = todayBkk(); for (let i = 0; i < 14; i++) { out.push(ym(d)); d.setMonth(d.getMonth() - 1); } return out; }

/* ---------- อ่านแผ่น ---------- */
function rowsOf(name, cols) { const s = sh(name); const n = s.getLastRow() - 1; return n < 1 ? [] : s.getRange(2, 1, n, cols).getValues(); }
function dailyRows(filter) { return rowsOf(SH_DAILY, D_BY).map((r, i) => ({ row: i + 2, d: dateKey(r[0]), shop: String(r[D_SHOP - 1]).trim(), name: String(r[D_NAME - 1]).trim(), heads: num(r[D_HEADS - 1]), sales: num(r[D_SALES - 1]), cash: num(r[D_CASH - 1]), transfer: num(r[D_TRANSFER - 1]), calc: num(r[D_CALC - 1]), over: r[D_OVER - 1] === '' ? '' : num(r[D_OVER - 1]), paid: num(r[D_PAID - 1]), note: String(r[D_NOTE - 1] || ''), by: String(r[D_BY - 1] || '') })).filter(x => x.d && (!filter || filter(x))); }
function expenseRows(ymStr) { return rowsOf(SH_EXP, X_FROM).map((r, i) => ({ row: i + 2, d: dateKey(r[0]), shop: String(r[X_SHOP - 1]).trim(), type: String(r[X_TYPE - 1]).trim(), name: String(r[X_NAME - 1] || '').trim(), amt: num(r[X_AMT - 1]), detail: String(r[X_DETAIL - 1] || ''), by: String(r[X_BY - 1] || ''), link: String(r[X_LINK - 1] || ''), from: String(r[X_FROM - 1] || '') })).filter(x => x.d && (!ymStr || x.d.slice(0, 7) === ymStr)); }
function cashRows(ymStr) { return rowsOf(SH_CASH, C_LINK).map((r, i) => ({ row: i + 2, d: dateKey(r[0]), shop: String(r[C_SHOP - 1]).trim(), method: String(r[C_METHOD - 1]), amt: num(r[C_AMT - 1]), who: String(r[C_WHO - 1] || ''), by: String(r[C_BY - 1] || ''), link: String(r[C_LINK - 1] || '') })).filter(x => x.d && (!ymStr || x.d.slice(0, 7) === ymStr)); }
function gpsDist(v) { const m = /\((\d+) ม\.\)/.exec(String(v || '')); return m ? +m[1] : (String(v || '').trim() ? null : ''); }
function timeRows(filter) { return rowsOf(SH_TIME, T_GPSOUT).map(r => ({ d: dateKey(r[0]), name: String(r[T_NAME - 1]).trim(), shop: String(r[T_SHOP - 1]).trim(), shift: String(r[T_SHIFT - 1]), tin: tStr(r[T_IN - 1]), tout: tStr(r[T_OUT - 1]), late: num(r[T_LATE - 1]), distIn: gpsDist(r[T_GPSIN - 1]), distOut: gpsDist(r[T_GPSOUT - 1]), status: String(r[T_STATUS - 1] || ''), note: String(r[T_NOTE - 1] || '') })).filter(x => x.d && (!filter || filter(x))); }

/* ---------- เงินสดคงเหลือควรมี ต่อร้าน ---------- */
function cashBalance() {
  const out = {}; const S = shops();
  const d = dailyRows(), x = expenseRows(), c = cashRows();
  S.forEach(s => {
    const from = s.cashFrom || '0000-00-00'; const ge = r => r.shop === s.name && r.d >= from;
    const inCash = d.filter(ge).reduce((a, r) => a + r.cash, 0);
    const outCash = x.filter(r => ge(r) && r.from === CASH_FROM).reduce((a, r) => a + r.amt, 0);
    const coll = c.filter(ge).reduce((a, r) => a + r.amt, 0);
    out[s.name] = { start: s.cash0, from: s.cashFrom, in: inCash, out: outCash, collected: coll, balance: s.cash0 + inCash - outCash - coll };
  });
  return out;
}

/* ---------- วันนี้ ---------- */
function todayData(dateStr) {
  const day = dateStr && parseYmd(dateStr) ? dateStr : ymd(todayBkk()); const S = shops().map(s => s.name);
  const d = dailyRows(r => r.d === day), t = timeRows(r => r.d === day); const act = barbers(false);
  const byShop = S.map(s => ({ shop: s, heads: d.filter(r => r.shop === s).reduce((a, r) => a + r.heads, 0), sales: d.filter(r => r.shop === s).reduce((a, r) => a + r.sales, 0), wage: d.filter(r => r.shop === s).reduce((a, r) => a + r.paid, 0), staff: t.filter(r => r.shop === s).map(r => ({ name: r.name, tin: r.tin, tout: r.tout, late: r.late, status: r.status, distIn: r.distIn, distOut: r.distOut, shift: r.shift })) }));
  const punched = t.map(r => r.name); const notYet = act.filter(b => !punched.includes(b.name)).map(b => b.name);
  const ymStr = day.slice(0, 7); const tg = targets(ymStr); const md = dailyRows(r => r.d.slice(0, 7) === ymStr);
  const mtd = S.map(s => ({ shop: s, heads: md.filter(r => r.shop === s).reduce((a, r) => a + r.heads, 0), target: tg[s] || 0, sales: md.filter(r => r.shop === s).reduce((a, r) => a + r.sales, 0) }));
  return { ok: true, date: day, byShop, notYet, mtd, cash: cashBalance(), pond: pondData().today, recent: expenseRows(ymStr).slice(-8).reverse().concat(), lastCollect: cashRows().slice(-3).reverse() };
}

/* ---------- รายเดือน ---------- */
function monthData(ymStr) {
  ymStr = /^\d{4}-\d{2}$/.test(ymStr || '') ? ymStr : ym(todayBkk()); const S = shops().map(s => s.name);
  const d = dailyRows(r => r.d.slice(0, 7) === ymStr), x = expenseRows(ymStr), t = timeRows(r => r.d.slice(0, 7) === ymStr);
  const days = {}; d.forEach(r => { const k = r.d; days[k] = days[k] || { d: k }; days[k][r.shop] = days[k][r.shop] || { heads: 0, sales: 0 }; days[k][r.shop].heads += r.heads; days[k][r.shop].sales += r.sales; });
  const perBarber = {}; d.forEach(r => { const o = perBarber[r.name] = perBarber[r.name] || { name: r.name, days: 0, heads: 0, sales: 0, wage: 0, late: 0, lateMin: 0 }; o.days++; o.heads += r.heads; o.sales += r.sales; o.wage += r.paid; });
  t.forEach(r => { if (r.late > 0 && perBarber[r.name]) { perBarber[r.name].late++; perBarber[r.name].lateMin += r.late; } });
  const tg = targets(ymStr);
  const byShop = S.map(s => { const rows = d.filter(r => r.shop === s); const ex = x.filter(r => r.shop === s && r.type !== 'เบิกช่าง'); const byType = {}; ex.forEach(r => byType[r.type] = (byType[r.type] || 0) + r.amt); const sales = rows.reduce((a, r) => a + r.sales, 0), wage = rows.reduce((a, r) => a + r.paid, 0), exp = ex.reduce((a, r) => a + r.amt, 0); return { shop: s, heads: rows.reduce((a, r) => a + r.heads, 0), target: tg[s] || 0, sales, wage, expenses: byType, expTotal: exp, profit: sales - wage - exp }; });
  return { ok: true, ym: ymStr, days: Object.values(days).sort((a, b) => a.d < b.d ? -1 : 1), barbers: Object.values(perBarber), byShop, total: { sales: byShop.reduce((a, s) => a + s.sales, 0), wage: byShop.reduce((a, s) => a + s.wage, 0), exp: byShop.reduce((a, s) => a + s.expTotal, 0), profit: byShop.reduce((a, s) => a + s.profit, 0) }, closed: list('CLOSED_MONTHS').includes(ymStr), paid: list('PAID_MONTHS').includes(ymStr) };
}

/* ---------- กรอกยอดรายวัน (ปิ๊ก) ---------- */
function dailyGet(dateStr, shop) {
  const day = parseYmd(dateStr) ? dateStr : ymd(todayBkk()); const ex = dailyRows(r => r.d === day && r.shop === shop);
  const names = barbers(false).map(b => b.name); ex.forEach(r => { if (!names.includes(r.name)) names.push(r.name); });
  const punched = timeRows(r => r.d === day && r.shop === shop).map(r => r.name);
  const rows = names.map(n => { const r = ex.find(e => e.name === n); const b = barberByName(n); return { name: n, main: b && b.shop === shop, punched: punched.includes(n), heads: r ? r.heads : '', sales: r ? r.sales : '', cash: r ? r.cash : '', transfer: r ? r.transfer : '', calc: r ? r.calc : '', over: r ? r.over : '', paid: r ? r.paid : '', note: r ? r.note : '', exists: !!r }; });
  rows.sort((a, b) => (b.main - a.main) || (b.punched - a.punched));
  const sl = slipRows(x => x.d === day && x.shop === shop && slipCounted(x)), bk = slipRows(x => x.d === day && x.shop === shop && x.note === 'สมุด'), tips = expenseRows().filter(x => x.d === day && x.shop === shop && x.type === 'ทิปช่าง');
  rows.forEach(r => { const m = sl.filter(x => x.name === r.name); r.slips = m.map(x => ({ row: x.row, amount: x.amount, read: x.read, link: x.link, at: x.at, note: x.note })); r.tips = tips.filter(x => x.name === r.name).reduce((a, x) => a + x.amt, 0); });
  return { ok: true, date: day, shop, rows, books: bk.map(x => ({ link: x.link, at: x.at, name: x.name })), cash: cashBalance()[shop] || null };
}
function dailySave(a, p) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const day = parseYmd(p.date); if (!day) return { ok: false, msg: 'วันที่ไม่ถูกต้อง' }; const shop = clean(p.shop, 20); if (!shops().find(s => s.name === shop)) return { ok: false, msg: 'ไม่พบร้าน' };
    const ex = dailyRows(r => r.d === p.date && r.shop === shop); const s = sh(SH_DAILY); let n = 0, deleted = 0;
    (p.rows || []).forEach(r => {
      const name = clean(r.name, 30); if (!name) return;
      const heads = r.heads === '' ? '' : num(r.heads), cash = r.cash === '' ? '' : num(r.cash), tr = r.transfer === '' ? '' : num(r.transfer); let sales = r.sales === '' ? '' : num(r.sales); if ((sales === '' || sales === 0) && (cash !== '' || tr !== '')) sales = num(cash) + num(tr); const over = r.over === '' || r.over == null ? '' : num(r.over);
      const cur = ex.find(e => e.name === name);
      if (heads === '' && sales === '' && cash === '' && tr === '') { if (cur && r.remove) { [[1, 7], [D_OVER, 1], [D_NOTE, 1], [D_BY, 1]].forEach(([c, w]) => s.getRange(cur.row, c, 1, w).clearContent()); deleted++; } return; } // ไม่แตะคอลัมน์สูตร (H J L N O P)
      const vals = [[day, shop, name, heads, sales, cash, tr]]; const row = cur ? cur.row : s.getLastRow() + 1;
      s.getRange(row, 1, 1, 7).setValues(vals); s.getRange(row, D_OVER).setValue(over); s.getRange(row, D_NOTE).setValue(clean(r.note, 120)); s.getRange(row, D_BY).setValue(a.name); s.getRange(row, D_DATE).setNumberFormat('yyyy-mm-dd'); n++;
    });
    SpreadsheetApp.flush();
    return { ok: true, msg: 'บันทึก ' + n + ' รายการ' + (deleted ? ' ลบ ' + deleted : ''), data: dailyGet(p.date, shop) };
  } finally { lock.releaseLock(); }
}

/* ---------- รายจ่าย ---------- */
function expenseAdd(a, p) {
  const day = parseYmd(p.date) || todayBkk(); const shop = clean(p.shop, 20); const type = clean(p.type, 30); const amt = num(p.amount);
  if (!shop || !type || amt <= 0) return { ok: false, msg: 'กรอก ร้าน ประเภท จำนวนเงิน' };
  if (!expenseTypes().includes(type)) return { ok: false, msg: 'ประเภทไม่ถูกต้อง' };
  const name = type === 'เบิกช่าง' || type === 'ค่าแรงพิเศษ' ? clean(p.name, 30) : ''; if (type === 'เบิกช่าง' && !name) return { ok: false, msg: 'เบิกช่าง ต้องเลือกชื่อช่าง' };
  let link = ''; if (p.image) { const f = saveImage(p.image, 'ใบเสร็จ ' + ym(day), ymd(day) + ' ' + shop + ' ' + type + ' ' + money(amt), false); if (f) link = f.url; }
  const x = sh(SH_EXP); const row = x.getLastRow() + 1;
  x.getRange(row, 1, 1, X_LINK).setValues([[day, shop, type, name, amt, clean(p.detail, 150), a.name, link]]); x.getRange(row, X_FROM).setValue(p.from === CASH_FROM ? CASH_FROM : 'โอน/' + a.name); x.getRange(row, X_DATE).setNumberFormat('yyyy-mm-dd');
  if (type === 'เบิกช่าง') pushBarber(name, '📝 บันทึกเบิกล่วงหน้า ' + money(amt) + ' บาท (' + ymd(day) + ') จะหักจากค่าแรงสิ้นเดือน');
  return { ok: true, msg: 'บันทึก ' + type + ' ' + money(amt) + ' บาท (' + shop + ')' };
}

/* ---------- โอนปอนรายวัน (ปิ๊ก) ---------- */
function dailyPayRows() { const s = ss().getSheetByName(SH_DAILYPAY); if (!s || s.getLastRow() < 2) return []; return s.getRange(2, 1, s.getLastRow() - 1, 7).getValues().map(r => ({ paidOn: dateKey(r[0]), name: String(r[1]).trim(), forDate: dateKey(r[2]), amt: num(r[3]), by: String(r[4] || ''), link: String(r[5] || '') })); }
function pondData() {
  const dailyB = barbers(false).filter(b => b.daily); const paid = dailyPayRows(); const today = todayBkk(); const out = { ok: true, barbers: [], today: [] };
  // เริ่มนับโอนรายวันตั้งแต่วันที่เริ่มใช้ระบบ (ตั้งค่า L28:L30 "ตั้งแต่วันที่") — ก่อนหน้านั้นจ่ายไปแล้วนอกระบบ
  const starts = shops().map(x => x.cashFrom).filter(Boolean).sort(); const start = starts[0] || ym(today) + '-01';
  dailyB.forEach(b => {
    const rows = dailyRows(r => r.name === b.name && r.d >= start).slice(-45).reverse().map(r => { const pd = paid.find(x => x.name === b.name && x.forDate === r.d); return { d: r.d, shop: r.shop, heads: r.heads, sales: r.sales, wage: r.paid, paid: !!pd, paidOn: pd ? pd.paidOn : '', link: pd ? pd.link : '' }; });
    const due = rows.filter(r => !r.paid && r.wage > 0 && r.d <= ymd(new Date(today.getTime() - 2 * 86400000)));
    out.barbers.push({ name: b.name, rows, due, dueTotal: due.reduce((a, r) => a + r.wage, 0) });
    out.today.push({ name: b.name, due: due.length, dueTotal: due.reduce((a, r) => a + r.wage, 0) });
  });
  return out;
}
/** ยกเลิกรายการ "โอนแล้ว" (กดผิด) — ลบแถวในแผ่น โอนรายวัน */
function pondUnpay(a, p) {
  const name = clean(p.name, 30), d = dateKey(p.date); const s = ss().getSheetByName(SH_DAILYPAY); if (!s || !name || !d) return { ok: false, msg: 'ไม่พบรายการ' };
  const rows = s.getRange(2, 1, Math.max(s.getLastRow() - 1, 1), 3).getValues(); let n = 0;
  for (let i = rows.length - 1; i >= 0; i--) if (String(rows[i][1]).trim() === name && dateKey(rows[i][2]) === d) { s.deleteRow(i + 2); n++; }
  return { ok: true, msg: n ? 'ยกเลิกโอน ' + name + ' ' + d + ' แล้ว' : 'ไม่พบรายการ', data: pondData() };
}
function pondPaid(a, p) {
  const name = clean(p.name, 30); const dates = (p.dates || []).map(d => dateKey(d)).filter(Boolean); if (!name || !dates.length) return { ok: false, msg: 'เลือกวันที่' };
  const today = todayBkk(); const s = ss().getSheetByName(SH_DAILYPAY) || (setup(), ss().getSheetByName(SH_DAILYPAY)); const d = dailyRows(r => r.name === name && dates.includes(r.d)); const done = dailyPayRows();
  let link = ''; if (p.image) { const f = saveImage(p.image, 'โอนรายวัน ' + ym(today), ymd(today) + ' ' + name, false); if (f) link = f.url; }
  let total = 0; const lines = [];
  d.forEach(r => { if (done.find(x => x.name === name && x.forDate === r.d)) return; s.appendRow([today, name, parseYmd(r.d), r.paid, a.name, link, r.shop + ' ' + r.heads + ' หัว']); total += r.paid; lines.push(r.d + ' ' + money(r.paid)); });
  if (lines.length) pushBarber(name, '💸 โอนค่าแรงแล้ว ' + money(total) + ' บาท\n' + lines.join('\n') + '\nโดย ' + a.name + ' ' + nowText());
  return { ok: true, msg: 'บันทึกโอน ' + name + ' ' + money(total) + ' บาท (' + lines.length + ' วัน)', data: pondData() };
}

/* ---------- เงินเดือน ---------- */
function payrollData(ymStr) {
  ymStr = /^\d{4}-\d{2}$/.test(ymStr || '') ? ymStr : prevMonth(); const s = sh(SH_PAY);
  s.getRange('B2').setValue(parseYmd(ymStr + '-01')); SpreadsheetApp.flush();
  const head = s.getRange('A5:O5').getValues()[0]; const rows = s.getRange('A6:O25').getValues().filter(r => r[0] !== '' && (num(r[2]) > 0 || num(r[12]) !== 0));
  const people = rows.map(r => { const o = {}; head.forEach((h, i) => o[h] = r[i]); return { name: String(r[0]), shop: String(r[1]), days: num(r[2]), heads: num(r[3]), sales: num(r[4]), wage: num(r[5]), shopHeads: num(r[6]), target: num(r[7]), bonus: num(r[8]), advance: num(r[9]), sso: num(r[10]), dailyPaid: num(r[11]), net: num(r[12]), late: num(r[13]), lateMin: num(r[14]) }; });
  const shopsSum = s.getRange('A29:F31').getValues().map(r => ({ shop: String(r[0]), heads: num(r[1]), target: num(r[2]), hit: String(r[3]), sales: num(r[4]), wage: num(r[5]) }));
  return { ok: true, ym: ymStr, people, shops: shopsSum, closed: list('CLOSED_MONTHS').includes(ymStr), paid: list('PAID_MONTHS').includes(ymStr), total: people.reduce((a, p) => a + p.net, 0) };
}
/** ปิดงวด: ล็อกเดือน + บันทึกโบนัสเป็นรายจ่าย (ประเภท โบนัส) ต่อร้าน เพื่อให้ P&L นับ */
function closeMonth(ymStr) {
  if (!/^\d{4}-\d{2}$/.test(ymStr || '')) return { ok: false, msg: 'เดือนไม่ถูกต้อง' };
  if (list('CLOSED_MONTHS').includes(ymStr)) return { ok: false, msg: 'ปิดงวด ' + ymStr + ' แล้ว' };
  const pr = payrollData(ymStr); const x = sh(SH_EXP); const last = parseYmd(ymStr + '-01'); last.setMonth(last.getMonth() + 1); last.setDate(0);
  const exist = expenseRows(ymStr).filter(r => r.type === 'โบนัส'); const byShop = {}; pr.people.forEach(p => { if (p.bonus > 0) byShop[p.shop] = (byShop[p.shop] || 0) + p.bonus; });
  let n = 0; Object.keys(byShop).forEach(sName => { if (exist.find(r => r.shop === sName)) return; const row = x.getLastRow() + 1; x.getRange(row, 1, 1, X_LINK).setValues([[last, sName, 'โบนัส', '', byShop[sName], 'โบนัสถึงเป้า ' + ymStr + ' (ปิดงวด)', 'ระบบ', '']]); x.getRange(row, X_FROM).setValue('โอน/ทิพย์'); x.getRange(row, X_DATE).setNumberFormat('yyyy-mm-dd'); n++; });
  addList('CLOSED_MONTHS', ymStr);
  const lines = pr.people.map(p => '• ' + p.name + ' สุทธิ ' + money(p.net) + (p.bonus ? ' (โบนัส ' + money(p.bonus) + ')' : ''));
  pushAdmins('🔒 ปิดงวด ' + ymStr + ' แล้ว รวมจ่ายวันที่ 2 = ' + money(pr.total) + ' บาท\n' + lines.join('\n') + '\n\nโอนเสร็จแล้วกด "โอนแล้ว" ในแอป (แนบสลิปได้) หรือพิมพ์ "โอนแล้ว ' + ymStr + '" ในไลน์');
  return { ok: true, msg: 'ปิดงวด ' + ymStr + ' แล้ว' + (n ? ' บันทึกโบนัส ' + n + ' ร้าน' : ''), data: payrollData(ymStr) };
}
/** โอนแล้ว: สร้างสลิป PDF ทุกคน → เก็บ Drive → ส่งไลน์ช่าง (+ รูปสลิปโอนถ้ามี) */
function confirmPaid(ymStr, slips) {
  if (!/^\d{4}-\d{2}$/.test(ymStr || '')) return { ok: false, msg: 'เดือนไม่ถูกต้อง' };
  if (!list('CLOSED_MONTHS').includes(ymStr)) { const c = closeMonth(ymStr); if (!c.ok) return c; }
  const pr = payrollData(ymStr); const sent = [];
  pr.people.forEach(p => {
    try {
      const blob = slipPdfBlob(p, ymStr); const f = subFolder('สลิป ' + ymStr); const old = f.getFilesByName(blob.getName()); while (old.hasNext()) old.next().setTrashed(true); f.createFile(blob);
      let img = ''; const s = slips && slips[p.name]; if (s) { const r = saveImage(s, 'สลิป ' + ymStr, 'โอน ' + p.name, true); if (r) img = r.img; }
      const txt = '💰 สลิปเงินเดือน ' + ymStr + ' — ' + p.name + '\n' + slipLines(p.name, ymStr, p).join('\n') + '\n\nดู/ดาวน์โหลดสลิป PDF: https://liff.line.me/' + LIFF_ID() + '?mode=slip';
      sent.push(p.name + (pushBarber(p.name, txt, img) ? ' ✓' : ' (ไม่มี LINE)'));
    } catch (e) { sent.push(p.name + ' ✗ ' + e.message); }
  });
  addList('PAID_MONTHS', ymStr);
  return { ok: true, msg: 'ส่งสลิป ' + ymStr + ': ' + sent.join(', ') };
}

/* ---------- เพิ่ม/แก้ช่าง (ทิพย์) ---------- */
function barberSave(p) {
  clearMemo();
  const name = clean(p.name, 30); if (!name) return { ok: false, msg: 'ใส่ชื่อ' }; const s = sh(SH_SET); const b = barberByName(name);
  let row = b ? b.row : 0;
  if (!row) { const names = s.getRange(B_ROW0, 1, B_ROWS, 1).getValues().map(r => String(r[0]).trim()); const i = names.indexOf(''); if (i < 0) return { ok: false, msg: 'แถวช่างเต็ม (20 คน) ลบช่างเก่าออกก่อน' }; row = B_ROW0 + i; }
  if (p.end) { s.getRange(row, B_END).setValue(parseYmd(p.end)); return { ok: true, msg: name + ' ออกวันที่ ' + p.end }; }
  const pin = clean(p.pin, 10) || (b ? b.pin : ''); if (!pin) return { ok: false, msg: 'ใส่ PIN' };
  if (barbers(true).find(x => x.pin === pin && x.name !== name)) return { ok: false, msg: 'PIN ซ้ำกับช่างคนอื่น' };
  const vals = [name, clean(p.shop, 20), num(p.min), num(p.sso), !!p.daily, pin, b ? b.uid : '', p.start ? parseYmd(p.start) : (b && b.start ? parseYmd(b.start) : todayBkk()), ''];
  s.getRange(row, 1, 1, 9).setValues([vals]); s.getRange(row, B_START, 1, 2).setNumberFormat('yyyy-mm-dd');
  if (p.unbind) s.getRange(row, B_LINE).clearContent();
  return { ok: true, msg: (b ? 'แก้ไข ' : 'เพิ่ม ') + name + ' แล้ว' + (b ? '' : ' — ให้ช่างเปิดเมนู "ลงเวลา" ในไลน์ แล้วใส่ PIN ' + clean(p.pin, 10)) };
}
