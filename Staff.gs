/** Staff.gs — ฝั่งช่าง (หน้า Index.html ผ่าน LIFF): ลงเวลา GPS · หยิบเงินสด · เก็บเงินสด · สลิป */

/** ตัวตนจาก session token → {ok,name,shop,...} */
function whoAmI(tok) {
  const s = session(tok); if (!s) return { ok: false, expired: true };
  const b = barberByUid(s.uid); if (!b) return { ok: false, needPin: true };
  return { ok: true, name: b.name, shop: b.shop, shops: shops().map(x => ({ name: x.name, open1: x.open1, open2: x.open2 })), reasons: takeReasons(), methods: cashMethods(), collector: defaultCollector(), today: todayStatus(b.name) };
}
/** ผูกบัญชี LINE กับช่างด้วย PIN (ครั้งแรกครั้งเดียว) */
function bindLine(tok, pin) {
  clearMemo();
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
const TAKE_TYPE = { 'รีวิว': 'รีวิว', 'ขาย': 'ขายผลิตภัณฑ์', 'ซื้อ': 'ของใช้', 'ทิป': 'ทิปช่าง' };
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
  if (ymStr < START_YM) return { ok: false, msg: 'ดูได้ตั้งแต่เดือน ' + START_YM };
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

/* ---------- สลิปโอน: ช่างส่งรูปสลิปเข้าแชท OA → เก็บ Drive + อ่านยอด (OCR ฟรีของ Google Drive) ---------- */
const SH_SLIP = 'สลิปโอน';
// A วันที่ B ช่าง C ร้าน D ยอดที่อ่านได้ E ยอดที่แก้ F เลขอ้างอิง G hash H ลิงก์ I เวลาส่ง J หมายเหตุ
function slipSheet() {
  let s = ss().getSheetByName(SH_SLIP); if (s) return s;
  s = ss().insertSheet(SH_SLIP); s.getRange('A1:J1').setValues([['วันที่', 'ช่าง', 'ร้าน', 'ยอดที่อ่านได้', 'ยอดที่แก้', 'เลขอ้างอิง', 'hash', 'ลิงก์สลิป', 'เวลาส่ง', 'หมายเหตุ']]).setFontWeight('bold'); s.setFrozenRows(1); return s;
}
function slipRows(filter) {
  const s = ss().getSheetByName(SH_SLIP); if (!s || s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, 10).getValues().map((r, i) => ({ row: i + 2, d: dateKey(r[0]), name: String(r[1]).trim(), shop: String(r[2]).trim(), read: r[3] === '' ? null : num(r[3]), fix: r[4] === '' ? null : num(r[4]), ref: String(r[5] || ''), hash: String(r[6] || ''), link: String(r[7] || ''), at: tStr(r[8]), note: String(r[9] || '') }))
    .map(x => (x.amount = x.fix != null ? x.fix : x.read, x)).filter(filter || (() => true));
}
/** อ่านข้อความจากรูปด้วย OCR ของ Google Drive (แปลงเป็น Google Doc ชั่วคราวแล้วลบ) */
function ocrText(blob) {
  const tok = ScriptApp.getOAuthToken(), boundary = 'bboSlip' + Date.now();
  const meta = JSON.stringify({ name: 'ocr-tmp', mimeType: 'application/vnd.google-apps.document' });
  const pre = Utilities.newBlob('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary + '\r\nContent-Type: ' + (blob.getContentType() || 'image/jpeg') + '\r\n\r\n').getBytes();
  const post = Utilities.newBlob('\r\n--' + boundary + '--').getBytes();
  const r = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=th&fields=id', { method: 'post', contentType: 'multipart/related; boundary=' + boundary, payload: pre.concat(blob.getBytes()).concat(post), headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true });
  let id = ''; try { id = JSON.parse(r.getContentText()).id || ''; } catch (e) {} if (!id) return '';
  const t = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text/plain', { headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true }).getContentText();
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {}
  return t || '';
}
/** ปรับข้อความ OCR ภาษาไทย: ํา → ำ และตัดวรรณยุกต์ (OCR มักอ่านวรรณยุกต์หาย/เพี้ยน) ใช้สำหรับจับคำ */
function thaiNorm(t) { return String(t || '').replace(/\u0E4D\u0E32/g, '\u0E33').replace(/[\u0E48-\u0E4B]/g, ''); }
/** หายอดเงิน + เลขอ้างอิง + วันที่ จากข้อความสลิป (ทดสอบกับ OCR จริง: กสิกร, กรุงเทพ, SCB, กรุงไทย)
 *  หมายเหตุ: หลายธนาคาร OCR แยก "ป้าย" กับ "ค่า" คนละบรรทัด จึงไม่ยึดตำแหน่งป้าย */
function parseSlip(text) {
  const lines = thaiNorm(text).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const isFee = l => /คาธรรมเนียม|ธรรมเนียม|\bfee\b/i.test(l);
  const money = l => (l.match(/\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/g) || []).map(v => Number(v.replace(/,/g, ''))).filter(x => x > 0 && x < 1000000);
  // 1) ป้าย "จำนวน/Amount" ที่มีตัวเลขในบรรทัดเดียวกันหรือบรรทัดถัดไป (ถ้าบรรทัดถัดไปไม่ใช่ค่าธรรมเนียม)
  let amount = null;
  for (let i = 0; i < lines.length && amount == null; i++) {
    const l = lines[i].split(/คาธรรมเนียม|ธรรมเนียม|fee/i)[0];
    if (!/จำนวน|นวนเงิน|amount/i.test(l)) continue;
    let v = money(l); if (!v.length && i + 1 < lines.length && !isFee(lines[i + 1])) v = money(lines[i + 1]);
    if (v.length) amount = v[0];
  }
  // 2) ไม่เจอ → ยอดที่มากที่สุดในสลิป (ค่าธรรมเนียมเป็น 0.00 หรือน้อยกว่ายอดเสมอ)
  if (amount == null) { const v = lines.filter(l => !isFee(l)).flatMap(money); if (v.length) amount = Math.max.apply(null, v); }
  // เลขอ้างอิง = ตัวอักษร/ตัวเลขติดกันยาวที่สุด (≥10 ตัว มีเลข ≥6 ตัว) — เลขบัญชีถูกปิด xxx/มีขีด จึงไม่ถูกเลือก
  const toks = lines.join(' ').split(/[\s:：]+/).filter(t => /^[A-Za-z0-9]{10,}$/.test(t) && (t.match(/\d/g) || []).length >= 6);
  const ref = toks.sort((a, b) => b.length - a.length)[0] || '';
  // วันที่บนสลิป (วัน + เดือน) เช่น "05 พ.ย. 2569", "5 พ.ย. 69", "05 Nov 26"
  const TH = ['ม.ค', 'ก.พ', 'มี.ค', 'เม.ย', 'พ.ค', 'มิ.ย', 'ก.ค', 'ส.ค', 'ก.ย', 'ต.ค', 'พ.ย', 'ธ.ค'], EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let date = null; const all = lines.join(' ');
  const mt = all.match(/(\d{1,2})\s*(มี\s*\.?\s*ค|เม\s*\.?\s*ย|มิ\s*\.?\s*ย|[มกพสตธ]\s*\.\s*[คพยค])\s*\./);
  if (mt) { const k = TH.indexOf(mt[2].replace(/\s/g, '').replace(/^(มี|เม|มิ)\.?/, '$1.')); if (k >= 0) date = { d: Number(mt[1]), m: k + 1 }; }
  if (!date) { const me = all.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*\d{2,4}/i); if (me) date = { d: Number(me[1]), m: EN.indexOf(me[2].toLowerCase()) + 1 }; }
  return { amount, ref, date };
}
/** webhook: ช่างส่งรูปเข้าแชท → คืนข้อความตอบกลับ (หรือ null ถ้าไม่เกี่ยว) */
function slipIntake(uid, msgId) {
  const b = barberByUid(uid);
  if (!b) return adminRole(uid) ? null : 'ส่งสลิปได้หลังผูกบัญชีช่าง — กดเมนู "ลงเวลา" แล้วใส่ PIN ก่อนค่ะ';
  const tok = lineToken();
  const res = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + msgId + '/content', { headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return '⚠️ ดึงรูปไม่ได้ ลองส่งใหม่อีกครั้ง';
  const blob = res.getBlob(); const bytes = blob.getBytes();
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes).map(x => ('0' + (x & 255).toString(16)).slice(-2)).join('');
  const now = new Date(), day = ymd(todayBkk());
  const t = timeRows(r => r.d === day && r.name === b.name); const shop = t.length ? t[t.length - 1].shop : b.shop;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const all = slipRows();
    if (all.find(x => x.hash === hash)) return '⚠️ สลิปนี้ส่งไปแล้ว (รูปซ้ำ) — ไม่ได้บันทึกซ้ำ';
    const text = ocrText(blob.setName('slip.jpg')); const p = parseSlip(text);
    const looksSlip = /โอน|สำเร็จ|จำนวน|บาท|THB|ธนาคาร|ธ\.|พรอมเพย|PromptPay|Transfer|Amount|กสิกร|ไทยพาณิชย|กรุงเทพ|กรุงไทย|กรุงศรี|ออมสิน|ทหารไทย|ttb|K PLUS|SCB|Krungthai|Bangkok Bank|เลขทีรายการ|อางอิง/i.test(thaiNorm(text));
    if (text && !looksSlip && p.amount == null) return '🖼️ รูปนี้ไม่ใช่สลิปโอน — ไม่ได้บันทึก\n(รูป/วิดีโอผลงาน ส่งในกลุ่มร้านเหมือนเดิมนะคะ แชทนี้รับเฉพาะสลิป)';
    if (p.ref && all.find(x => x.ref === p.ref)) return '⚠️ สลิปนี้ส่งไปแล้ว (เลขอ้างอิง ' + p.ref + ' ซ้ำ) — ไม่ได้บันทึกซ้ำ';
    const td = todayBkk(); const oldSlip = p.date && !(p.date.d === td.getDate() && p.date.m === td.getMonth() + 1);
    const note = oldSlip ? 'สลิปลงวันที่ ' + p.date.d + '/' + p.date.m + ' ไม่ใช่วันนี้' : '';
    const f = subFolder('สลิปโอน ' + ym(now)).createFile(blob.setName(day + ' ' + shop + ' ' + b.name + ' ' + Utilities.formatDate(now, TZ, 'HHmmss') + '.jpg'));
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const s = slipSheet(); const row = s.getLastRow() + 1;
    s.getRange(row, 1, 1, 10).setValues([[parseYmd(day), b.name, shop, p.amount == null ? '' : p.amount, '', p.ref, hash, f.getUrl(), hm(now), note]]); s.getRange(row, 1).setNumberFormat('yyyy-mm-dd');
    const mine = slipRows(x => x.d === day && x.name === b.name && x.shop === shop); const tot = mine.reduce((a, x) => a + (x.amount || 0), 0);
    return (p.amount == null ? '📸 รับสลิปแล้ว แต่อ่านยอดไม่ได้ — ผู้จัดการจะตรวจเอง' : '✅ รับสลิป ' + money(p.amount) + ' บาท') + '\n' + shop + ' · ' + day + '\nวันนี้ส่งแล้ว ' + mine.length + ' ใบ รวม ' + money(tot) + ' บาท' + (oldSlip ? '\n⚠️ ' + note + ' — ผู้จัดการจะตรวจ' : '');
  } finally { lock.releaseLock(); }
}
