/** Queue.gs — ระบบจองคิว + ลาหยุด
 * แผ่น "คิว": A วันที่ B เริ่ม C จบ D ร้าน E ช่าง F ลูกค้า G เบอร์ H ช่องทาง I สถานะ J ผู้ลง K ลงเมื่อ L รหัส M แจ้งกลุ่มเมื่อ N หมายเหตุ
 * ลาหยุด = แถวในแผ่น ลงเวลา สถานะ "ลา" (อนุมัติแล้ว) หรือ "รออนุมัติลา" (ช่างขอ รอปิ๊กอนุมัติ) · หมายเหตุ "#L7 · เหตุผล · ลงโดย X"
 * ปิ๊ก (Manager) อนุมัติ/ไม่อนุมัติ · ทิพย์ (Owner) ดูอย่างเดียว · ปิ๊กลงลาให้ช่าง = อนุมัติทันที
 * ตั้งค่า: K5:K24 วันหยุดประจำ (จ,อ,พ,พฤ,ศ,ส,อา) · L5:L24 ร้านตามวัน (เช่น "พ=Kraft") · M28:M30 นาทีต่อคิว
 * แจ้งกลุ่ม: คนลงคิวกดส่งข้อความ #Q.. เข้ากลุ่ม → OA reply (ฟรี ไม่ใช้โควตา push)
 */
const SH_Q = 'คิว';
const Q_HEAD = ['วันที่', 'เริ่ม', 'จบ', 'ร้าน', 'ช่าง', 'ลูกค้า', 'เบอร์', 'ช่องทาง', 'สถานะ', 'ผู้ลง', 'ลงเมื่อ', 'รหัส', 'แจ้งกลุ่มเมื่อ', 'หมายเหตุ'];
const Q_ACTIVE = ['จอง', 'มาแล้ว'], Q_STATUS = ['จอง', 'มาแล้ว', 'ไม่มา', 'ยกเลิก'];
const Q_CHANNELS = ['โทร', 'LINE', 'Facebook', 'ช่างรับเอง', 'อื่นๆ'];
const LEAVE_REASONS = ['ลากิจ', 'ลาป่วย', 'ลาพักร้อน', 'อื่นๆ'];
const LV_OK = 'ลา', LV_WAIT = 'รออนุมัติลา', LV_ST = [LV_OK, LV_WAIT];
const WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const WD_FULL = { 'อาทิตย์': 0, 'จันทร์': 1, 'อังคาร': 2, 'พุธ': 3, 'พฤหัส': 4, 'พฤหัสบดี': 4, 'ศุกร์': 5, 'เสาร์': 6 };
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/* ---------- เครื่องมือ ---------- */
function toMin(t) { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : -1; }
function fromMin(x) { return ('0' + Math.floor(x / 60)).slice(-2) + ':' + ('0' + (x % 60)).slice(-2); }
function wdOf(dStr) { const d = parseYmd(dStr); return d ? d.getDay() : -1; }
function thDay(dStr) { const d = parseYmd(dStr); return d ? WD[d.getDay()] + '. ' + d.getDate() + ' ' + TH_MON[d.getMonth()] : dStr; }
function addDays(dStr, n) { const d = parseYmd(dStr); d.setDate(d.getDate() + n); return ymd(d); }
function nowMin() { return +Utilities.formatDate(new Date(), TZ, 'H') * 60 + +Utilities.formatDate(new Date(), TZ, 'm'); }
function seq(k) { const n = num(prop(k)) + 1; P().setProperty(k, String(n)); return n; } // เรียกภายใต้ lock เท่านั้น
function parseWd(s) { const out = []; String(s || '').split(/[,\s/]+/).forEach(t => { t = t.replace(/\.$/, '').trim(); if (!t) return; let i = WD.indexOf(t); if (i < 0 && t in WD_FULL) i = WD_FULL[t]; if (i >= 0 && !out.includes(i)) out.push(i); }); return out; }

/** วันหยุดประจำ + ร้านตามวัน จาก ตั้งค่า K:L */
function barberExtra() {
  if (_M.bex) return _M.bex;
  const rows = sh(SH_SET).getRange(B_ROW0, 1, B_ROWS, 12).getValues(); const out = {};
  rows.forEach(r => { const nm = String(r[0]).trim(); if (!nm) return; const alt = {};
    String(r[11] || '').split(/[,;]+/).forEach(p => { const m = /^\s*([^=:]+)\s*[=:]\s*(.+?)\s*$/.exec(p); if (m) parseWd(m[1]).forEach(i => alt[i] = m[2]); });
    out[nm] = { off: parseWd(r[10]), offText: String(r[10] || '').trim(), alt }; });
  return _M.bex = out;
}
/** นาทีต่อคิวของร้าน (ตั้งค่า!M28:M30) — ว่าง = 40 (Kraft/ต่อหัว = 50) */
function qDur(shopName) {
  if (!_M.qdur) { const v = sh(SH_SET).getRange(S_ROW0, 13, S_ROWS, 1).getValues(); _M.qdur = {}; shops().forEach((s, i) => _M.qdur[s.name] = num(v[i] && v[i][0]) || (s.method === 'ต่อหัว' ? 50 : 40)); }
  return _M.qdur[shopName] || 40;
}
function qSheet() {
  let s = ss().getSheetByName(SH_Q);
  if (!s) { s = ss().insertSheet(SH_Q); s.getRange(1, 1, 1, Q_HEAD.length).setValues([Q_HEAD]).setFontWeight('bold'); s.setFrozenRows(1); s.getRange('A:A').setNumberFormat('yyyy-mm-dd'); s.getRange('B:C').setNumberFormat('@'); s.getRange('G:G').setNumberFormat('@'); }
  return s;
}
function qRows(filter) {
  const s = qSheet(); const n = s.getLastRow() - 1; if (n < 1) return [];
  return s.getRange(2, 1, n, Q_HEAD.length).getValues().map((r, i) => ({ row: i + 2, d: dateKey(r[0]), start: tStr(r[1]), end: tStr(r[2]), shop: String(r[3]).trim(), name: String(r[4]).trim(), cust: String(r[5] || ''), phone: String(r[6] || ''), ch: String(r[7] || ''), status: String(r[8] || 'จอง').trim(), by: String(r[9] || ''), at: String(r[10] || ''), id: String(r[11] || ''), sent: String(r[12] || ''), note: String(r[13] || '') })).filter(x => x.id && (!filter || filter(x)));
}
function qById(id) { id = String(id || '').trim().toUpperCase(); if (!/^Q\d+$/.test(id)) return null; return qRows(x => x.id === id)[0] || null; }
function lvReason(note) { return (/·\s*([^·]+?)\s*·/.exec(String(note || '')) || [])[1] || ''; }
function leaveRows(filter) { return timeRows(r => LV_ST.includes(r.status) && !r.tin).map(r => { const m = /#L(\d+)/.exec(r.note); return Object.assign(r, { lid: m ? 'L' + m[1] : '', reason: lvReason(r.note), approved: r.status === LV_OK }); }).filter(r => !filter || filter(r)); }

/** สถานะช่างทุกคนในวันนั้น: อยู่ร้านไหน หยุด/ลาไหม */
function dayRoster(dStr) {
  const wd = wdOf(dStr), ex = barberExtra(), t = timeRows(r => r.d === dStr);
  return barbers(false).map(b => {
    const e = ex[b.name] || { off: [], alt: {} };
    const in_ = t.find(r => r.name === b.name && r.tin), lv = t.find(r => r.name === b.name && LV_ST.includes(r.status) && !r.tin);
    const at = in_ ? in_.shop : (e.alt[wd] || b.shop);
    let off = '', pend = ''; if (!in_) { if (lv && lv.status === LV_OK) off = lvReason(lv.note) || 'ลา'; else if (e.off.includes(wd)) off = 'หยุดประจำ'; if (!off && lv) pend = 'ขอ' + (lvReason(lv.note) || 'ลา') + ' (รออนุมัติ)'; }
    return { name: b.name, home: b.shop, at, off, pend, punched: in_ ? in_.tin : '' };
  });
}
function shopHours(shopName) { const s = shops().find(x => x.name === shopName); return s ? { open: s.open1 || '10:00', close: s.close || '21:00' } : null; }

/** ตรวจก่อนบันทึก → {ok, block?, warn?, msg, suggest:[{time}], others:[name]} */
function qCheck(p, excludeId) {
  const d = String(p.date || ''), shop = String(p.shop || '').trim(), name = String(p.barber || '').trim();
  if (!parseYmd(d)) return { ok: false, block: true, msg: 'เลือกวันที่' };
  const hrs = shopHours(shop); if (!hrs) return { ok: false, block: true, msg: 'ไม่พบร้าน ' + shop };
  const dur = qDur(shop) * Math.max(1, Math.min(3, num(p.slots) || 1)); const s = toMin(p.time), e = s + dur;
  if (s < 0) return { ok: false, block: true, msg: 'เลือกเวลา' };
  const today = ymd(todayBkk());
  if (d < today || (d === today && s < nowMin() - 30)) return { ok: false, block: true, msg: '⛔ เวลานี้ผ่านไปแล้ว' };
  if (s < toMin(hrs.open) || e > toMin(hrs.close)) return { ok: false, block: true, msg: '⛔ ร้าน ' + shop + ' รับคิว ' + hrs.open + '–' + fromMin(toMin(hrs.close) - dur) + ' (ปิด ' + hrs.close + ')' };
  const roster = dayRoster(d); const me = roster.find(r => r.name === name); if (!me) return { ok: false, block: true, msg: 'ไม่พบช่าง ' + name };
  const free = n => { const r = roster.find(x => x.name === n); return r && !r.off; };
  const busy = qRows(x => x.d === d && Q_ACTIVE.includes(x.status) && x.id !== excludeId);
  const clash = (n, a, b) => busy.find(x => x.name === n && toMin(x.start) < b && a < toMin(x.end));
  const others = roster.filter(r => r.name !== name && r.at === shop && !r.off && !clash(r.name, s, e)).map(r => r.name);
  const suggest = () => { const out = [], lo = Math.max(toMin(hrs.open), d === today ? Math.ceil(nowMin() / 10) * 10 : 0), hi = toMin(hrs.close) - dur; const c = []; for (let t = lo; t <= hi; t += 10) if (!clash(name, t, t + dur)) c.push(t); c.sort((a, b) => Math.abs(a - s) - Math.abs(b - s) || a - b); return c.slice(0, 3).sort((a, b) => a - b).map(fromMin); };
  if (me.off) return { ok: false, block: true, msg: '⛔ ' + name + ' ' + me.off + ' ' + thDay(d) + ' — จองไม่ได้', others };
  const c = clash(name, s, e);
  if (c) return { ok: false, block: true, msg: '⛔ ' + name + ' มีคิว ' + c.start + '–' + c.end + ' แล้ว (' + (c.cust || '-') + (c.shop !== shop ? ' · ร้าน ' + c.shop : '') + ')', suggest: suggest(), others };
  const warns = []; if (me.pend) warns.push(name + ' ' + me.pend + ' ' + thDay(d)); if (me.at !== shop) warns.push(thDay(d) + ' ' + name + ' ประจำร้าน ' + me.at);
  if (warns.length && !p.force) return { ok: false, warn: true, msg: '⚠️ ' + warns.join('\n⚠️ ') + '\nยืนยันจองที่ร้าน ' + shop + '?', others };
  return { ok: true, start: fromMin(s), end: fromMin(e) };
}

/** บันทึก/แก้คิว · by = ชื่อผู้ลง · onlyBarber = ช่างลงเอง (จองให้ตัวเองเท่านั้น) */
function qSave(by, p, onlyBarber) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    clearMemo();
    if (onlyBarber) p.barber = onlyBarber;
    const cust = clean(p.cust, 40), phone = clean(p.phone, 20).replace(/[^\d+\- ]/g, '');
    if (!cust) return { ok: false, msg: 'ใส่ชื่อลูกค้า' };
    let old = null; if (p.id) { old = qById(p.id); if (!old) return { ok: false, msg: 'ไม่พบคิว ' + p.id }; if (onlyBarber && old.name !== onlyBarber) return { ok: false, msg: 'แก้ได้เฉพาะคิวของตัวเอง' }; if (!Q_ACTIVE.includes(old.status)) return { ok: false, msg: 'คิวนี้' + old.status + 'แล้ว' }; }
    const chk = qCheck(p, old ? old.id : ''); if (!chk.ok) return chk;
    const ch = Q_CHANNELS.includes(p.ch) ? p.ch : (onlyBarber ? 'ช่างรับเอง' : 'โทร');
    const s = qSheet(); const id = old ? old.id : 'Q' + seq('Q_SEQ'); const row = old ? old.row : s.getLastRow() + 1;
    const vals = [[parseYmd(p.date), chk.start, chk.end, p.shop, p.barber, cust, phone, ch, 'จอง', old ? old.by : by, old ? old.at : nowText(), id, '', clean(p.note, 100) + (old ? (p.note ? ' · ' : '') + 'เลื่อนโดย ' + by + ' ' + nowText() : '')]];
    s.getRange(row, 2, 1, 2).setNumberFormat('@'); s.getRange(row, 7).setNumberFormat('@');
    s.getRange(row, 1, 1, Q_HEAD.length).setValues(vals); s.getRange(row, 1).setNumberFormat('yyyy-mm-dd');
    const b = qById(id);
    return { ok: true, id, msg: (old ? '✏️ เลื่อนคิว ' : '✅ จองคิว ') + id + ' · ' + p.barber + ' ' + thDay(p.date) + ' ' + chk.start + '–' + chk.end, share: qShareText(b, old ? 'edit' : 'new'), booking: b };
  } finally { lock.releaseLock(); }
}
function qSetStatus(by, id, status, onlyBarber) {
  if (!Q_STATUS.includes(status)) return { ok: false, msg: 'สถานะไม่ถูกต้อง' };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const b = qById(id); if (!b) return { ok: false, msg: 'ไม่พบคิว ' + id };
    if (onlyBarber && b.name !== onlyBarber) return { ok: false, msg: 'แก้ได้เฉพาะคิวของตัวเอง' };
    const s = qSheet(); s.getRange(b.row, 9).setValue(status);
    if (status === 'ยกเลิก') s.getRange(b.row, 14).setValue((b.note ? b.note + ' · ' : '') + 'ยกเลิกโดย ' + by + ' ' + nowText());
    const nb = qById(id);
    return { ok: true, msg: id + ' → ' + status, booking: nb, share: status === 'ยกเลิก' ? qShareText(nb, 'cancel') : '' };
  } finally { lock.releaseLock(); }
}
/** ข้อความที่คนลงคิวส่งเข้ากลุ่ม (มีรหัส #Q ให้ OA reply) */
function qShareText(b, kind) {
  if (!b) return '';
  const head = kind === 'cancel' ? '❌ ยกเลิกคิว #' : kind === 'edit' ? '✏️ เลื่อนคิว #' : '📅 จองคิว #';
  return head + b.id + '\n' + b.shop + ' · ' + b.name + '\n' + thDay(b.d) + ' ' + b.start + '–' + b.end + '\n' + b.cust + (b.phone ? ' ' + b.phone : '') + (b.ch ? ' (' + b.ch + ')' : '') + '\nลงโดย ' + b.by;
}

/* ---------- วันเดียว (ตาราง) ---------- */
function qDay(dStr, shop) {
  dStr = parseYmd(dStr) ? dStr : ymd(todayBkk()); clearMemo();
  const hrs = shopHours(shop) || { open: '10:00', close: '21:00' }; const roster = dayRoster(dStr);
  const rows = qRows(x => x.d === dStr && x.status !== 'ยกเลิก');
  const show = roster.filter(r => r.at === shop || rows.some(x => x.shop === shop && x.name === r.name));
  return { ok: true, date: dStr, label: thDay(dStr), shop, open: hrs.open, close: hrs.close, dur: qDur(shop), channels: Q_CHANNELS, reasons: LEAVE_REASONS,
    barbers: show.map(r => Object.assign(r, { q: rows.filter(x => x.name === r.name).sort((a, b) => a.start < b.start ? -1 : 1).map(x => Object.assign(x, { share: qShareText(x, 'new') })) })),
    elsewhere: roster.filter(r => !show.includes(r)).map(r => ({ name: r.name, at: r.at, off: r.off })),
    unsent: qRows(x => x.d >= ymd(todayBkk()) && Q_ACTIVE.includes(x.status) && !x.sent).length };
}
/** ค้นลูกค้าจากเบอร์ */
function qCust(phone) {
  const k = String(phone || '').replace(/\D/g, ''); if (k.length < 9) return { ok: true, found: false };
  const h = qRows(x => x.phone.replace(/\D/g, '') === k); if (!h.length) return { ok: true, found: false };
  const last = h[h.length - 1];
  return { ok: true, found: true, cust: last.cust, visits: h.filter(x => x.status === 'มาแล้ว').length, noshow: h.filter(x => x.status === 'ไม่มา').length, last: last.d, barber: last.name };
}

/* ---------- ลาหยุด ---------- */
/** p = {barber, from, to, reason, note, force} · onlyBarber = ช่างขอเอง → รออนุมัติ · ปิ๊ก/ทิพย์ลงให้ → อนุมัติทันที */
function leaveSave(by, p, onlyBarber) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    clearMemo(); const name = onlyBarber || String(p.barber || '').trim(); const b = barberByName(name); if (!b) return { ok: false, msg: 'ไม่พบช่าง ' + name };
    const from = String(p.from || ''), to = String(p.to || p.from || ''); if (!parseYmd(from) || !parseYmd(to) || to < from) return { ok: false, msg: 'เลือกวันลา' };
    const today = ymd(todayBkk()); if (from < today && onlyBarber) return { ok: false, msg: 'ลาย้อนหลังไม่ได้ — แจ้งปิ๊ก' };
    const days = []; for (let d = from; d <= to && days.length < 31; d = addDays(d, 1)) days.push(d);
    const reason = LEAVE_REASONS.includes(p.reason) ? p.reason : 'ลากิจ';
    const had = timeRows(r => r.name === name && days.includes(r.d)); const skip = [];
    const todo = days.filter(d => { const x = had.find(r => r.d === d); if (x) { skip.push(thDay(d) + (x.tin ? ' (เข้างานแล้ว)' : ' (ลาไว้แล้ว)')); return false; } return true; });
    if (!todo.length) return { ok: false, msg: 'ไม่มีวันที่ลงได้: ' + skip.join(', ') };
    const qs = qRows(x => x.name === name && todo.includes(x.d) && x.status === 'จอง').sort((x, y) => (x.d + x.start) < (y.d + y.start) ? -1 : 1); const st = onlyBarber ? LV_WAIT : LV_OK;
    if (qs.length && !p.force) return { ok: false, needConfirm: true, msg: '⚠️ ' + name + ' มีคิวลูกค้า ' + qs.length + ' คิวในวันลา:\n' + qs.map(x => '• ' + thDay(x.d) + ' ' + x.start + ' ' + x.cust).join('\n') + '\n\nลงลาต่อ? (ต้องย้ายคิวลูกค้า)' };
    const lid = 'L' + seq('L_SEQ'); const ex = barberExtra()[name] || { alt: {} };
    const t = sh(SH_TIME); let row = t.getLastRow() + 1;
    const vals = todo.map(d => [parseYmd(d), name, ex.alt[wdOf(d)] || b.shop, '', '', '', 0, st, '#' + lid + ' · ' + reason + ' · ลงโดย ' + by + (p.note ? ' · ' + clean(p.note, 60) : ''), '', '']);
    t.getRange(row, 1, vals.length, T_GPSOUT).setValues(vals); t.getRange(row, T_DATE, vals.length, 1).setNumberFormat('yyyy-mm-dd');
    const range = thDay(todo[0]) + (todo.length > 1 ? ' – ' + thDay(todo[todo.length - 1]) + ' (' + todo.length + ' วัน)' : '');
    return { ok: true, id: lid, msg: (onlyBarber ? '📝 ส่งคำขอ' : '🏖️ บันทึก') + reason + ' ' + name + ' ' + range + (onlyBarber ? ' — รอปิ๊กอนุมัติ' : '') + (skip.length ? '\nข้าม: ' + skip.join(', ') : '') + (qs.length ? '\n⚠️ คิวค้าง ' + qs.length + ' คิว ต้องย้าย' : ''),
      share: (onlyBarber ? '📝 ขอลาหยุด #' : '🏖️ ลาหยุด #') + lid + '\n' + name + ' · ' + range + '\n' + reason + (p.note ? ' · ' + clean(p.note, 60) : '') + '\nลงโดย ' + by };
  } finally { lock.releaseLock(); }
}
function leaveCancel(by, lid, onlyBarber) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    lid = String(lid || '').toUpperCase(); const t = sh(SH_TIME); const n = t.getLastRow() - 1; if (n < 1) return { ok: false, msg: 'ไม่พบ' };
    const v = t.getRange(2, 1, n, T_GPSOUT).getValues(); const rows = []; let name = '';
    v.forEach((r, i) => { if (LV_ST.includes(String(r[T_STATUS - 1])) && !tStr(r[T_IN - 1]) && new RegExp('#' + lid + '(?!\\d)').test(String(r[T_NOTE - 1]))) { rows.push(i + 2); name = String(r[T_NAME - 1]).trim(); } });
    if (!rows.length) return { ok: false, msg: 'ไม่พบใบลา ' + lid };
    if (onlyBarber && name !== onlyBarber) return { ok: false, msg: 'ยกเลิกได้เฉพาะใบลาของตัวเอง' };
    rows.reverse().forEach(r => t.deleteRow(r));
    return { ok: true, msg: 'ยกเลิกใบลา ' + lid + ' ของ ' + name + ' แล้ว', share: '↩️ ยกเลิกลา #' + lid + '\n' + name + '\nลงโดย ' + by };
  } finally { lock.releaseLock(); }
}
/** ปิ๊ก อนุมัติ (ok=true) / ไม่อนุมัติ (ok=false → ลบแถว) */
function leaveApprove(by, lid, ok, why) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    lid = String(lid || '').toUpperCase(); const t = sh(SH_TIME); const n = t.getLastRow() - 1; if (n < 1) return { ok: false, msg: 'ไม่พบ' };
    const v = t.getRange(2, 1, n, T_GPSOUT).getValues(); const rows = []; let name = '', reason = ''; const days = [];
    v.forEach((r, i) => { if (String(r[T_STATUS - 1]) === LV_WAIT && !tStr(r[T_IN - 1]) && new RegExp('#' + lid + '(?!\\d)').test(String(r[T_NOTE - 1]))) { rows.push(i + 2); name = String(r[T_NAME - 1]).trim(); reason = lvReason(r[T_NOTE - 1]); days.push(dateKey(r[0])); } });
    if (!rows.length) return { ok: false, msg: 'ไม่พบคำขอลา ' + lid + ' ที่รออนุมัติ (อาจอนุมัติ/ยกเลิกไปแล้ว)' };
    days.sort(); const range = thDay(days[0]) + (days.length > 1 ? ' – ' + thDay(days[days.length - 1]) : '');
    if (ok) { rows.forEach(r => { t.getRange(r, T_STATUS).setValue(LV_OK); const c = t.getRange(r, T_NOTE); c.setValue(String(c.getValue()) + ' · อนุมัติโดย ' + by + ' ' + nowText()); }); }
    else { rows.reverse().forEach(r => t.deleteRow(r)); const l = list('LV_REJECT').slice(-49); l.push(lid + ':' + clean(why, 40).replace(/[,:]/g, ' ')); P().setProperty('LV_REJECT', l.join(',')); }
    return { ok: true, msg: (ok ? '✅ อนุมัติ' : '❌ ไม่อนุมัติ') + reason + ' ' + name + ' ' + range, share: (ok ? '✅ อนุมัติลา #' : '❌ ไม่อนุมัติลา #') + lid + '\n' + name + ' · ' + range + (!ok && why ? '\nเหตุผล: ' + clean(why, 60) : '') + '\nโดย ' + by };
  } finally { lock.releaseLock(); }
}
function leaveList(name) { const today = ymd(todayBkk()); const r = leaveRows(x => x.d >= today && (!name || x.name === name)); const g = {}; r.forEach(x => { const k = x.lid || x.d + x.name; (g[k] = g[k] || { id: x.lid, name: x.name, reason: x.reason, approved: x.approved, note: x.note, days: [] }).days.push(x.d); }); return Object.values(g).map(x => Object.assign(x, { label: thDay(x.days[0]) + (x.days.length > 1 ? ' – ' + thDay(x.days[x.days.length - 1]) : '') })).sort((a, b) => a.days[0] < b.days[0] ? -1 : 1); }

/* ---------- ฝั่งช่าง (Staff API) ---------- */
function qMyDay(tok, dStr) {
  const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา กรุณากดเมนูในไลน์ใหม่' };
  dStr = parseYmd(dStr) ? dStr : ymd(todayBkk()); clearMemo();
  const me = dayRoster(dStr).find(r => r.name === b.name) || { at: b.shop, off: '' }; const shop = me.at; const hrs = shopHours(shop) || {};
  return { ok: true, date: dStr, label: thDay(dStr), name: b.name, shop, off: me.off, open: hrs.open, close: hrs.close, dur: qDur(shop), shops: shops().map(s => s.name), reasons: LEAVE_REASONS,
    q: qRows(x => x.d === dStr && x.name === b.name && x.status !== 'ยกเลิก').sort((a, c) => a.start < c.start ? -1 : 1).map(x => Object.assign(x, { share: qShareText(x, 'new') })), leaves: leaveList(b.name) };
}
function qBook(tok, p) { const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา' }; p = p || {}; if (!p.ch) p.ch = 'ช่างรับเอง'; return qSave(b.name, p, b.name); }
function qMark(tok, id, status) { const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา' }; return qSetStatus(b.name, id, status, b.name); }
function qCheckMe(tok, p) { const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา' }; p = p || {}; p.barber = b.name; return qCheck(p, p.id || ''); }
function leaveMe(tok, p) { const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา' }; return leaveSave(b.name, p || {}, b.name); }
function leaveCancelMe(tok, lid) { const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา' }; return leaveCancel(b.name, lid, b.name); }

/* ---------- LINE: reply ในกลุ่ม (ฟรี) ---------- */
function qDayLine(name, dStr) { const q = qRows(x => x.d === dStr && x.name === name && Q_ACTIVE.includes(x.status)).sort((a, b) => a.start < b.start ? -1 : 1); return q.length ? q.map(x => x.start + ' ' + x.cust).join(' · ') : '-'; }
function qReplyFor(id) {
  const b = qById(id); if (!b) return '❓ ไม่พบคิว #' + id;
  if (!b.sent) qSheet().getRange(b.row, 13).setValue(nowText());
  const when = thDay(b.d) + ' ' + b.start + '–' + b.end + ' (' + b.shop + ')';
  if (b.status === 'ยกเลิก') return '🔓 ยกเลิกคิว #' + b.id + '\n' + b.name + ' ว่างแล้ว ' + when;
  if (b.status === 'มาแล้ว' || b.status === 'ไม่มา') return (b.status === 'มาแล้ว' ? '✓' : '✗') + ' #' + b.id + ' ' + b.name + ' · ' + b.cust + ' — ' + b.status;
  return '🔒 ' + b.name + ' ไม่ว่าง ' + when + '\nลูกค้า: ' + b.cust + (b.phone ? ' ' + b.phone : '') + ' · ลงโดย ' + b.by + '\nคิว ' + b.name + ' วันนั้น: ' + qDayLine(b.name, b.d) + '\n⛔ ห้ามรับคิวทับช่วงนี้';
}
function leaveReplyFor(lid) {
  const r = leaveRows(x => x.lid === lid);
  if (!r.length) { const rj = list('LV_REJECT').map(x => x.split(':')).find(x => x[0] === lid); return rj ? '❌ ไม่อนุมัติลา #' + lid + (rj[1] ? ' (' + rj[1] + ')' : '') + ' — มาทำงานตามปกติ จองคิวได้' : '↩️ ใบลา #' + lid + ' ถูกยกเลิกแล้ว — จองคิวได้ตามปกติ'; }
  const name = r[0].name, days = r.map(x => x.d).sort(); const qs = qRows(x => x.name === name && days.includes(x.d) && x.status === 'จอง');
  if (!r[0].approved) return '📝 ' + name + ' ขอ' + (r[0].reason || 'ลา') + ' ' + days.map(thDay).join(', ') + '\n⏳ รอปิ๊กอนุมัติในแอป (ระหว่างนี้จองคิว ' + name + ' วันนั้นได้แต่จะมีคำเตือน)' + (qs.length ? '\n⚠️ มีคิวลูกค้าวันนั้น ' + qs.length + ' คิว' : '');
  return '🚫 ' + name + ' ' + (r[0].reason || 'ลา') + ' ' + days.map(thDay).join(', ') + ' (อนุมัติแล้ว)\nวันนั้นจองคิว ' + name + ' ไม่ได้' + (qs.length ? '\n⚠️ คิวค้างต้องย้าย ' + qs.length + ' คิว:\n' + qs.map(x => '• #' + x.id + ' ' + thDay(x.d) + ' ' + x.start + ' ' + x.cust).join('\n') : '');
}
/** ช่างพิมพ์ "คิว" ในแชท OA → คิวของตัวเองวันนี้ + พรุ่งนี้ */
function qMineText(name) { const d0 = ymd(todayBkk()); return [d0, addDays(d0, 1)].map(d => { const r = dayRoster(d).find(x => x.name === name) || {}; return '📅 ' + thDay(d) + (r.at ? ' · ' + r.at : '') + '\n' + (r.off ? '🏖️ ' + r.off : (r.pend ? '⏳ ' + r.pend + '\n' : '') + qDayLine(name, d)); }).join('\n\n'); }
/** "คิว" · "คิว ราม" · "คิว พรุ่งนี้" · "คิว 2026-11-08" */
function qBoardText(arg) {
  let d = ymd(todayBkk()), shop = '';
  String(arg || '').split(/\s+/).filter(Boolean).forEach(w => { if (w === 'พรุ่งนี้') d = addDays(d, 1); else if (parseYmd(w)) d = w; else { const s = shops().find(x => x.name.toLowerCase() === w.toLowerCase()); if (s) shop = s.name; } });
  const roster = dayRoster(d); const rows = qRows(x => x.d === d && Q_ACTIVE.includes(x.status));
  const out = ['📅 คิว ' + thDay(d)];
  shops().filter(s => !shop || s.name === shop).forEach(s => {
    const bs = roster.filter(r => r.at === s.name); if (!bs.length) return; out.push('', '【' + s.name + '】');
    bs.forEach(r => { const q = rows.filter(x => x.name === r.name).sort((a, b) => a.start < b.start ? -1 : 1); out.push('• ' + r.name + ': ' + (r.off ? '🏖️ ' + r.off : (r.pend ? '⏳ ' + r.pend + ' · ' : '') + (q.length ? q.map(x => x.start + '–' + x.end + ' ' + x.cust).join(', ') : 'ว่างทั้งวัน'))); });
  });
  return out.join('\n');
}
/** webhook จากกลุ่ม: ตอบเฉพาะข้อความที่มี #Q/#L หรือคำสั่ง "คิว" (นอกนั้นเงียบ) */
function groupEvent(ev) {
  const src = ev.source || {}; const gid = src.groupId || src.roomId || '';
  if (gid && prop('GROUP_ID') !== gid && (ev.type === 'join' || ev.type === 'message')) P().setProperty('GROUP_ID', gid);
  if (ev.type === 'join') { lineReply(ev.replyToken, '✂️ ระบบคิวเข้ากลุ่มแล้ว\n• ลงคิว/ลา ในแอปแล้วกด "📤 ส่งเข้ากลุ่ม" — ระบบจะยืนยันในกลุ่มทันที\n• พิมพ์ "คิว" / "คิว ราม" / "คิว พรุ่งนี้" ดูตารางคิว'); return; }
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
  const txt = String(ev.message.text || '').trim(); let m;
  const parts = [];
  const qs = txt.match(/#Q\d+/gi) || [], ls = txt.match(/#L\d+/gi) || [];
  qs.slice(0, 3).forEach(x => parts.push(qReplyFor(x.slice(1).toUpperCase())));
  ls.slice(0, 2).forEach(x => parts.push(leaveReplyFor(x.slice(1).toUpperCase())));
  if (!parts.length && (m = /^คิว(?:\s+(.+))?$/.exec(txt))) parts.push(qBoardText(m[1]));
  if (parts.length) lineReply(ev.replyToken, parts.join(MSG_SPLIT));
}
