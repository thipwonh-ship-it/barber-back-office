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
    pushAdmins('👤 ' + b.name + ' ผูก LINE กับระบบแล้ว', ['owner']);
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
  return { ok: true, msg: 'บันทึกเก็บเงินสด ' + money(amt) + ' บาท (' + method + ') แล้ว (ขึ้นในแอปแอดมินแล้ว)' };
}

/* ---------- สลิป / สรุปของฉัน ---------- */
function mySummary(tok, ymStr) {
  const b = barberOf(tok); if (!b) return { ok: false, msg: 'หมดเวลา', rebind: true };
  ymStr = /^\d{4}-\d{2}$/.test(ymStr || '') ? ymStr : ym(todayBkk());
  if (ymStr < START_YM) return { ok: false, msg: 'ดูได้ตั้งแต่เดือน ' + START_YM };
  const rows = sh(SH_DAILY).getRange(2, 1, Math.max(sh(SH_DAILY).getLastRow() - 1, 1), D_BY).getValues().filter(r => String(r[D_NAME - 1]).trim() === b.name && dateKey(r[0]).slice(0, 7) === ymStr);
  const days = rows.map(r => ({ d: dateKey(r[0]), shop: r[D_SHOP - 1], heads: num(r[D_HEADS - 1]), sales: num(r[D_SALES - 1]), wage: num(r[D_PAID - 1]) })).sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0); // หน้าเว็บช่างกลับลำดับ → ล่าสุดอยู่บน
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
  let s = ss().getSheetByName(SH_SLIP); if (s) { if (!s.getRange('K1').getValue()) s.getRange('K1').setValue('ชุด').setFontWeight('bold'); if (!s.getRange('L1').getValue()) s.getRange('L1').setValue('คีย์ ยอด|วัน|เวลาโอน').setFontWeight('bold'); return s; }
  s = ss().insertSheet(SH_SLIP); s.getRange('A1:L1').setValues([['วันที่', 'ช่าง', 'ร้าน', 'ยอดที่อ่านได้', 'ยอดที่แก้', 'เลขอ้างอิง', 'hash', 'ลิงก์สลิป', 'เวลาส่ง', 'หมายเหตุ', 'ชุด', 'คีย์ ยอด|วัน|เวลาโอน']]).setFontWeight('bold'); s.setFrozenRows(1); return s;
}
function slipRows(filter) {
  const s = ss().getSheetByName(SH_SLIP); if (!s || s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, 12).getValues().map((r, i) => ({ set: String(r[10] || ''), key: String(r[11] || ''), row: i + 2, d: dateKey(r[0]), name: String(r[1]).trim(), shop: String(r[2]).trim(), read: r[3] === '' ? null : num(r[3]), fix: r[4] === '' ? null : num(r[4]), ref: String(r[5] || ''), hash: String(r[6] || ''), link: String(r[7] || ''), at: tStr(r[8]), note: String(r[9] || '') }))
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
  // ตัดส่วน "ยอดเงินคงเหลือ/ใช้ได้" ออก (เช่น แถบแจ้งเตือนแอปธนาคารที่ทับสลิป "…ยอดเงินที่ใช้ได้ 40,201.34 บาท") ไม่ให้นับเป็นยอดโอน
  const BAL = /ใชได|คงเหลือ|available|balance/i; // เทียบหลัง thaiNorm (ตัดวรรณยุกต์แล้ว: ใช้ได้ → ใชได)
  const lines = thaiNorm(text).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim().split(BAL)[0].trim()).filter(Boolean);
  const isFee = l => /คาธรรมเนียม|ธรรมเนียม|\bfee\b/i.test(l);
  const money = l => (l.match(/\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/g) || []).map(v => Number(v.replace(/,/g, ''))).filter(x => x > 0 && x < 1000000);
  // 1) ป้าย "จำนวน/Amount" ที่มีตัวเลขในบรรทัดเดียวกันหรือบรรทัดถัดไป (ถ้าบรรทัดถัดไปไม่ใช่ค่าธรรมเนียม)
  let amount = null;
  for (let i = 0; i < lines.length && amount == null; i++) {
    const l = lines[i].split(/คาธรรมเนียม|ธรรมเนียม|fee/i)[0];
    if (!/จำนวน|นวนเงิน|amount/i.test(l)) continue;
    let v = money(l); for (let k = 1; !v.length && k <= 3 && i + k < lines.length && !isFee(lines[i + k]); k++) v = money(lines[i + k]); // ป้ายกับตัวเลขอาจห่างกัน 1–3 บรรทัดใน OCR
    if (v.length) amount = v[0];
  }
  // 2) ไม่เจอ → ยอดที่มากที่สุดในสลิป (ค่าธรรมเนียมเป็น 0.00 หรือน้อยกว่ายอดเสมอ)
  if (amount == null) { const v = lines.filter(l => !isFee(l)).flatMap(money); if (v.length) amount = Math.max.apply(null, v); }
  // เลขอ้างอิง = ตัวอักษร/ตัวเลขติดกันยาวที่สุด (≥10 ตัว มีเลข ≥6 ตัว) — เลขบัญชีถูกปิด xxx/มีขีด จึงไม่ถูกเลือก
  // บางธนาคาร (เช่น กรุงไทยจ่ายบิล) เลขอ้างอิงขึ้น 2 บรรทัด และบรรทัดแรกซ้ำกันทุกใบ → เก็บทุกเลขบนสลิปต่อกัน
  const toks = [...new Set(lines.join(' ').split(/[\s:：]+/).filter(t => /^[A-Za-z0-9]{10,}$/.test(t) && (t.match(/\d/g) || []).length >= 6))];
  const ref = toks.join(' ').slice(0, 120);
  // วันที่บนสลิป (วัน + เดือน) เช่น "05 พ.ย. 2569", "5 พ.ย. 69", "05 Nov 26"
  const TH = ['ม.ค', 'ก.พ', 'มี.ค', 'เม.ย', 'พ.ค', 'มิ.ย', 'ก.ค', 'ส.ค', 'ก.ย', 'ต.ค', 'พ.ย', 'ธ.ค'], EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let date = null; const all = lines.join(' ');
  const mt = all.match(/(\d{1,2})\s*(มี\s*\.?\s*ค|เม\s*\.?\s*ย|มิ\s*\.?\s*ย|[มกพสตธ]\s*\.\s*[คพยค])\s*\./);
  let at = -1;
  if (mt) { const k = TH.indexOf(mt[2].replace(/\s/g, '').replace(/^(มี|เม|มิ)\.?/, '$1.')); if (k >= 0) { date = { d: Number(mt[1]), m: k + 1 }; at = mt.index; } }
  if (!date) { const me = all.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*\d{2,4}/i); if (me) { date = { d: Number(me[1]), m: EN.indexOf(me[2].toLowerCase()) + 1 }; at = me.index; } }
  // เวลาโอน = HH:MM ที่อยู่ถัดจากวันที่บนสลิป (ไม่ใช้เวลาบนแถบสถานะมือถือ)
  let time = ''; if (at >= 0) { const tm = all.slice(at, at + 40).match(/(\d{1,2})\s*:\s*(\d{2})/); if (tm && +tm[1] < 24 && +tm[2] < 60) time = ('0' + tm[1]).slice(-2) + ':' + tm[2]; }
  return { amount, ref, date, time };
}
/** สถานะสลิปในคอลัมน์หมายเหตุ: 'รออ่าน' = ยังไม่ได้ OCR · 'ซ้ำ…' / 'ไม่ใช่สลิป' = ไม่นับยอด */
const SLIP_WAIT = 'รออ่าน';
/** เลขอ้างอิงตรงกัน (เผื่อ OCR อ่านได้ไม่ครบ: ตัวหนึ่งเป็นท้ายของอีกตัว ยาว ≥10) */
function sameRef(a, b) { a = String(a || ''); b = String(b || ''); if (!a || !b) return false; if (a === b) return true;
  if (a.includes(' ') || b.includes(' ')) return false;                       // หลายเลข → ต้องตรงทั้งหมด
  return Math.min(a.length, b.length) >= 10 && (a.endsWith(b) || b.endsWith(a)); }
/** สลิปซ้ำ = เลขอ้างอิงตรงกัน และยอดเงินเท่ากัน (กันการตัดยอดผิดเพราะเลขอ้างอิงคล้ายกัน) */
function sameSlip(x, ref, amount) { return sameRef(x.ref, ref) && (x.read == null || amount == null || Number(x.read) === Number(amount)); }
/** คีย์สลิป = ยอด|เดือน/วัน|เวลาโอน (ใช้จับสลิปซ้ำเมื่ออ่านเลขอ้างอิงไม่ได้) · ต้องอ่านได้ครบทั้ง 3 อย่าง */
function slipKey(p) { return p && p.amount != null && p.date && p.time ? Number(p.amount) + '|' + p.date.m + '/' + p.date.d + '|' + p.time : ''; }
function slipCounted(x) { return !/^(ซ้ำ|ไม่ใช่สลิป|สมุด)/.test(x.note || ''); }
const LOOKS_SLIP = /สำเร็จ|ธรรมเนียม|อางอิง|เลขทีรายการ|successful|Amount|THB|PromptPay|พรอมเพย|K ?PLUS|SCB|Krungthai|Bangkok Bank|กสิกร|ไทยพาณิชย|กรุงเทพ|กรุงไทย|กรุงศรี|ออมสิน|ttb|Make by KBank|MAKE/i;
/** สลิป = มีคำเฉพาะของสลิปธนาคาร + (อ่านยอดได้ หรือ มีเลขอ้างอิง) — ไม่งั้นถือเป็นรูปสมุด/อื่นๆ */
function isSlipText(text, p) { return LOOKS_SLIP.test(thaiNorm(text)) && (p.amount != null || !!p.ref); }

/** webhook: ช่างส่งรูปเข้าแชท → เก็บรูป + อ่านยอดทันที (แต่ละรูปเป็นคนละ request จึงอ่านพร้อมกันได้)
 *  ส่ง 1 รูป → ตอบยอดของรูปนั้น
 *  ส่งหลายรูปพร้อมกัน (imageSet) → รูปที่อ่านเสร็จเป็นรูปสุดท้ายของชุด ตอบสรุปรวมครั้งเดียว (ใช้ reply ไม่เสียโควตา push) */
function slipIntake(uid, msgId, set) {
  const b = barberByUid(uid);
  if (!b) return adminRole(uid) ? null : 'ส่งสลิปได้หลังผูกบัญชีช่าง — กดเมนู "ลงเวลา" แล้วใส่ PIN ก่อนค่ะ';
  const setId = set && set.id ? String(set.id) : '', total = set ? Number(set.total) || 1 : 1;
  let r = { st: 'err' }, row = null;
  try {
    const res = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + msgId + '/content', { headers: { Authorization: 'Bearer ' + lineToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) { if (!setId) return '⚠️ ดึงรูปไม่ได้ ลองส่งใหม่อีกครั้ง'; throw new Error('fetch'); }
    const blob = res.getBlob(); const bytes = blob.getBytes();
    const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes).map(x => ('0' + (x & 255).toString(16)).slice(-2)).join('');
    const now = new Date(), day = ymd(todayBkk());
    const t = timeRows(x => x.d === day && x.name === b.name); const shop = t.length ? t[t.length - 1].shop : b.shop;
    const f = subFolder('สลิปโอน ' + ym(now)).createFile(blob.setName(day + ' ' + shop + ' ' + b.name + ' ' + Utilities.formatDate(now, TZ, 'HHmmss') + '-' + String(msgId).slice(-4) + '.jpg'));
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      if (slipRows().find(x => x.hash === hash)) { f.setTrashed(true); r = { st: 'dupimg' }; }
      else { const s = slipSheet(); row = s.getLastRow() + 1; s.getRange(row, 1, 1, 11).setValues([[parseYmd(day), b.name, shop, '', '', '', hash, f.getUrl(), hm(now), SLIP_WAIT, setId]]); s.getRange(row, 1).setNumberFormat('yyyy-mm-dd'); }
    } finally { lock.releaseLock(); }
    if (row) r = slipRead(row, blob);
    if (!setId) {
      if (r.st === 'dupimg') return '⚠️ สลิปนี้ส่งไปแล้ว (รูปซ้ำ) — ไม่ได้บันทึกซ้ำ';
      if (r.st === 'book') return '📒 รับรูปสมุดแล้ว — ผู้จัดการจะใช้ตรวจตอนกรอกยอด\n(ถ้าเป็นสลิปแต่ระบบอ่านไม่ออก ผู้จัดการจะตรวจเอง)';
      if (r.st === 'dup') return '⚠️ สลิป ' + (r.amount != null ? money(r.amount) + ' บาท ' : '') + 'นี้' + (r.twin && r.twin !== b.name ? ' ' + r.twin + ' ส่งไปแล้ว — นับครั้งเดียว\n(ลูกค้าจ่ายรวมให้ 2 คน ผู้จัดการจะแบ่งยอดตอนกรอก)' : 'ส่งไปแล้ว — ไม่นับซ้ำ');
      const mine = slipRows(x => x.d === day && x.name === b.name && x.shop === shop && slipCounted(x)); const tot = mine.reduce((a, x) => a + (x.amount || 0), 0);
      return (r.amount == null ? '📸 รับสลิปแล้ว แต่อ่านยอดไม่ได้ — ผู้จัดการจะตรวจเอง' : '✅ รับสลิป ' + money(r.amount) + ' บาท') + '\n' + shop + ' · ' + day + '\nวันนี้ส่งแล้ว ' + mine.length + ' ใบ รวม ' + money(tot) + ' บาท' + (r.note ? '\n⚠️ ' + r.note + ' — ผู้จัดการจะตรวจ' : '');
    }
  } catch (e) { if (!setId) throw e; r = { st: 'err' }; }
  // ---- ชุดหลายรูป: นับว่าเสร็จกี่รูปแล้ว รูปสุดท้ายเป็นคนตอบสรุป ----
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  let last = false, extra = {};
  try {
    const c = CacheService.getScriptCache(), k = 'slipset_' + setId, o = JSON.parse(c.get(k) || '{"n":0,"dupimg":0,"err":0}');
    o.n++; if (r.st === 'dupimg') o.dupimg++; if (r.st === 'err') o.err++;
    c.put(k, JSON.stringify(o), 21600); last = o.n >= total; extra = o;
  } finally { lock.releaseLock(); }
  return last ? slipSetSummary(b.name, setId, total, extra) : null;
}
/** ข้อความสรุปของชุดสลิป */
function slipSetSummary(name, setId, total, extra) {
  const rs = slipRows(x => x.set === setId), day = ymd(todayBkk());
  const ok = rs.filter(x => slipCounted(x) && x.note !== SLIP_WAIT), amts = ok.filter(x => x.amount != null).map(x => x.amount), bad = ok.filter(x => x.amount == null);
  const dup = rs.filter(x => /^ซ้ำ/.test(x.note)).length + (extra.dupimg || 0), book = rs.filter(x => x.note === 'สมุด').length, old = ok.filter(x => /ไม่ใช่วันนี้/.test(x.note)).length;
  const shop = rs.length ? rs[0].shop : '';
  const mine = slipRows(x => x.d === day && x.name === name && x.shop === shop && slipCounted(x)), tot = mine.reduce((a, x) => a + (x.amount || 0), 0), sum = amts.reduce((a, v) => a + v, 0);
  return '🧾 รับสลิปทั้งสิ้น ' + ok.length + ' ใบ' + (shop ? ' · ' + shop : '') +
    (amts.length ? '\nยอด: ' + amts.map(money).join(', ') + '\nรวม ' + money(sum) + ' บาท' : '') +
    (bad.length ? '\n📸 อ่านยอดไม่ได้ ' + bad.length + ' ใบ — ผู้จัดการจะตรวจ' : '') +
    (old ? '\n⚠️ สลิปไม่ใช่วันนี้ ' + old + ' ใบ' : '') +
    (dup ? '\n⚠️ ส่งซ้ำ ' + dup + ' ใบ (ไม่นับ)' : '') +
    (book ? '\n📒 รูปสมุด ' + book + ' รูป' : '') +
    (extra.err ? '\n⚠️ บันทึกไม่สำเร็จ ' + extra.err + ' รูป — ส่งรูปนั้นใหม่อีกครั้ง' : '') +
    (mine.length > ok.length ? '\nทั้งวันนี้ ' + mine.length + ' ใบ รวม ' + money(tot) + ' บาท' : '');
}
/** อ่านยอดสลิปแถว row (OCR นอกล็อก) แล้วบันทึกผล → { st: ok|dup|notslip, amount, ref, note } */
function slipRead(row, blob) {
  const s = slipSheet();
  if (!blob) { const link = String(s.getRange(row, 8).getValue()); const id = (link.match(/[-\w]{25,}/) || [])[0]; blob = DriveApp.getFileById(id).getBlob(); }
  let text = ''; try { text = ocrText(blob.setName('slip.jpg')); } catch (e) {}
  const p = parseSlip(text);
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    if (!isSlipText(text, p)) { s.getRange(row, 10).setValue('สมุด'); return { st: 'book' }; }   // ไม่ใช่สลิป → เก็บเป็นรูปสมุดให้ผู้จัดการดูตอนกรอกยอด
    const key = slipKey(p); if (key) s.getRange(row, 12).setValue(key);
    const twinR = p.ref ? slipRows(x => x.row !== row && slipCounted(x) && sameSlip(x, p.ref, p.amount))[0] : null;
    if (twinR) { s.getRange(row, 4, 1, 7).setValues([[p.amount == null ? '' : p.amount, '', p.ref, s.getRange(row, 7).getValue(), s.getRange(row, 8).getValue(), s.getRange(row, 9).getValue(), 'ซ้ำ (เลขอ้างอิงเดียวกับสลิปของ ' + twinR.name + ' แถว ' + twinR.row + ')']]); return { st: 'dup', ref: p.ref, amount: p.amount, twin: twinR.name }; }
    // อ่านเลขอ้างอิงไม่ได้ (เช่น ถ่ายรูปหน้าจอมือถือ) → เทียบ ยอด + วันที่ + เวลาโอน ในร้านเดียวกัน
    // ลูกค้าจ่ายรวมให้ช่าง 2 คน แล้วช่างส่งสลิปเดียวกันทั้งคู่ → นับครั้งเดียว (ผู้จัดการแบ่งยอดต่อช่างตอนกรอกยอดรายวัน)
    const shopR = String(s.getRange(row, 3).getValue()).trim();
    const twinK = key ? slipRows(x => x.row !== row && x.shop === shopR && slipCounted(x) && x.key === key)[0] : null;
    if (twinK) { s.getRange(row, 4).setValue(p.amount); s.getRange(row, 6).setValue(p.ref); s.getRange(row, 10).setValue('ซ้ำ (ยอด+เวลาโอนตรงกับสลิปของ ' + twinK.name + ' แถว ' + twinK.row + ' — ลูกค้าจ่ายรวม/ส่งซ้ำ นับครั้งเดียว)'); return { st: 'dup', ref: '', amount: p.amount, twin: twinK.name }; }
    const td = todayBkk(); const old = p.date && !(p.date.d === td.getDate() && p.date.m === td.getMonth() + 1);
    const note = old ? 'สลิปลงวันที่ ' + p.date.d + '/' + p.date.m + ' ไม่ใช่วันนี้' : '';
    s.getRange(row, 4).setValue(p.amount == null ? '' : p.amount); s.getRange(row, 6).setValue(p.ref); s.getRange(row, 10).setValue(note);
    return { st: 'ok', amount: p.amount, ref: p.ref, note };
  } finally { lock.releaseLock(); }
}
/** (รันเองใน editor) ใส่คีย์ ยอด|วัน|เวลา ให้สลิปเก่าตั้งแต่ START_DATE ที่ยังไม่มีคีย์ แล้ว log คู่ที่น่าจะซ้ำ (ไม่แก้หมายเหตุเอง) */
function slipKeyBackfill() {
  const s = slipSheet(); const t0 = Date.now(); let n = 0;
  slipRows(x => x.d >= START_DATE && !x.key && x.note !== 'สมุด' && x.note !== SLIP_WAIT).forEach(x => {
    if (Date.now() - t0 > 300000) return; const id = (x.link.match(/[-\w]{25,}/) || [])[0]; if (!id) return;
    try { const k = slipKey(parseSlip(ocrText(DriveApp.getFileById(id).getBlob().setName('slip.jpg')))); if (k) { s.getRange(x.row, 12).setValue(k); n++; } } catch (e) { Logger.log(x.row + ' ' + e.message); }
  });
  const rows = slipRows(x => x.d >= START_DATE && !!x.key && slipCounted(x)); const seen = {}; const pairs = [];
  rows.forEach(x => { const k = x.shop + '|' + x.key; if (seen[k]) pairs.push('แถว ' + seen[k].row + ' (' + seen[k].name + ') = แถว ' + x.row + ' (' + x.name + ') ' + x.key); else seen[k] = x; });
  Logger.log('ใส่คีย์ ' + n + ' แถว · คู่ที่น่าจะซ้ำ ' + pairs.length + (pairs.length ? '\n' + pairs.join('\n') : ''));
  return pairs;
}
/** (รันเองใน editor ได้) อ่านสลิปที่ค้างสถานะ 'รออ่าน' ทั้งหมด */
function slipRetry() { slipRows(x => x.note === SLIP_WAIT).forEach(x => { try { slipRead(x.row); } catch (e) { Logger.log(x.row + ' ' + e.message); } }); }

/* ---------- สรุปร้าน (ข้อความที่ช่างพิมพ์ส่ง เช่น Kraft: นับแบงก์ + จำนวนลูกค้า) ---------- */
const SH_NOTE = 'สรุปร้าน';
function noteSheet() {
  let s = ss().getSheetByName(SH_NOTE); if (s) return s;
  s = ss().insertSheet(SH_NOTE); s.getRange('A1:K1').setValues([['วันที่', 'ช่าง', 'ร้าน', 'เงินสดนับได้', 'ลูกค้า (คน)', 'ข้อความ', 'เวลาส่ง', 'หมายเหตุ', 'ลูกค้าใหม่', 'ลูกค้าประจำ', 'ที่มาลูกค้าใหม่']]).setFontWeight('bold'); s.setFrozenRows(1); return s;
}
function noteRows(filter) {
  const s = ss().getSheetByName(SH_NOTE); if (!s || s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, 11).getValues().map((r, i) => ({ row: i + 2, d: dateKey(r[0]), name: String(r[1]).trim(), shop: String(r[2]).trim(), cash: r[3] === '' ? null : num(r[3]), customers: r[4] === '' ? null : num(r[4]), text: String(r[5] || ''), at: tStr(r[6]), note: String(r[7] || ''), newC: r[8] === '' ? null : num(r[8]), regC: r[9] === '' ? null : num(r[9]), sources: String(r[10] || '') })).filter(filter || (() => true));
}
/** อ่านข้อความสรุป: บรรทัด "แบงก์=ยอด" (1000=3000), "รวม3168", "ลูกค้า3คน" → null ถ้าไม่ใช่ข้อความสรุป */
function parseShopNote(text) {
  const t = String(text || ''), N = v => Number(String(v).replace(/,/g, ''));
  const den = [...t.matchAll(/^\s*(\d{1,4})\s*[=xX×*]\s*([\d,]+)\s*$/gm)].map(m => ({ d: N(m[1]), v: N(m[2]) })).filter(x => [1, 2, 5, 10, 20, 50, 100, 500, 1000].includes(x.d));
  const tot = t.match(/รวม\s*(?:เงิน(?:สด)?)?\s*[:=]?\s*([\d,]+)/);
  const cus = t.match(/(?:ลูกค้า|หัว)\D{0,10}?(\d+)\s*(?:คน|หัว|ราย)/) || t.match(/(?:ลูกค้า|หัว)\s*[:=]?\s*(\d+)/);
  // ลูกค้าแต่ละคน: "คนที่1ลูกค้าใหม่บ้านใกล้" / "คนที่2ลูกค้าประจำ" → ใหม่/ประจำ + ที่มา (ใช้วางแผนโปรโมท)
  const list = [...t.matchAll(/คนที่\s*\d+\s*[.:)\-]?\s*([^\n]*?)(?=\s*คนที่\s*\d|\s*$)/gm)].map(m => m[1].trim()).filter(Boolean); // "คนที่1 ใหม่ google" จะขึ้นบรรทัดใหม่หรือต่อกันก็ได้
  const isNew = x => /ใหม่/.test(x), isReg = x => /ประจำ|เก่า|ขาประจำ/.test(x);
  const src = list.filter(isNew).map(x => x.replace(/ลูกค้า|ใหม่|[-:,()]/g, ' ').replace(/\s+/g, ' ').trim() || 'ไม่ระบุ');
  if (den.length < 2 && !tot && !cus && !list.length) return null;
  const sum = den.length ? den.reduce((a, x) => a + x.v, 0) : null, written = tot ? N(tot[1]) : null;
  const badLines = den.filter(x => x.v % x.d !== 0).map(x => x.d + '=' + x.v);
  const customers = cus ? N(cus[1]) : (list.length || null);
  let newC = list.length ? list.filter(isNew).length : null, regC = list.length ? list.filter(isReg).length : null;
  // ไม่แยกรายคน แต่บอกรวม: "ประจำทั้งหมด" / "ใหม่ทั้งหมด" / "ใหม่ 2 ประจำ 3"
  if (newC == null && customers != null) {
    if (/(ประจำ|เก่า)\s*(ทั้งหมด|ทุกคน|หมด)/.test(t)) { newC = 0; regC = customers; }
    else if (/ใหม่\s*(ทั้งหมด|ทุกคน|หมด)/.test(t)) { newC = customers; regC = 0; }
    else { const mn = t.match(/ใหม่\s*(\d+)/), mr = t.match(/(?:ประจำ|เก่า)\s*(\d+)/); if (mn || mr) { newC = mn ? N(mn[1]) : 0; regC = mr ? N(mr[1]) : 0; } }
  }
  return { sum, written, cash: written != null ? written : sum, customers, newC, regC, sources: src, badLines, mismatch: sum != null && written != null && sum !== written };
}
/** webhook: ช่างพิมพ์สรุปร้าน → บันทึก (ส่งใหม่วันเดียวกัน = แทนของเดิม) */
function noteIntake(uid, text) {
  const b = barberByUid(uid); if (!b) return null;
  const p = parseShopNote(text); if (!p) return null;
  const now = new Date(), day = ymd(todayBkk());
  const t = timeRows(r => r.d === day && r.name === b.name); const shop = t.length ? t[t.length - 1].shop : b.shop;
  const warn = []; if (p.mismatch) warn.push('บวกแต่ละแบงก์ได้ ' + money(p.sum) + ' แต่เขียนรวม ' + money(p.written)); if (p.badLines.length) warn.push('บรรทัดแปลก: ' + p.badLines.join(', '));
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const s = noteSheet(), ex = noteRows(x => x.d === day && x.shop === shop)[0], row = ex ? ex.row : s.getLastRow() + 1;
    if (p.customers != null && p.newC != null && p.newC + p.regC !== p.customers) warn.push('บอกลูกค้า ' + p.customers + ' คน แต่แยกรายคนได้ ' + (p.newC + p.regC) + ' คน');
    s.getRange(row, 1, 1, 11).setValues([[parseYmd(day), b.name, shop, p.cash == null ? '' : p.cash, p.customers == null ? '' : p.customers, clean(text, 1500), hm(now), warn.join(' · '), p.newC == null ? '' : p.newC, p.regC == null ? '' : p.regC, p.sources.join(', ')]]); s.getRange(row, 1).setNumberFormat('yyyy-mm-dd');
  } finally { lock.releaseLock(); }
  return '📝 รับสรุปร้าน' + shop + ' ' + day + (p.cash != null ? '\n💵 เงินสดนับได้ ' + money(p.cash) + ' บาท' + (p.sum != null && !p.mismatch ? ' ✓' : '') : '') + (p.customers != null ? '\n👥 ลูกค้า ' + p.customers + ' คน' + (p.newC != null ? ' (ใหม่ ' + p.newC + ' · ประจำ ' + p.regC + ')' : '') : '') + (p.sources.length ? '\n📍 ลูกค้าใหม่มาจาก: ' + p.sources.join(', ') : '') +
    (warn.length ? '\n⚠️ ' + warn.join('\n⚠️ ') + ' — เช็กแล้วส่งใหม่ได้เลย (ระบบใช้ข้อความล่าสุด)' : '');
}
