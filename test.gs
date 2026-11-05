/* TEMP OCR TEST */
function _t(){
  const K=Utilities.newBlob('').getBytes(); const key=__KEY__.match(/../g).map(h=>{let v=parseInt(h,16);return v>127?v-256:v;});
  const names=['k1','bbl','scb1','scb1b','k2','ktb','ktbR','scb2'];
  const out={};
  names.forEach(nm=>{
    const e=UrlFetchApp.fetch('https://raw.githubusercontent.com/thipwonh-ship-it/barber-back-office/tmp-ocr/'+nm+'.bin').getContent();
    const d=e.map((x,i)=>{let v=(x^key[i%32]);v=v&255;return v>127?v-256:v;});
    out[nm]=_ocrT(Utilities.newBlob(d,'image/jpeg',nm+'.jpg'));
  });
  const f=DriveApp.createFile('ocr-test-out.json',JSON.stringify(out),'application/json');
  Logger.log('OUTID='+f.getId());
}
function _ocrT(blob) {
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
function thaiNorm(t) { return String(t || '').replace(/\u0E4D\u0E32/g, '\u0E33').replace(/[\u0E48-\u0E4B]/g, ''); }
