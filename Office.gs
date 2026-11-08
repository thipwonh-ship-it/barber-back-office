/** Office.gs — API ของแอป Dashboard (ทิพย์/ปิ๊ก) · a = {uid,name,role} จาก token เครื่อง · p = พารามิเตอร์ */
function officeApi(a, p) {
  const owner = a.role === 'owner';
  switch (p.api) {
    case 'init': return { ok: true, today: p.withToday ? todayData(p.date) : null, me: a, shops: shops().map(s => s.name), barbers: barbers(false).map(b => ({ name: b.name, shop: b.shop, daily: b.daily, min: b.min })), rules: shops().reduce((o, s) => (o[s.name] = { method: s.method, rate: s.rate }, o), {}), types: expenseTypes(), months: monthList(), closed: list('CLOSED_MONTHS'), paid: list('PAID_MONTHS') };
    case 'today': return todayData(p.date);
    case 'month': return monthData(p.ym, a);
    case 'daily_get': return dailyGet(p.date, p.shop);
    case 'daily_save': return dailySave(a, p);
    case 'expense_add': return expenseAdd(a, p);
    case 'expense_list': return { ok: true, rows: byDateDesc(expenseRows(p.ym)).slice(0, 200) };
    case 'cash_list': return { ok: true, rows: byDateDesc(cashRows(p.ym)), balance: cashBalance() };
    case 'pond': return pondData();
    case 'pond_paid': return pondPaid(a, p);
    case 'pond_unpay': return pondUnpay(a, p);
    case 'slip_fix': { const s = ss().getSheetByName(SH_SLIP); const row = num(p.row); if (!s || row < 2) return { ok: false, msg: 'ไม่พบสลิป' }; s.getRange(row, 5).setValue(p.amount === '' ? '' : num(p.amount)); s.getRange(row, 10).setValue('แก้โดย ' + a.name + ' ' + nowText()); return { ok: true, msg: 'แก้ยอดสลิปแล้ว', data: dailyGet(p.date, p.shop) }; }
    case 'payroll': return payrollData(p.ym);
    case 'target_set': { if (!owner) return deny(); if (!(num(p.val) > 0)) return { ok: false, msg: 'ใส่จำนวนหัวเป็นตัวเลข' }; const ok = setTarget(p.ym, p.shop, p.val); return ok ? { ok: true, msg: 'ตั้งเป้า ' + p.shop + ' ' + p.ym + ' = ' + num(p.val) + ' หัว' } : { ok: false, msg: 'ไม่พบเดือน ' + p.ym + ' หรือร้าน ' + p.shop + ' ในแผ่น ตั้งค่า (A33:D57)' }; }
    case 'close_month': if (!owner) return deny(); return closeMonth(p.ym);
    case 'paid': if (!owner) return deny(); return confirmPaid(p.ym, p.slips || {});
    case 'barber_save': if (!owner) return deny(); return barberSave(p);
    // บัญชีผู้จัดการ: manager ลง (โทรขออนุญาต owner แล้ว) · owner ดู + ตั้งยอดยกมา
    case 'bank': return bankData();
    case 'bank_out': return bankOut(a, p);
    case 'bank_cancel': return bankCancel(a, p);
    case 'bank_check': return bankCheck(a, p);
    case 'bank_open': if (!owner) return deny(); return bankOpen(p);
    // ระบบคิว + ลาหยุด (Queue.gs) · อนุมัติลา = ผู้จัดการ (ปิ๊ก) เท่านั้น · Owner ดูอย่างเดียว
    case 'q_save': case 'q_status': case 'lv_save': case 'lv_cancel': case 'lv_approve': case 'mv_save': case 'mv_cancel': a = Object.assign({}, a, { name: owner ? 'ทิพย์' : 'ปิ๊ก' }); break;
    default: break;
  }
  switch (p.api) {
    case 'q_day': return Object.assign(qDay(p.date, p.shop || shops()[0].name), { leaves: leaveList(), moves: moveList(), canLeave: !owner });
    case 'q_check': return qCheck(p, p.id || '');
    case 'q_save': return qSave(a.name, p);
    case 'q_status': return qSetStatus(a.name, p.id, p.status);
    case 'q_cust': return qCust(p.phone);
    case 'lv_save': if (owner) return { ok: false, msg: 'ลาหยุดให้ปิ๊กเป็นคนลง/อนุมัติ' }; return leaveSave(a.name, p);
    case 'lv_cancel': if (owner) return { ok: false, msg: 'ลาหยุดให้ปิ๊กเป็นคนลง/อนุมัติ' }; return leaveCancel(a.name, p.id);
    case 'lv_approve': if (owner) return { ok: false, msg: 'อนุมัติลาได้เฉพาะผู้จัดการ (ปิ๊ก)' }; return leaveApprove(a.name, p.id, !!p.ok, p.why, !!p.force);
    case 'mv_save': if (owner) return { ok: false, msg: 'ย้ายร้านให้ปิ๊กเป็นคนจัด' }; return moveSave(a.name, p);
    case 'mv_cancel': if (owner) return { ok: false, msg: 'ย้ายร้านให้ปิ๊กเป็นคนจัด' }; return moveCancel(a.name, p.id);
    default: return { ok: false, msg: 'unknown api ' + p.api };
  }
}
/** เรียงตามวันที่ (ใหม่ → เก่า) ถ้าวันเดียวกันใช้ลำดับแถว */
function byDateDesc(a) { return a.sort((x, y) => x.d < y.d ? 1 : x.d > y.d ? -1 : (y.row || 0) - (x.row || 0)); }
function deny() { return { ok: false, msg: 'เฉพาะแอดมินเท่านั้น' }; }
function list(k) { return (prop(k) || '').split(',').filter(Boolean); }
function addList(k, v) { const l = list(k); if (!l.includes(v)) l.push(v); P().setProperty(k, l.join(',')); }
function monthList() { const out = []; const d = todayBkk(); for (let i = 0; i < 14; i++) { if (ym(d) < START_YM) break; out.push(ym(d)); d.setMonth(d.getMonth() - 1); } return out; }

/* ---------- อ่านแผ่น ---------- */
function rowsOf(name, cols) { const s = sh(name); const n = s.getLastRow() - 1; return n < 1 ? [] : s.getRange(2, 1, n, cols).getValues(); }
function dailyRows(filter) { return rowsOf(SH_DAILY, D_BY).map((r, i) => ({ row: i + 2, d: dateKey(r[0]), shop: String(r[D_SHOP - 1]).trim(), name: String(r[D_NAME - 1]).trim(), heads: num(r[D_HEADS - 1]), sales: num(r[D_SALES - 1]), cash: num(r[D_CASH - 1]), transfer: num(r[D_TRANSFER - 1]), calc: num(r[D_CALC - 1]), over: r[D_OVER - 1] === '' ? '' : num(r[D_OVER - 1]), paid: num(r[D_PAID - 1]), note: String(r[D_NOTE - 1] || ''), by: String(r[D_BY - 1] || '') })).filter(x => x.d >= START_DATE && (!filter || filter(x))); }
function expenseRows(ymStr) { return rowsOf(SH_EXP, X_FROM).map((r, i) => ({ row: i + 2, d: dateKey(r[0]), shop: String(r[X_SHOP - 1]).trim(), type: String(r[X_TYPE - 1]).trim(), name: String(r[X_NAME - 1] || '').trim(), amt: num(r[X_AMT - 1]), detail: String(r[X_DETAIL - 1] || ''), by: String(r[X_BY - 1] || ''), link: String(r[X_LINK - 1] || ''), from: String(r[X_FROM - 1] || '') })).filter(x => x.d >= START_DATE && (!ymStr || x.d.slice(0, 7) === ymStr)); }
function cashRows(ymStr) { return rowsOf(SH_CASH, C_LINK).map((r, i) => ({ row: i + 2, d: dateKey(r[0]), shop: String(r[C_SHOP - 1]).trim(), method: String(r[C_METHOD - 1]), amt: num(r[C_AMT - 1]), who: String(r[C_WHO - 1] || ''), by: String(r[C_BY - 1] || ''), link: String(r[C_LINK - 1] || '') })).filter(x => x.d >= START_DATE && (!ymStr || x.d.slice(0, 7) === ymStr)); }
function gpsDist(v) { const m = /\((\d+) ม\.\)/.exec(String(v || '')); return m ? +m[1] : (String(v || '').trim() ? null : ''); }
function timeRows(filter) { return rowsOf(SH_TIME, T_GPSOUT).map(r => ({ d: dateKey(r[0]), name: String(r[T_NAME - 1]).trim(), shop: String(r[T_SHOP - 1]).trim(), shift: String(r[T_SHIFT - 1]), tin: tStr(r[T_IN - 1]), tout: tStr(r[T_OUT - 1]), late: num(r[T_LATE - 1]), distIn: gpsDist(r[T_GPSIN - 1]), distOut: gpsDist(r[T_GPSOUT - 1]), status: String(r[T_STATUS - 1] || ''), note: String(r[T_NOTE - 1] || '') })).filter(x => x.d >= START_DATE && (!filter || filter(x))); }

/* ---------- เงินสดคงเหลือควรมี ต่อร้าน ---------- */
function cashBalance(upTo) {
  const out = {}; const S = shops();
  const d = dailyRows(), x = expenseRows(), c = cashRows();
  S.forEach(s => {
    const from = s.cashFrom || '0000-00-00'; const ge = r => r.shop === s.name && r.d >= from && (!upTo || r.d <= upTo);
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
  return { ok: true, date: day, byShop, notYet, mtd, cash: cashBalance(), pond: pondData().today, recent: byDateDesc(expenseRows(ymStr)).slice(0, 8), lastCollect: byDateDesc(cashRows()).slice(0, 3), bank: (() => { try { const b = bankData(); return { balance: b.balance, open: b.open, from: b.from, last: b.days[0] || null, check: b.checks[0] || null }; } catch (e) { return null; } })(), perBarber: d.map(r => ({ name: r.name, shop: r.shop, heads: r.heads, sales: r.sales, wage: r.paid })).sort((a, b) => S.indexOf(a.shop) - S.indexOf(b.shop) || (a.name < b.name ? -1 : 1)) };
}

/* ---------- รายเดือน ---------- */
function monthData(ymStr, who) {
  ymStr = /^\d{4}-\d{2}$/.test(ymStr || '') ? ymStr : ym(todayBkk()); const S = shops().map(s => s.name);
  const d = dailyRows(r => r.d.slice(0, 7) === ymStr), x = expenseRows(ymStr), t = timeRows(r => r.d.slice(0, 7) === ymStr);
  const days = {}; d.forEach(r => { const k = r.d; days[k] = days[k] || { d: k }; days[k][r.shop] = days[k][r.shop] || { heads: 0, sales: 0 }; days[k][r.shop].heads += r.heads; days[k][r.shop].sales += r.sales; });
  const perBarber = {}; d.forEach(r => { const o = perBarber[r.name] = perBarber[r.name] || { name: r.name, days: 0, heads: 0, sales: 0, wage: 0, late: 0, lateMin: 0 }; o.days++; o.heads += r.heads; o.sales += r.sales; o.wage += r.paid; });
  t.forEach(r => { if (r.late > 0 && perBarber[r.name]) { perBarber[r.name].late++; perBarber[r.name].lateMin += r.late; } });
  const paidSet = {}; dailyPayRows().forEach(x => paidSet[x.name + '|' + x.forDate] = x.paidOn);
  const dailyNames = barbers(true).filter(b => b.daily).map(b => b.name);
  const perDay = d.slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : a.name < b.name ? -1 : 1).map(r => ({ d: r.d, name: r.name, shop: r.shop, heads: r.heads, sales: r.sales, wage: r.paid, daily: dailyNames.includes(r.name), paidOn: paidSet[r.name + '|' + r.d] || '' }));
  const tg = targets(ymStr);
  const byShop = S.map(s => { const rows = d.filter(r => r.shop === s); const ex = x.filter(r => r.shop === s && r.type !== 'เบิกช่าง'); const byType = {}; ex.forEach(r => byType[r.type] = (byType[r.type] || 0) + r.amt); const sales = rows.reduce((a, r) => a + r.sales, 0), wage = rows.reduce((a, r) => a + r.paid, 0), exp = ex.reduce((a, r) => a + r.amt, 0); return { shop: s, heads: rows.reduce((a, r) => a + r.heads, 0), target: tg[s] || 0, sales, wage, expenses: byType, expTotal: exp, profit: sales - wage - exp }; });
  const customers = who && who.role === 'owner' ? customerSummary(ymStr) : null;
  return { ok: true, ym: ymStr, days: Object.values(days).sort((a, b) => a.d < b.d ? 1 : -1), barbers: Object.values(perBarber), perDay, byShop, total: { sales: byShop.reduce((a, s) => a + s.sales, 0), wage: byShop.reduce((a, s) => a + s.wage, 0), exp: byShop.reduce((a, s) => a + s.expTotal, 0), profit: byShop.reduce((a, s) => a + s.profit, 0) }, closed: list('CLOSED_MONTHS').includes(ymStr), paid: list('PAID_MONTHS').includes(ymStr) , customers };
}

/** สรุปลูกค้ารายเดือนจากข้อความสรุปร้าน (เฉพาะ owner) — ใหม่/ประจำ + ที่มาลูกค้าใหม่ */
function customerSummary(ymStr) {
  const out = {};
  noteRows(x => x.d.slice(0, 7) === ymStr && x.customers != null).forEach(x => {
    const o = out[x.shop] = out[x.shop] || { shop: x.shop, days: 0, total: 0, newC: 0, regC: 0, noDetail: 0, sources: {} };
    o.days++; o.total += x.customers;
    if (x.newC == null) { o.noDetail += x.customers; return; }
    o.newC += x.newC; o.regC += x.regC;
    String(x.sources || '').split(',').map(s => s.replace(/เห็นจาก|มาจาก|รู้จักจาก|ผ่าน/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).forEach(s => { const k = s.toLowerCase(); o.sources[k] = (o.sources[k] || 0) + 1; });
  });
  return Object.values(out).map(o => Object.assign(o, { sources: Object.keys(o.sources).map(k => ({ src: k, n: o.sources[k] })).sort((a, b) => b.n - a.n) }));
}

/* ---------- กรอกยอดรายวัน (ปิ๊ก) ---------- */
function dailyGet(dateStr, shop) {
  const day = parseYmd(dateStr) ? dateStr : ymd(todayBkk()); const ex = dailyRows(r => r.d === day && r.shop === shop);
  // แสดงเฉพาะช่างที่ลงเวลาเข้างานร้านนี้วันนั้น + คนที่มียอดกรอกไว้แล้ว · ช่างคนอื่น (ลืมลงเวลา) เพิ่มเองได้จาก others
  const punched = timeRows(r => r.d === day && r.shop === shop && !!r.tin).map(r => r.name); // ไม่นับแถว ลา
  const names = []; punched.concat(ex.map(r => r.name)).forEach(n => { if (!names.includes(n)) names.push(n); });
  const others = barbers(false).map(b => b.name).filter(n => !names.includes(n));
  const rows = names.map(n => { const r = ex.find(e => e.name === n); const b = barberByName(n); return { name: n, main: b && b.shop === shop, punched: punched.includes(n), heads: r ? r.heads : '', sales: r ? r.sales : '', cash: r ? r.cash : '', transfer: r ? r.transfer : '', calc: r ? r.calc : '', over: r ? r.over : '', paid: r ? r.paid : '', note: r ? r.note : '', exists: !!r }; });
  rows.sort((a, b) => (b.main - a.main) || (b.punched - a.punched));
  const sl = slipRows(x => x.d === day && x.shop === shop && slipCounted(x)), bk = slipRows(x => x.d === day && x.shop === shop && x.note === 'สมุด'), tips = expenseRows().filter(x => x.d === day && x.shop === shop && x.type === 'ทิปช่าง');
  rows.forEach(r => { const m = sl.filter(x => x.name === r.name); r.slips = m.map(x => ({ row: x.row, amount: x.amount, read: x.read, link: x.link, at: x.at, note: x.note })); r.tips = tips.filter(x => x.name === r.name).reduce((a, x) => a + x.amt, 0); });
  return { ok: true, date: day, shop, rows, others, books: bk.map(x => ({ link: x.link, at: x.at, name: x.name })), shopNote: noteRows(x => x.d === day && x.shop === shop)[0] || null, cashAt: (cashBalance(day)[shop] || {}).balance, cash: cashBalance()[shop] || null };
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
function dailyPayRows() { const s = ss().getSheetByName(SH_DAILYPAY); if (!s || s.getLastRow() < 2) return []; return s.getRange(2, 1, s.getLastRow() - 1, 7).getValues().map(r => ({ paidOn: dateKey(r[0]), name: String(r[1]).trim(), forDate: dateKey(r[2]), amt: num(r[3]), by: String(r[4] || ''), link: String(r[5] || '') })).filter(x => x.forDate >= START_DATE); }
function pondData() {
  const dailyB = barbers(false).filter(b => b.daily); const paid = dailyPayRows(); const today = todayBkk(); const out = { ok: true, barbers: [], today: [] };
  // เริ่มนับโอนรายวันตั้งแต่วันเริ่มใช้ระบบ (START_DATE) — ก่อนหน้านั้นจ่ายไปแล้วนอกระบบ
  const start = START_DATE;
  dailyB.forEach(b => {
    const rows = byDateDesc(dailyRows(r => r.name === b.name && r.d >= start)).slice(0, 45).map(r => { const pd = paid.find(x => x.name === b.name && x.forDate === r.d); return { d: r.d, shop: r.shop, heads: r.heads, sales: r.sales, wage: r.paid, paid: !!pd, paidOn: pd ? pd.paidOn : '', link: pd ? pd.link : '' }; });
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
  ymStr = /^\d{4}-\d{2}$/.test(ymStr || '') ? ymStr : prevMonth(); if (ymStr < START_YM) ymStr = START_YM; const s = sh(SH_PAY);
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
  pushAdmins('🔒 ปิดงวด ' + ymStr + ' แล้ว รวมจ่ายวันที่ 2 = ' + money(pr.total) + ' บาท\n' + lines.join('\n') + '\n\nโอนเสร็จแล้วกด "โอนแล้ว" ในแอป (แนบสลิปได้) หรือพิมพ์ "โอนแล้ว ' + ymStr + '" ในไลน์', ['owner'], null, true);
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
      sent.push(p.name + (pushBarber(p.name, txt, img, true) ? ' ✓' : ' (ไม่มี LINE)'));
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

/* ---------- บัญชีผู้จัดการ (manager) — บัญชีที่รับโอนลูกค้าโลตัส ----------
 * ยอดควรมี = ยอดยกมา + เงินโอนของร้านที่ตั้งไว้ (คอลัมน์ โอน ในยอดรายวัน ที่ manager กรอก) − โอนรายวัน (ปอน) − รายการออกที่ manager ลง
 * สลิปลูกค้า (แผ่น สลิปโอน ไม่นับ ซ้ำ/สมุด/ไม่ใช่สลิป) ใช้ตรวจ — วันไหนสลิปไม่ตรงกับที่กรอก ขึ้นเตือน
 * รายการออก: manager โทรขออนุญาต owner ก่อน แล้วลงเอง (ไม่มีขั้นอนุมัติในแอป) · owner ดูใน Dashboard
 * ตั้งค่า!B75 ร้าน · B76 ยอดยกมา · B77 ณ เช้าวันที่
 * แผ่น "บัญชีผู้จัดการ": A รหัส B วันที่ C ชนิด(ออก/ยอดจริง) D ประเภท E ร้าน F ช่าง G จำนวน H รายละเอียด I สถานะ J ผู้บันทึก K บันทึกเมื่อ L ลิงก์สลิป M ยอดควรมีตอนกรอก */
const SH_BANK = 'บัญชีผู้จัดการ', BANK_FROM = 'บัญชีผู้จัดการ', BANK_OTHER = ['ส่วนตัว (ไม่ใช่ร้าน)', 'ส่งเงินให้ owner'];
function bankSheet() {
  let s = ss().getSheetByName(SH_BANK); if (s) return s;
  s = ss().insertSheet(SH_BANK); s.getRange('A1:M1').setValues([['รหัส', 'วันที่', 'ชนิด', 'ประเภท', 'ร้าน', 'ช่าง', 'จำนวน', 'รายละเอียด', 'สถานะ', 'ผู้บันทึก', 'บันทึกเมื่อ', 'ลิงก์สลิป', 'ยอดควรมีตอนกรอก']]).setFontWeight('bold'); s.setFrozenRows(1);
  s.getRange('B:B').setNumberFormat('yyyy-mm-dd'); s.getRange('G:G').setNumberFormat('#,##0'); s.getRange('M:M').setNumberFormat('#,##0'); return s;
}
function bankCfg() {
  const s = sh(SH_SET); const v = s.getRange('A75:B77').getValues();
  if (!v[0][0]) { s.getRange('A75:B77').setValues([['บัญชีผู้จัดการ: ร้านที่ลูกค้าโอนเข้า', 'โลตัส'], ['บัญชีผู้จัดการ: ยอดยกมา', ''], ['บัญชีผู้จัดการ: ณ เช้าวันที่', parseYmd(START_DATE)]]); s.getRange('B77').setNumberFormat('yyyy-mm-dd'); return { shop: 'โลตัส', open: null, from: START_DATE }; }
  return { shop: String(v[0][1]).trim() || 'โลตัส', open: v[1][1] === '' ? null : num(v[1][1]), from: dateKey(v[2][1]) || START_DATE };
}
function bankRows() {
  const s = ss().getSheetByName(SH_BANK); if (!s || s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, 13).getValues().map((r, i) => ({ row: i + 2, id: String(r[0]), d: dateKey(r[1]), kind: String(r[2]), type: String(r[3]), shop: String(r[4] || ''), name: String(r[5] || ''), amt: num(r[6]), detail: String(r[7] || ''), status: String(r[8] || ''), by: String(r[9] || ''), at: String(r[10] || ''), link: String(r[11] || ''), expect: r[12] === '' ? null : num(r[12]) })).filter(x => x.id);
}
function bankData() {
  const c = bankCfg(); const from = c.from;
  const slips = slipRows(x => x.shop === c.shop && x.d >= from && slipCounted(x) && x.amount > 0);
  const pays = dailyPayRows().filter(x => x.paidOn >= from);
  const rows = bankRows(); const outs = rows.filter(x => x.kind === 'ออก' && x.status !== 'ยกเลิก' && x.d >= from);
  const tr = dailyRows(r => r.shop === c.shop && r.d >= from && r.transfer > 0);
  const days = {}; const day = k => days[k] = days[k] || { d: k, in: 0, slip: 0, nIn: 0, pond: 0, out: 0 };
  tr.forEach(r => { day(r.d).in += r.transfer; });
  slips.forEach(x => { const o = day(x.d); o.slip += x.amount; o.nIn++; });
  pays.forEach(x => { day(x.paidOn).pond += x.amt; });
  outs.forEach(x => { day(x.d).out += x.amt; });
  const list = Object.values(days).sort((a, b) => a.d < b.d ? -1 : 1); let bal = c.open || 0; list.forEach(o => { bal += o.in - o.pond - o.out; o.bal = bal; o.warn = o.nIn > 0 && o.slip !== o.in; });
  const tot = { warn: list.filter(o => o.warn).length, in: list.reduce((a, o) => a + o.in, 0), pond: list.reduce((a, o) => a + o.pond, 0), out: list.reduce((a, o) => a + o.out, 0) };
  const balance = c.open == null ? null : c.open + tot.in - tot.pond - tot.out;
  const checks = rows.filter(x => x.kind === 'ยอดจริง' && x.status !== 'ยกเลิก').slice(-5).reverse().map(x => ({ id: x.id, d: x.d, at: x.at, by: x.by, actual: x.amt, expect: x.expect, diff: x.expect == null ? null : x.amt - x.expect, link: x.link }));
  return { ok: true, shop: c.shop, from, open: c.open, balance, tot, days: list.reverse().slice(0, 40), outs: byDateDesc(rows.filter(x => x.kind === 'ออก')).slice(0, 60).map(x => ({ id: x.id, d: x.d, type: x.type, shop: x.shop, name: x.name, amt: x.amt, detail: x.detail, status: x.status, by: x.by, at: x.at, link: x.link })), checks, types: expenseTypes().filter(t => t !== 'โบนัส').concat(BANK_OTHER) };
}
/** manager ลงรายการออก (โทรขออนุญาต owner แล้ว) · ประเภทร้าน → ลงแผ่นรายจ่ายด้วย (จ่ายจาก บัญชีผู้จัดการ) เพื่อให้ P&L / หักเบิกช่าง ถูก */
function bankOut(a, p) {
  const day = parseYmd(p.date) || todayBkk(); const type = clean(p.type, 30); const amt = num(p.amount); const detail = clean(p.detail, 150);
  const shopType = expenseTypes().includes(type) && type !== 'โบนัส';
  if (!(amt > 0)) return { ok: false, msg: 'ใส่จำนวนเงิน' };
  if (!shopType && !BANK_OTHER.includes(type)) return { ok: false, msg: 'ประเภทไม่ถูกต้อง' };
  if (!detail) return { ok: false, msg: 'ใส่รายละเอียด (ใช้ทำอะไร)' };
  const shop = shopType ? clean(p.shop, 20) : ''; if (shopType && !shops().find(s => s.name === shop)) return { ok: false, msg: 'เลือกร้าน' };
  const name = type === 'เบิกช่าง' || type === 'ค่าแรงพิเศษ' ? clean(p.name, 30) : ''; if (type === 'เบิกช่าง' && !name) return { ok: false, msg: 'เบิกช่าง ต้องเลือกชื่อช่าง' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    let link = ''; if (p.image) { const f = saveImage(p.image, 'บัญชีผู้จัดการ ' + ym(day), ymd(day) + ' ' + type + ' ' + money(amt), false); if (f) link = f.url; }
    const id = 'B' + seq('B_SEQ'); const s = bankSheet();
    s.appendRow([id, day, 'ออก', type, shop, name, amt, detail, 'บันทึก', a.name, nowText(), link, '']);
    if (shopType) { const x = sh(SH_EXP); const row = x.getLastRow() + 1; x.getRange(row, 1, 1, X_LINK).setValues([[day, shop, type, name, amt, detail + ' [#' + id + ']', a.name, link]]); x.getRange(row, X_FROM).setValue(BANK_FROM); x.getRange(row, X_DATE).setNumberFormat('yyyy-mm-dd'); }
    if (type === 'เบิกช่าง') pushBarber(name, '📝 บันทึกเบิกล่วงหน้า ' + money(amt) + ' บาท (' + ymd(day) + ') จะหักจากค่าแรงสิ้นเดือน');
    return { ok: true, msg: 'บันทึก #' + id + ' ' + type + ' ' + money(amt) + ' บาท', data: bankData() };
  } finally { lock.releaseLock(); }
}
/** ยกเลิกรายการ (ลงผิด) — สถานะ ยกเลิก + ลบแถวรายจ่ายที่ผูกไว้ (ล้างค่า ไม่ลบแถว เพื่อไม่กระทบสูตร) */
function bankCancel(a, p) {
  if (a.role === 'owner') return { ok: false, msg: 'owner ดูอย่างเดียว — ให้ manager ยกเลิก' };
  const id = clean(p.id, 12); const r = bankRows().find(x => x.id === id); if (!r) return { ok: false, msg: 'ไม่พบรายการ' };
  if (r.status === 'ยกเลิก') return { ok: false, msg: 'ยกเลิกไปแล้ว' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const s = bankSheet(); s.getRange(r.row, 9).setValue('ยกเลิก'); s.getRange(r.row, 11).setValue(r.at + ' · ยกเลิกโดย ' + a.name + ' ' + nowText());
    const x = sh(SH_EXP); const tag = '[#' + id + ']'; const n = x.getLastRow() - 1;
    if (n > 0) x.getRange(2, X_DETAIL, n, 1).getValues().forEach((v, i) => { if (String(v[0]).indexOf(tag) >= 0) { x.getRange(i + 2, 1, 1, X_LINK).clearContent(); x.getRange(i + 2, X_FROM).clearContent(); } });
    return { ok: true, msg: 'ยกเลิก #' + id + ' แล้ว', data: bankData() };
  } finally { lock.releaseLock(); }
}
/** กรอกยอดจริงจากแอปธนาคาร → เก็บยอดควรมี ณ ตอนนั้น เพื่อดูส่วนต่าง */
function bankCheck(a, p) {
  if (p.amount === '' || p.amount == null || !isFinite(Number(p.amount))) return { ok: false, msg: 'ใส่ยอดในแอปธนาคาร' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const exp = bankData().balance; const today = todayBkk();
    let link = ''; if (p.image) { const f = saveImage(p.image, 'บัญชีผู้จัดการ ' + ym(today), ymd(today) + ' ยอดจริง', false); if (f) link = f.url; }
    const id = 'B' + seq('B_SEQ'); bankSheet().appendRow([id, today, 'ยอดจริง', '', '', '', num(p.amount), '', 'บันทึก', a.name, nowText(), link, exp == null ? '' : exp]);
    const d = exp == null ? null : num(p.amount) - exp;
    return { ok: true, msg: d == null ? 'บันทึกยอดจริงแล้ว (ยังไม่ได้ตั้งยอดยกมา)' : d === 0 ? 'ยอดตรง ✓' : 'ส่วนต่าง ' + (d > 0 ? '+' : '') + money(d) + ' บาท', data: bankData() };
  } finally { lock.releaseLock(); }
}
/** owner ตั้งยอดยกมา (ยอดในบัญชี ณ เช้าวันที่ …) */
function bankOpen(p) {
  const d = parseYmd(p.date); if (!d) return { ok: false, msg: 'วันที่ไม่ถูกต้อง' }; if (p.amount === '' || !isFinite(Number(p.amount))) return { ok: false, msg: 'ใส่ยอด' };
  bankCfg(); const s = sh(SH_SET); s.getRange('B76').setValue(num(p.amount)); s.getRange('B77').setValue(d).setNumberFormat('yyyy-mm-dd');
  return { ok: true, msg: 'ตั้งยอดยกมา ' + money(p.amount) + ' ณ เช้า ' + p.date, data: bankData() };
}
