/** Slip.gs — สลิปเงินเดือน PDF (Google Docs → PDF) + ข้อความสรุป */
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
function periodTh(ymStr) { const [y, m] = ymStr.split('-').map(Number); return TH_MONTHS[m - 1] + ' ' + (y + 543); }
function shopFull(s) { return { 'ราม': 'Barber Near Me รามคำแหง 24', 'โลตัส': 'Barber Near Me Lotus ลาดพร้าว 101', 'Kraft': 'Kraft Barbers' }[s] || s; }

/** บรรทัดสรุปสำหรับข้อความไลน์ (p = แถวจาก payrollData; ถ้าไม่ส่งมาจะหาให้) */
function slipLines(name, ymStr, p) {
  if (!p) { p = payrollData(ymStr).people.find(x => x.name === name); if (!p) return ['ไม่พบข้อมูล']; }
  const L = ['ร้าน ' + p.shop + ' · ทำงาน ' + p.days + ' วัน · ' + p.heads + ' หัว · ยอด ' + money(p.sales), 'ค่าแรง ' + money(p.wage)];
  if (p.bonus) L.push('+ โบนัสถึงเป้า ' + money(p.bonus)); if (p.advance) L.push('− เบิก ' + money(p.advance)); if (p.sso) L.push('− ประกันสังคม ' + money(p.sso)); if (p.dailyPaid) L.push('− โอนรายวันแล้ว ' + money(p.dailyPaid));
  L.push('= สุทธิรับวันที่ 2: ' + money(p.net) + ' บาท'); if (p.late) L.push('(สาย ' + p.late + ' ครั้ง รวม ' + p.lateMin + ' นาที — บันทึกไว้ ไม่หัก)');
  return L;
}
function findSlipFile(name, ymStr) { const f = subFolder('สลิป ' + ymStr); const it = f.getFilesByName('สลิป ' + ymStr + ' ' + name + '.pdf'); return it.hasNext() ? it.next() : null; }

/** สร้าง PDF 1 คน → Blob (ชื่อไฟล์ "สลิป yyyy-MM ชื่อ.pdf") */
function slipPdfBlob(p, ymStr) {
  const fmt = v => num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const doc = DocumentApp.create('slip_tmp_' + ymStr + '_' + p.name); const body = doc.getBody();
  body.setMarginTop(40).setMarginBottom(40).setMarginLeft(50).setMarginRight(50);
  const st = {}; st[DocumentApp.Attribute.FONT_FAMILY] = 'Sarabun'; st[DocumentApp.Attribute.FONT_SIZE] = 11; body.setAttributes(st);
  body.appendParagraph(shopFull(p.shop)).setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setFontSize(16).setBold(true);
  body.appendParagraph('สลิปค่าแรงช่าง / PAYSLIP').setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setFontSize(13).setBold(true);
  body.appendParagraph('งวดเดือน ' + periodTh(ymStr) + '   ·   จ่ายวันที่ 2 ' + periodTh(nextYm(ymStr))).setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setFontSize(10);
  body.appendParagraph('');
  const info = body.appendTable([['ชื่อช่าง', p.name, 'ร้านหลัก', p.shop], ['วันทำงาน', p.days + ' วัน', 'จำนวนหัว', p.heads + ' หัว (ร้านรวม ' + p.shopHeads + (p.target ? ' / เป้า ' + p.target : '') + ')'], ['ยอดขายรวม', fmt(p.sales) + ' บาท', 'มาสาย', (p.late || 0) + ' ครั้ง (' + (p.lateMin || 0) + ' นาที)']]);
  info.setBorderColor('#DDDDDD'); for (let i = 0; i < 3; i++) { info.getRow(i).getCell(0).setBackgroundColor('#F2F2F2').editAsText().setBold(true); info.getRow(i).getCell(2).setBackgroundColor('#F2F2F2').editAsText().setBold(true); }
  body.appendParagraph('');
  const earn = [['ค่าแรง (ตามยอด/ขั้นต่ำ)', p.wage], ['โบนัสถึงเป้า', p.bonus], ['', '']];
  const ded = [['เบิกล่วงหน้า', p.advance], ['ประกันสังคม', p.sso], ['โอนรายวันแล้ว', p.dailyPaid]];
  const cells = [['รายได้', 'บาท', 'รายการหัก', 'บาท']]; for (let i = 0; i < 3; i++) cells.push([earn[i][0], earn[i][0] ? fmt(earn[i][1]) : '', ded[i][0], fmt(ded[i][1])]);
  cells.push(['รวมรายได้', fmt(p.wage + p.bonus), 'รวมหัก', fmt(p.advance + p.sso + p.dailyPaid)]);
  const tb = body.appendTable(cells); tb.setBorderColor('#BBBBBB');
  for (let c = 0; c < 4; c++) { tb.getRow(0).getCell(c).setBackgroundColor('#1F3864').editAsText().setBold(true).setForegroundColor('#FFFFFF'); tb.getRow(4).getCell(c).setBackgroundColor('#E2EFDA').editAsText().setBold(true); }
  for (let r = 1; r <= 4; r++) [1, 3].forEach(c => tb.getRow(r).getCell(c).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.RIGHT));
  body.appendParagraph('');
  const net = body.appendTable([['สุทธิรับวันที่ 2 (NET PAY)', fmt(p.net) + '  บาท']]); net.setBorderColor('#1F3864');
  net.getRow(0).getCell(0).setBackgroundColor('#FFF2CC').editAsText().setBold(true).setFontSize(13); net.getRow(0).getCell(1).setBackgroundColor('#FFF2CC').editAsText().setBold(true).setFontSize(13); net.getRow(0).getCell(1).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  body.appendParagraph(''); body.appendParagraph('ผู้จ่ายเงิน ............................................          ผู้รับเงิน ............................................').editAsText().setFontSize(10);
  body.appendParagraph('ออกโดยระบบ Barber Back Office เมื่อ ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm')).editAsText().setFontSize(8).setForegroundColor('#888888');
  doc.saveAndClose();
  const blob = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName('สลิป ' + ymStr + ' ' + p.name + '.pdf'); DriveApp.getFileById(doc.getId()).setTrashed(true); return blob;
}
function nextYm(ymStr) { const d = parseYmd(ymStr + '-01'); d.setMonth(d.getMonth() + 1); return ym(d); }
/** รันครั้งเดียวเพื่อขอสิทธิ์ Google Docs/Drive */
function authDocs() { const d = DocumentApp.create('ทดสอบสิทธิ์'); const id = d.getId(); d.saveAndClose(); DriveApp.getFileById(id).setTrashed(true); folder(); return 'พร้อม'; }
