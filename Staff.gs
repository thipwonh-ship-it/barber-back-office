/** Staff.gs — ฝั่งช่าง (หน้า Index.html ผ่าน LIFF): ลงเวลา GPS · หยิบเงินสด · เก็บเงินสด · สลิป */

/** ตัวตนจาก session token → {ok,name,shop,...} */
function whoAmI(tok) {
  const s = session(tok); if (!s) return { ok: false, expired: true };
  const b = barberByUid(s.uid); if (!b) return { ok: false, needPin: true };
  return { ok: true, name: b.name, shop: b.shop, shops: shops().map(x => ({ name: x.name, open1: x.open1, open2: x.open2 })), reasons: takeReasons(), methods: cashMethods(), collector: defaultCollector(), today: todayStatus(b.name) };
}
/** ผูกบัญชี LINE กับช่างด้วย PIN (ครั้งแรกครั้งเดียว) */
function bindLine(tok, pin) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const s = session(tok); if (!s) return { ok: false, msg: 'หมดเวลา กรุณาปิดแล้วกดเมนูในไลน์ใหม่' };
    const key = 'pinfail:' + s.uid; const c = CacheService.getScriptCache(); if (num(c.get(key)) >= 5) return { ok: false, msg: 'ใส่ PIN ผิดหลายครั้ง รอ 1 ชั่วโมง' };
    const b = barberByPin(pin); if (!b) { c.put(key, String(num(c.get(key)) + 1), 3600); return { ok: false, msg: 'PIN ไม่ถูกต้อง' }; }
    const other = barberByUid(s.uid); if (other && other.name !== b.name) return { ok: false, msg: 'บัญชี LINE นี้ผูกกับ ' + other.name + ' แล้ว' };
    if (b.uid && b.uid !== s.uid) return { ok: false, msg: 'ชื่อ ' + b.name + ' ผูกกับ LINE อื่นแล้ว ให้ทิพย์ลบ LINE userId ในแผ่น ตั้งค่า ก่อน' };
    sh(SH_SET).getRange(b.row, B_LINE).setValue(s.uid);
    try { sendManual(s.uid); } catch (e) {}
    pushAdmins('👤 ' + b.name + ' ผูก LINE กับระบบแล้ว');
    return { ok: true, msg: 'ผูกบัญชีกับ ' + b.name + ' เรียบร้อย ต่อไปเปิดจากไลน์ได้เลย (ส่งคู่มือให้ในไลน์แล้ว)' };
  } finally { lock.releaseLock(); }
}
function sendManualMe(tok) { const s = session(tok); return s ? sendManual(s.uid) : false; }
function barberOf(tok) { const s = session(tok); return s ? barberByUid(s.uid) : null; }

/* ---------- ลงเวลา ---------- */
function distanceM(a, b, c, d) { const R = 6371000, toR = x => x * Math.PI / 180; const dLat = toR(c - a), dLng = toR(d - b); const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLng / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); }
function timeRow(name, dayKey) {
  const t = sh(SH_TIME); const n = Math.max(t.getLastRow() - 1, 1); const v = t.getRange(2, 1, n, T_GPSOUT).getValues();
  for (let i = v.length - 1; i >= 0; i--) if (dateKey(v[i][0]) === dayKey && String(v[i][T_NAME - 1]).trim() === name) return { row: i + 2, r: v[i] };
  return null;
}
function todayStatus(name) {
  const x = timeRow(name, ymd(todayBkk())); if (!x) return null;
  return { shop: String(x.r[T_SHOP - 1]), shift: String(x.r[T_SHIFT - 1]), tin: tStr(x.r[T_IN - 1]), tout: tStr(x.r[T_OUT - 1]), late: num(x.r[T_LATE - 1]) };
}
/** action 'in'|'out' · p = {shop, shift('10'|'11'), lat, lng, acc} */
function punch(tok, action, p) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา กรุณากดเมนูในไลน์ใหม่', rebind: true };
    const now = new Date(); const today = todayBkk(); const tKey = ymd(today); const timeText = hm(now);
    const mins = +Utilities.formatDate(now, TZ, 'H') * 60 + +Utilities.formatDate(now, TZ, 'm');
    const shopName = String(p.shop || b.shop).trim(); const s = shops().find(x => x.name === shopName); if (!s) return { ok: false, msg: 'ไม่พบร้าน ' + shopName };
    let area = 'ไม่มี GPS', dist = '';
    if (p.lat && p.lng && s.lat && s.lng) { dist = distanceM(+p.lat, +p.lng, s.lat, s.lng); area = dist <= s.radius + num(p.acc) ? 'ในพื้นที่' : 'นอกพื้นที่'; }
    if (area === 'นอกพื้นที่' && !p.force) return { ok: false, far: true, dist, msg: 'คุณอยู่ห่างจากร้าน ' + shopName + ' ' + dist + ' ม. — ถ้าอยู่ที่ร้านจริง ลองรอ GPS แม่นขึ้นแล้วกดใหม่ หรือกด "ยืนยันว่าอยู่ที่ร้าน" (จะบันทึกว่านอกพื้นที่)' };
    const gps = p.lat ? (+p.lat).toFixed(6) + ',' + (+p.lng).toFixed(6) + (dist !== '' ? ' (' + dist + ' ม.)' : '') : '';
    const t = sh(SH_TIME); const x = timeRow(b.name, tKey);
    if (action === 'in') {
      if (x && x.r[T_IN - 1] !== '') return { ok: false, msg: 'วันนี้ลงเวลาเข้างานแล้วเมื่อ ' + tStr(x.r[T_IN - 1]) + ' น.' };
      const shift = s.method === 'ต่อหัว' || !s.open1 || s.open1 === s.open2 ? (s.open1 || '11:00') : (String(p.shift) === '10' ? s.open1 : s.open2);
      const [oh, om] = shift.split(':').map(Number); const late = Math.max(0, mins - (oh * 60 + om));
      const row = x ? x.row : t.getLastRow() + 1;
      t.getRange(row, 1, 1, T_GPSOUT).setValues([[today, b.name, shopName, shift.slice(0, 2), timeText, '', late, 'ทำงาน', (area === 'นอกพื้นที่' ? 'เข้างานนอกพื้นที่ ' + dist + ' ม.' : ''), gps, '']]);
      t.getRange(row, T_DATE).setNumberFormat('yyyy-mm-dd');
      const msg = 'บันทึกเข้างาน ' + shopName + ' ' + timeText + ' น.' + (late > 0 ? ' (สาย ' + late + ' นาที จากกะ ' + shift + ')' : ' ตรงเวลา 👍');
      if (late > 0) pushAdmins('⏰ ' + b.name + ' เข้างาน ' + shopName + ' ' + timeText + ' สาย ' + late + ' นาที');
      return { ok: true, msg, late, today: todayStatus(b.name) };
    }
    if (action === 'out') {
      if (!x) return { ok: false, msg: 'วันนี้ยังไม่ได้กดเข้างาน — กดเข้างานก่อน (ถ้าลืมกดตอนเช้า แจ้งปิ๊กให้แก้ในชีต)' };
      if (x.r[T_OUT - 1] !== '') return { ok: false, msg: 'ลงเวลาเลิกงานแล้วเมื่อ ' + tStr(x.r[T_OUT - 1]) + ' น.' };
      t.getRange(x.row, T_OUT).setValue(timeText); t.getRange(x.row, T_GPSOUT).setValue(gps);
      if (area === 'นอกพื้นที่') { const o = String(t.getRange(x.row, T_NOTE).getValue()); t.getRange(x.row, T_NOTE).setValue((o ? o + ' | ' : '') + 'เลิกงานนอกพื้นที่ ' + dist + ' ม.'); }
      return { ok: true, msg: 'บันทึกเลิกงาน ' + timeText + ' น. ขอบคุณค่ะ 🙏', today: todayStatus(b.name) };
    }
    return { ok: false, msg: 'action ไม่ถูกต้อง' };
  } finally { lock.releaseLock(); }
}

/* ---------- หยิบเงินสดในร้าน (รีวิว 50 / ขายผลิตภัณฑ์ 50 / ซื้อของเล็กน้อย) ---------- */
const TAKE_TYPE = { 'รีวิว': 'รีวิว', 'ขาย': 'ขายผลิตภัณฑ์', 'ซื้อ': 'ของใช้' };
function cashTake(tok, p) {
  const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา กรุณากดเมนูในไลน์ใหม่', rebind: true };
  const reason = clean(p.reason, 60); const key = Object.keys(TAKE_TYPE).find(k => reason.indexOf(k) === 0); if (!key) return { ok: false, msg: 'เลือกเหตุผลก่อน' };
  const type = TAKE_TYPE[key]; const fixed = /\((\d+)\)/.exec(reason); let amt = fixed ? num(fixed[1]) : num(p.amount);
  if (!amt || amt <= 0) return { ok: false, msg: 'ใส่จำนวนเงิน' }; if (amt > 2000) return { ok: false, msg: 'เกิน 2,000 บาท ให้แจ้งปิ๊กบันทึกแทน' };
  const detail = clean(p.detail, 120); if (type === 'ของใช้' && !detail) return { ok: false, msg: 'ระบุว่าซื้ออะไร' };
  const shopName = clean(p.shop || b.shop, 20); const today = todayBkk();
  const x = sh(SH_EXP); const row = x.getLastRow() + 1;
  x.getRange(row, 1, 1, X_LINK).setValues([[today, shopName, type, b.name, amt, detail || reason, b.name, '']]); x.getRange(row, X_FROM).setValue(CASH_FROM); x.getRange(row, X_DATE).setNumberFormat('yyyy-mm-dd');
  pushAdmins('💵 ' + b.name + ' หยิบเงินสด ' + shopName + ' ' + money(amt) + ' บ. — ' + type + (detail ? ': ' + detail : ''));
  return { ok: true, msg: 'บันทึกแล้ว: ' + type + ' ' + money(amt) + ' บาท (' + shopName + ')' };
}

/* ---------- เก็บเงินสด (รายสัปดาห์) ---------- */
function cashCollect(tok, p) {
  const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา กรุณากดเมนูในไลน์ใหม่', rebind: true };
  const amt = num(p.amount); if (amt <= 0) return { ok: false, msg: 'ใส่จำนวนเงิน' };
  const method = clean(p.method, 40); const isBank = /ธนาคาร|โอน/.test(method);
  if (isBank && !p.image) return { ok: false, msg: 'โอนเข้าธนาคารต้องแนบรูปสลิป' };
  const shopName = clean(p.shop || b.shop, 20); const who = isBank ? b.name : (clean(p.collector, 40) || defaultCollector()); const today = todayBkk();
  let link = '', img = '';
  if (p.image) { const f = saveImage(p.image, 'เงินสด ' + ym(today), ymd(today) + ' ' + shopName + ' ' + money(amt), true); if (f) { link = f.url; img = f.img; } }
  const c = sh(SH_CASH); const row = c.getLastRow() + 1;
  c.getRange(row, 1, 1, C_LINK).setValues([[today, shopName, method, amt, who, b.name, link]]); c.getRange(row, C_DATE).setNumberFormat('yyyy-mm-dd');
  pushAdmins('🏦 เก็บเงินสด ' + shopName + ' ' + money(amt) + ' บ. — ' + method + (isBank ? '' : ' โดย ' + who) + '\nบันทึกโดย ' + b.name + (link ? '\n' + link : ''), null, img || '');
  return { ok: true, msg: 'บันทึกเก็บเงินสด ' + money(amt) + ' บาท (' + method + ') แล้ว แจ้งทิพย์เรียบร้อย' };
}

/* ---------- สลิป / สรุปของฉัน ---------- */
function mySummary(tok, ymStr) {
  const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา', rebind: true };
  ymStr = /^\d{4}-\d{2}$/.test(ymStr || '') ? ymStr : ym(todayBkk());
  const rows = sh(SH_DAILY).getRange(2, 1, Math.max(sh(SH_DAILY).getLastRow() - 1, 1), D_BY).getValues().filter(r => String(r[D_NAME - 1]).trim() === b.name && dateKey(r[0]).slice(0, 7) === ymStr);
  const days = rows.map(r => ({ d: dateKey(r[0]), shop: r[D_SHOP - 1], heads: num(r[D_HEADS - 1]), sales: num(r[D_SALES - 1]), wage: num(r[D_PAID - 1]) }));
  const late = sh(SH_TIME).getRange(2, 1, Math.max(sh(SH_TIME).getLastRow() - 1, 1), T_LATE).getValues().filter(r => String(r[T_NAME - 1]).trim() === b.name && dateKey(r[0]).slice(0, 7) === ymStr && num(r[T_LATE - 1]) > 0).length;
  const paid = (prop('PAID_MONTHS') || '').split(',').includes(ymStr);
  return { ok: true, name: b.name, ym: ymStr, days, heads: days.reduce((a, x) => a + x.heads, 0), sales: days.reduce((a, x) => a + x.sales, 0), wage: days.reduce((a, x) => a + x.wage, 0), late, paid, slip: paid ? slipLines(b.name, ymStr) : null };
}
function mySlipPdf(tok, ymStr) {
  const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา' };
  if (!(prop('PAID_MONTHS') || '').split(',').includes(ymStr)) return { ok: false, msg: 'เดือนนี้ยังไม่ปิดงวด/โอน' };
  const f = findSlipFile(b.name, ymStr); if (!f) return { ok: false, msg: 'ยังไม่มีไฟล์สลิป' };
  return { ok: true, name: f.getName(), b64: Utilities.base64Encode(f.getBlob().getBytes()) };
}
