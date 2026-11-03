/**
 * Barber Back Office — Google Apps Script backend
 * ร้าน: ราม (Barber Near Me รามคำแหง 24) · โลตัส (Barber Near Me Lotus ลาดพร้าว 101) · Kraft Barbers
 *
 * ไม่มี secret ในไฟล์นี้ — ค่าทั้งหมดอยู่ใน Script Properties (Project Settings → Script Properties):
 *   SHEET_ID          ID ของ Google Sheet "Barber Back Office 2026"
 *   LIFF_ID           LIFF ID (LINE Login channel)              เช่น 2012346628-xxxxxxxx
 *   LINE_CHANNEL_ID   LINE Login channel ID (ตรวจ ID token)     เช่น 2012346628
 *   LINE_TOKEN        Channel access token ของ Messaging API channel (OA @529vfxbd)
 *   (ระบบตั้งเอง) ADMINS, ADMIN_DEVICES, CLOSED_MONTHS, PAID_MONTHS, FOLDER_ID
 */
const TZ = 'Asia/Bangkok';
const P = () => PropertiesService.getScriptProperties();
const prop = k => P().getProperty(k) || '';
const SHEET_ID = () => prop('SHEET_ID');
const LIFF_ID = () => prop('LIFF_ID');
const LINE_CHANNEL_ID = () => prop('LINE_CHANNEL_ID');

// ชื่อแผ่น
const SH_SET = 'ตั้งค่า', SH_TIME = 'ลงเวลา', SH_DAILY = 'ยอดรายวัน', SH_EXP = 'รายจ่าย', SH_CASH = 'เงินสด', SH_PAY = 'เงินเดือน', SH_PL = 'กำไรขาดทุน', SH_DAILYPAY = 'โอนรายวัน';
// แผ่น ตั้งค่า: ช่าง A5:J24 (ชื่อ ร้านหลัก ขั้นต่ำ ปกส. จ่ายรายวัน PIN LINE userId วันเข้า วันออก สถานะ)
const B_ROW0 = 5, B_ROWS = 20, B_NAME = 1, B_SHOP = 2, B_MIN = 3, B_SSO = 4, B_DAILY = 5, B_PIN = 6, B_LINE = 7, B_START = 8, B_END = 9;
// ร้าน A28:L30 (ชื่อ วิธีคิด อัตรา โบนัส lat lng รัศมี เปิดกะ1 เปิดกะ2 ปิด เงินสดตั้งต้น ตั้งแต่วันที่)
const S_ROW0 = 28, S_ROWS = 3;
// เป้าหัว A34:D57 · ประเภทรายจ่าย A60:A69 · วิธีเก็บเงินสด D60:D61 · เหตุผลหยิบเงินสด G60:G62 · ผู้เก็บเริ่มต้น B71 · Admin PIN B73
const CELL_COLLECTOR = 'B71', CELL_ADMIN_PIN = 'B73';
// ลงเวลา: A วันที่ B ช่าง C ร้าน D กะ E เข้า F ออก G สาย H สถานะ I หมายเหตุ J gpsเข้า K gpsออก L เดือน(สูตร)
const T_DATE = 1, T_NAME = 2, T_SHOP = 3, T_SHIFT = 4, T_IN = 5, T_OUT = 6, T_LATE = 7, T_STATUS = 8, T_NOTE = 9, T_GPSIN = 10, T_GPSOUT = 11;
// ยอดรายวัน: A วันที่ B ร้าน C ช่าง D หัว E ยอด F เงินสด G โอน H คำนวณ(สูตร) I แก้ J จ่าย(สูตร) K หมายเหตุ L เดือน(สูตร) M ผู้บันทึก
const D_DATE = 1, D_SHOP = 2, D_NAME = 3, D_HEADS = 4, D_SALES = 5, D_CASH = 6, D_TRANSFER = 7, D_CALC = 8, D_OVER = 9, D_PAID = 10, D_NOTE = 11, D_MONTH = 12, D_BY = 13;
// รายจ่าย: A วันที่ B ร้าน C ประเภท D ช่าง E จำนวน F รายละเอียด G ผู้บันทึก H ลิงก์สลิป I เดือน(สูตร) J key(สูตร) K จ่ายจาก
const X_DATE = 1, X_SHOP = 2, X_TYPE = 3, X_NAME = 4, X_AMT = 5, X_DETAIL = 6, X_BY = 7, X_LINK = 8, X_FROM = 11;
// เงินสด: A วันที่ B ร้าน C วิธี D จำนวน E ผู้เก็บ F ผู้บันทึก G ลิงก์สลิป H เดือน(สูตร)
const C_DATE = 1, C_SHOP = 2, C_METHOD = 3, C_AMT = 4, C_WHO = 5, C_BY = 6, C_LINK = 7;
const CASH_FROM = 'เงินสดร้าน';
const SESSION_HOURS = 6, ADT_DAYS = 90, ADT_MAX = 6;
const FOLDER_NAME = 'Barber Back Office';

function ss() { return SpreadsheetApp.openById(SHEET_ID()); }
function sh(n) { const s = ss().getSheetByName(n); if (!s) throw new Error('ไม่พบแผ่น ' + n); return s; }
function ymd(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function ym(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM'); }
function hm(d) { return Utilities.formatDate(d, TZ, 'HH:mm'); }
function nowText() { return Utilities.formatDate(new Date(), TZ, 'HH:mm d MMM yyyy'); }
function todayBkk() { const [y, m, d] = ymd(new Date()).split('-').map(Number); return new Date(y, m - 1, d); }
function parseYmd(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim()); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function dateKey(v) { if (v instanceof Date) return ymd(v); const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || '')); return m ? m[1] : ''; }
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function money(v) { return num(v).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function clean(s, n) { return String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/[<>]/g, '').trim().slice(0, n || 200); }

/* ---------- ตั้งค่า ---------- */
function barbers(all) {
  const rows = sh(SH_SET).getRange(B_ROW0, 1, B_ROWS, 10).getValues();
  return rows.map((r, i) => ({ row: B_ROW0 + i, name: String(r[0]).trim(), shop: String(r[1]).trim(), min: num(r[2]), sso: num(r[3]), daily: r[4] === true, pin: String(r[5]).trim(), uid: String(r[6]).trim(), start: dateKey(r[7]), end: dateKey(r[8]) }))
    .filter(b => b.name && (all || !b.end));
}
function barberByName(n) { return barbers(true).find(b => b.name === String(n || '').trim()) || null; }
function barberByUid(uid) { uid = String(uid || '').trim(); return uid ? barbers(false).find(b => b.uid === uid) || null : null; }
function barberByPin(pin) { pin = String(pin || '').trim(); if (!pin) return null; const h = barbers(false).filter(b => b.pin === pin); return h.length === 1 ? h[0] : null; }
function shops() {
  const rows = sh(SH_SET).getRange(S_ROW0, 1, S_ROWS, 12).getValues();
  return rows.filter(r => r[0]).map(r => ({ name: String(r[0]).trim(), method: String(r[1]).trim(), rate: num(r[2]), bonus: num(r[3]), lat: num(r[4]), lng: num(r[5]), radius: num(r[6]) || 150, open1: tStr(r[7]), open2: tStr(r[8]), close: tStr(r[9]), cash0: num(r[10]), cashFrom: dateKey(r[11]) }));
}
function tStr(v) { if (v instanceof Date) return hm(v); const m = /^(\d{1,2}):(\d{2})/.exec(String(v || '')); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : ''; }
function expenseTypes() { return sh(SH_SET).getRange('A60:A69').getValues().map(r => String(r[0]).trim()).filter(Boolean); }
function cashMethods() { return sh(SH_SET).getRange('D60:D61').getValues().map(r => String(r[0]).trim()).filter(Boolean); }
function takeReasons() { return sh(SH_SET).getRange('G60:G62').getValues().map(r => String(r[0]).trim()).filter(Boolean); }
function defaultCollector() { return String(sh(SH_SET).getRange(CELL_COLLECTOR).getValue() || 'ดีน').trim(); }
function adminPin() { return String(sh(SH_SET).getRange(CELL_ADMIN_PIN).getValue() || '').trim(); }
function targets(ymStr) {
  const rows = sh(SH_SET).getRange('A33:D57').getValues(); const head = rows[0].map(v => String(v).trim());
  for (let i = 1; i < rows.length; i++) if (dateKey(rows[i][0]).slice(0, 7) === ymStr) { const o = {}; for (let c = 1; c < 4; c++) o[head[c]] = num(rows[i][c]); return o; }
  return {};
}
function setTarget(ymStr, shop, val) {
  const s = sh(SH_SET); const rows = s.getRange('A33:D57').getValues(); const head = rows[0].map(v => String(v).trim()); const c = head.indexOf(shop); if (c < 1) return false;
  for (let i = 1; i < rows.length; i++) if (dateKey(rows[i][0]).slice(0, 7) === ymStr) { s.getRange(33 + i, 1 + c).setValue(num(val)); return true; }
  return false;
}

/* ---------- ค่าแรง ---------- */
function calcWage(shopName, barber, heads, sales) {
  const s = shops().find(x => x.name === shopName); if (!s || !barber) return 0;
  const base = s.method === 'ต่อหัว' ? num(heads) * s.rate : num(sales) * s.rate;
  return Math.max(base, barber.min);
}

/* ---------- LINE: session / verify / push ---------- */
function verifyLineIdToken(idt) {
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'post', payload: { id_token: String(idt || ''), client_id: LINE_CHANNEL_ID() }, muteHttpExceptions: true });
    const j = JSON.parse(res.getContentText() || '{}');
    if (res.getResponseCode() !== 200 || !j.sub) return { ok: false, msg: j.error_description || j.error || ('HTTP ' + res.getResponseCode()) };
    return { ok: true, uid: j.sub, name: j.name || '' };
  } catch (e) { return { ok: false, msg: 'verify error: ' + e.message }; }
}
function newSession(uid, name) { const tok = 'lt:' + Utilities.getUuid(); CacheService.getScriptCache().put(tok, JSON.stringify({ uid, name }), SESSION_HOURS * 3600); return tok; }
function session(tok) { tok = String(tok || '').trim(); if (!/^lt:/.test(tok)) return null; const v = CacheService.getScriptCache().get(tok); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
function lineToken() { return prop('LINE_TOKEN'); }
const MSG_SPLIT = '␞';
function lineMsgs(text) { const out = []; String(text || '').split(MSG_SPLIT).forEach(t => { t = t.trim(); for (let i = 0; i < t.length && out.length < 5; i += 4900) out.push({ type: 'text', text: t.slice(i, i + 4900) }); }); return out.length ? out : [{ type: 'text', text: '-' }]; }
function linePush(to, text, imgUrl) {
  const tok = lineToken(); if (!tok || !to) return false;
  const msgs = lineMsgs(text).slice(0, 4); if (imgUrl) msgs.push({ type: 'image', originalContentUrl: imgUrl, previewImageUrl: imgUrl });
  try { const r = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + tok }, payload: JSON.stringify({ to, messages: msgs }), muteHttpExceptions: true }); return r.getResponseCode() === 200; } catch (e) { return false; }
}
function lineReply(replyToken, text) {
  const tok = lineToken(); if (!tok || !replyToken) return false;
  try { UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + tok }, payload: JSON.stringify({ replyToken, messages: lineMsgs(text) }), muteHttpExceptions: true }); return true; } catch (e) { return false; }
}
function pushBarber(name, text, img) { const b = barberByName(name); return b && b.uid ? linePush(b.uid, text, img) : false; }
/* แอดมิน: ADMINS = {uid: {name, role}} role = owner (ทิพย์) | office (ปิ๊ก) */
function admins() { try { return JSON.parse(prop('ADMINS') || '{}'); } catch (e) { return {}; } }
function adminRole(uid) { const a = admins()[String(uid || '')]; return a ? a.role : ''; }
function pushAdmins(text, roles, img) { const a = admins(); Object.keys(a).forEach(uid => { if (!roles || roles.includes(a[uid].role)) linePush(uid, text, img); }); }

/* ---------- token จดจำเครื่อง (แอป Dashboard) ---------- */
function adtHash(t) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'barber-adt:' + t, Utilities.Charset.UTF_8)); }
function adtList() { try { return JSON.parse(prop('ADMIN_DEVICES') || '[]'); } catch (e) { return []; } }
function adtSave(l) { P().setProperty('ADMIN_DEVICES', JSON.stringify(l)); }
function adtIssue(uid, label) {
  const t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); const now = Date.now();
  let l = adtList().filter(x => x.exp > now); l.push({ h: adtHash(t), uid, exp: now + ADT_DAYS * 86400000, at: Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm'), lb: clean(label, 40) });
  adtSave(l.slice(-ADT_MAX)); return t;
}
function adtUid(t) { t = String(t || ''); if (t.length < 40) return ''; const h = adtHash(t), now = Date.now(); const x = adtList().find(x => x.h === h && x.exp > now); return x ? x.uid : ''; }
/** ตัวตนแอดมินจาก token เครื่อง → {uid,name,role} หรือ null */
function adminFromAdt(t) { const uid = adtUid(t); if (!uid) return null; const a = admins()[uid]; return a ? { uid, name: a.name, role: a.role } : null; }

/* ---------- Web app ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.api) return apiJson(p);
  const t = HtmlService.createTemplateFromFile('Index');
  t.liffId = LIFF_ID(); t.tok = ''; t.name = ''; t.err = ''; t.who = 'null';
  t.mode = ['cash', 'collect', 'slip', 'late'].includes(p.mode) ? p.mode : '';
  if (p.idt) {
    const v = verifyLineIdToken(p.idt);
    if (v.ok) { t.tok = newSession(v.uid, v.name); t.name = clean(v.name, 40); try { t.who = JSON.stringify(whoAmI(t.tok)).replace(/<\//g, '<\\/'); } catch (err) {} }
    else t.err = clean(v.msg, 120);
  }
  return t.evaluate().setTitle('Barber Back Office').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  if (body.events) { try { webhook(body); } catch (err) {} return ContentService.createTextOutput('ok'); }
  return apiJson(body);
}
/** JSON API สำหรับแอป Dashboard (github.io) — ทุกคำสั่งต้องมี adt (token เครื่อง) ยกเว้น adt/adtcheck */
function apiJson(p) {
  let out;
  try {
    if (p.api === 'adt') {
      const v = verifyLineIdToken(p.idt);
      if (!v.ok) out = { ok: false, msg: v.msg };
      else { const a = admins()[v.uid]; if (!a) out = { ok: false, msg: 'บัญชี LINE นี้ยังไม่ได้ผูกเป็นแอดมิน — พิมพ์ "ผูกทิพย์ <Admin PIN>" หรือ "ผูกปิ๊ก <Admin PIN>" ในแชท OA ก่อน' }; else { out = { ok: true, adt: adtIssue(v.uid, p.lb), name: a.name, role: a.role }; linePush(v.uid, '🔐 จดจำเครื่องใหม่สำหรับแอป Barber Back Office แล้ว (' + clean(p.lb, 40) + ') ใช้ได้ ' + ADT_DAYS + ' วัน\nถ้าไม่ใช่คุณ พิมพ์ "ล้างเครื่อง"'); } }
    } else if (p.api === 'adtcheck') { const a = adminFromAdt(p.adt); out = a ? { ok: true, name: a.name, role: a.role } : { ok: false }; }
    else { const a = adminFromAdt(p.adt); if (!a) out = { ok: false, expired: true, msg: 'หมดอายุ กรุณาล็อกอิน LINE ใหม่' }; else out = officeApi(a, p); }
  } catch (err) { out = { ok: false, msg: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- LINE webhook (Webhook URL = ลิงก์ /exec) ---------- */
function webhook(body) {
  (body.events || []).forEach(ev => {
    const src = ev.source || {}; if (src.type !== 'user') return;
    if (ev.type === 'follow') { linePush(src.userId, 'สวัสดีค่ะ 👋 นี่คือระบบหลังบ้านร้านตัดผม\nช่าง: กดเมนู "ลงเวลา" ด้านล่าง แล้วใส่ PIN ที่ได้จากทิพย์ครั้งแรกครั้งเดียว\nพิมพ์ "คู่มือ" เพื่อดูวิธีใช้'); return; }
    if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
    const txt = String(ev.message.text).trim(), uid = src.userId, rt = ev.replyToken;
    let m;
    if ((m = /^ผูก(ทิพย์|ปิ๊ก)\s*(\S+)$/.exec(txt))) {
      if (m[2] !== adminPin() || !adminPin()) { lineReply(rt, '❌ Admin PIN ไม่ถูกต้อง'); return; }
      const a = admins(); a[uid] = { name: m[1], role: m[1] === 'ทิพย์' ? 'owner' : 'office' }; P().setProperty('ADMINS', JSON.stringify(a));
      lineReply(rt, '✅ ผูกบัญชี ' + m[1] + ' แล้ว\n• เปิดแอป Dashboard: ' + appUrl() + ' (ล็อกอิน LINE ครั้งเดียว แล้ว "เพิ่มไปยังหน้าจอโฮม")\n• พิมพ์ "คู่มือ" ดูวิธีใช้'); sendManual(uid); return;
    }
    if (/^ล้างเครื่อง$/.test(txt) && adminRole(uid)) { const n = adtList().length; adtSave([]); lineReply(rt, '🔐 ยกเลิกการจดจำเครื่องแล้ว ' + n + ' เครื่อง — เปิดแอปครั้งต่อไปต้องล็อกอิน LINE ใหม่'); return; }
    if ((m = /^โอนแล้ว\s*(\d{4}-\d{2})?$/.exec(txt)) && adminRole(uid) === 'owner') { const r = confirmPaid(m[1] || prevMonth()); lineReply(rt, r.msg); return; }
    if (/^(คู่มือ|manual|วิธีใช้)$/i.test(txt)) { sendManual(uid, rt); return; }
    if (/^(สถานะ|status)$/i.test(txt)) { lineReply(rt, statusText()); return; }
    if (/^(สลิป|slip)$/i.test(txt)) { lineReply(rt, 'เปิดสลิปเงินเดือน: https://liff.line.me/' + LIFF_ID() + '?mode=slip'); return; }
    if (adminRole(uid)) lineReply(rt, 'คำสั่ง: คู่มือ · สถานะ · โอนแล้ว yyyy-MM · ล้างเครื่อง\nแอป Dashboard: ' + appUrl());
    else lineReply(rt, 'กดเมนูด้านล่างเพื่อใช้งาน หรือพิมพ์ "คู่มือ"');
  });
}
function appUrl() { return prop('APP_URL') || 'https://thipwonh-ship-it.github.io/barber-back-office/admin.html'; }
function prevMonth() { const d = todayBkk(); d.setDate(0); return ym(d); }
function statusText() {
  const t = ymd(todayBkk()); const rows = sh(SH_TIME).getRange(2, 1, Math.max(sh(SH_TIME).getLastRow() - 1, 1), T_NOTE).getValues().filter(r => dateKey(r[0]) === t);
  const lines = rows.map(r => '• ' + r[T_NAME - 1] + ' ' + r[T_SHOP - 1] + ' เข้า ' + tStr(r[T_IN - 1]) + (r[T_OUT - 1] ? ' ออก ' + tStr(r[T_OUT - 1]) : '') + (num(r[T_LATE - 1]) > 0 ? ' สาย ' + num(r[T_LATE - 1]) + ' น.' : ''));
  return '📍 วันนี้ ' + t + '\n' + (lines.length ? lines.join('\n') : 'ยังไม่มีใครกดเข้างาน');
}

/* ---------- run-once / setup ---------- */
/** รัน 1 ครั้งหลังใส่ Script Properties: ขอสิทธิ์ + ตรวจชีต + สร้างโฟลเดอร์ Drive + เติมหัวคอลัมน์ที่ระบบต้องใช้ */
function setup() {
  const s = ss(); const out = [];
  [SH_SET, SH_TIME, SH_DAILY, SH_EXP, SH_CASH, SH_PAY, SH_PL].forEach(n => out.push(s.getSheetByName(n) ? '✓ ' + n : '✗ ไม่พบแผ่น ' + n));
  if (!s.getSheetByName(SH_DAILYPAY)) { const d = s.insertSheet(SH_DAILYPAY); d.getRange('A1:G1').setValues([['วันที่โอน', 'ช่าง', 'ยอดของวันที่', 'จำนวน', 'ผู้โอน', 'ลิงก์สลิป', 'หมายเหตุ']]).setFontWeight('bold'); d.setFrozenRows(1); out.push('+ สร้างแผ่น ' + SH_DAILYPAY); }
  const st = s.getSheetByName(SH_SET);
  if (!st.getRange('K27').getValue()) st.getRange('K27:L27').setValues([['เงินสดตั้งต้น', 'ตั้งแต่วันที่']]).setFontWeight('bold');
  if (!st.getRange('A73').getValue()) st.getRange('A73:B73').setValues([['Admin PIN (ทิพย์/ปิ๊กใช้ผูก LINE)', '']]);
  const ex = s.getSheetByName(SH_EXP); if (ex.getMaxColumns() < X_FROM) ex.insertColumnsAfter(ex.getMaxColumns(), X_FROM - ex.getMaxColumns());
  if (!ex.getRange(1, X_FROM).getValue()) ex.getRange(1, X_FROM).setValue('จ่ายจาก').setFontWeight('bold');
  folder(); UrlFetchApp.fetch('https://api.line.me', { muteHttpExceptions: true });
  out.push('Script Properties: ' + ['SHEET_ID', 'LIFF_ID', 'LINE_CHANNEL_ID', 'LINE_TOKEN'].map(k => k + '=' + (prop(k) ? 'ตั้งแล้ว' : 'ยังไม่ตั้ง')).join(' · '));
  out.push('Admin PIN: ' + (adminPin() ? 'ตั้งแล้ว' : 'ยังไม่ตั้ง (ใส่ที่ ตั้งค่า!B73)'));
  return out.join('\n');
}
function folder() {
  let id = prop('FOLDER_ID'); if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const it = DriveApp.getFoldersByName(FOLDER_NAME); const f = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  P().setProperty('FOLDER_ID', f.getId()); return f;
}
function subFolder(name) { const f = folder(); const it = f.getFoldersByName(name); return it.hasNext() ? it.next() : f.createFolder(name); }
/** บันทึกรูป (dataURL) ลง Drive → คืน {url, viewUrl} (แชร์แบบมีลิงก์ เพื่อส่งเข้า LINE ได้) */
function saveImage(dataUrl, sub, fileName, share) {
  const m = /^data:(image\/\w+|application\/pdf);base64,(.+)$/.exec(String(dataUrl || '')); if (!m) return null;
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fileName + (m[1] === 'application/pdf' ? '.pdf' : '.jpg'));
  const f = subFolder(sub).createFile(blob);
  if (share) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: f.getUrl(), img: 'https://drive.google.com/uc?export=view&id=' + f.getId() };
}
/** ทดสอบส่ง LINE หาแอดมินทุกคน */
function testLine() { pushAdmins('ทดสอบระบบ Barber Back Office ' + nowText()); return 'ส่งแล้ว (ถ้าไม่ได้รับ: เช็ค LINE_TOKEN และผูกแอดมินก่อน)'; }

/* ---------- Rich menu (รัน 1 ครั้งหลังใส่ LINE_TOKEN) ---------- */
/** สร้าง Rich menu 4 ปุ่ม (ลงเวลา / หยิบเงินสด / เก็บเงินสด / สลิป) และตั้งเป็นเมนูหลักของ OA — รูปจาก docs/richmenu.png บน GitHub Pages */
function setupRichMenu() { const r = setupRichMenu_(); Logger.log(r); return r; }
function setupRichMenu_() {
  const tok = lineToken(); if (!tok) return 'ยังไม่ได้ตั้ง LINE_TOKEN';
  const cur = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu', { headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true });
  if (cur.getResponseCode() === 200) return 'มี Rich menu หลักอยู่แล้ว: ' + cur.getContentText() + ' (ถ้าต้องการสร้างใหม่ ให้ลบของเดิมก่อนด้วย deleteRichMenus)';
  const liff = 'https://liff.line.me/' + LIFF_ID();
  const hdr = { Authorization: 'Bearer ' + tok };
  const W = 2500, H = 843, cw = W / 4;
  const areas = ['', '?mode=cash', '?mode=collect', '?mode=slip'].map((q, i) => ({ bounds: { x: i * cw, y: 0, width: cw, height: H }, action: { type: 'uri', label: ['ลงเวลา', 'หยิบเงินสด', 'เก็บเงินสด', 'สลิป'][i], uri: liff + q } }));
  const body = { size: { width: W, height: H }, selected: true, name: 'Barber Back Office', chatBarText: 'เมนู', areas };
  const r1 = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu', { method: 'post', contentType: 'application/json', headers: hdr, payload: JSON.stringify(body), muteHttpExceptions: true });
  if (r1.getResponseCode() !== 200) return 'สร้างเมนูไม่สำเร็จ: ' + r1.getContentText();
  const id = JSON.parse(r1.getContentText()).richMenuId;
  const img = UrlFetchApp.fetch(appUrl().replace(/admin\.html$/, '') + 'richmenu.png').getBlob().setContentType('image/png');
  const r2 = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/richmenu/' + id + '/content', { method: 'post', contentType: 'image/png', headers: hdr, payload: img.getBytes(), muteHttpExceptions: true });
  if (r2.getResponseCode() !== 200) return 'อัปโหลดรูปไม่สำเร็จ: ' + r2.getContentText();
  const r3 = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu/' + id, { method: 'post', headers: hdr, muteHttpExceptions: true });
  return r3.getResponseCode() === 200 ? 'ตั้ง Rich menu แล้ว: ' + id : 'ตั้งเมนูหลักไม่สำเร็จ: ' + r3.getContentText();
}
/** ลบ Rich menu ทั้งหมดของ OA (ใช้ก่อน setupRichMenu ใหม่) */
function deleteRichMenus() {
  const h = { Authorization: 'Bearer ' + lineToken() };
  const list = JSON.parse(UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list', { headers: h, muteHttpExceptions: true }).getContentText() || '{}').richmenus || [];
  list.forEach(m => UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/' + m.richMenuId, { method: 'delete', headers: h, muteHttpExceptions: true }));
  Logger.log('ลบแล้ว ' + list.length); return list.length;
}
/** ตรวจว่า OA มี Rich menu หลักแล้วหรือยัง (ดูผลใน Execution log) */
function checkRichMenu() {
  const r = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu', { headers: { Authorization: 'Bearer ' + lineToken() }, muteHttpExceptions: true });
  Logger.log(r.getResponseCode() + ' ' + r.getContentText()); return r.getContentText();
}
