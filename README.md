# Barber Back Office — ระบบหลังบ้านร้านตัดผม 3 ร้าน (LINE OA + Google Apps Script + Google Sheets)

ราม (Barber Near Me รามคำแหง 24) · โลตัส (Barber Near Me Lotus ลาดพร้าว 101) · Kraft Barbers

ช่างลงเวลา/หยิบเงินสด/เก็บเงินสดผ่าน LINE · ปิ๊กกรอกหัว-ยอดผ่านแอปมือถือ · ทิพย์เห็นกำไรต่อร้าน จ่ายเงินเดือนวันที่ 2 และส่งสลิปให้ช่างทางไลน์ · ไม่มีเซิร์ฟเวอร์ ไม่มีค่าใช้จ่าย

> ไม่มี secret ใน repo นี้ — token/ID ทั้งหมดอยู่ใน Script Properties ของ Apps Script

## ภาพรวม

```
ช่าง ──LINE OA @529vfxbd (Rich menu) ──▶ docs/index.html (หน้าช่าง LIFF, github.io) ──JSON API (session/staff)──▶ Apps Script (Staff.gs)
                                                                                         │  ลงเวลา GPS · หยิบเงินสด · เก็บเงินสด · สลิป
ทิพย์/ปิ๊ก ──ไอคอนบนมือถือ──▶ docs/admin.html (แอป Dashboard, github.io) ──JSON API──▶ Apps Script (Office.gs)
                                                                                         │  วันนี้ · กรอกยอด · รายจ่าย · โอนรายวัน · รายเดือน · เงินเดือน
                                                                                         ▼
                                                          Google Sheet "Barber Back Office 2026" (ตั้งค่า / ลงเวลา / ยอดรายวัน / รายจ่าย / เงินสด / โอนรายวัน / เงินเดือน / กำไรขาดทุน)
                                                          Google Drive "Barber Back Office" (สลิป PDF, รูปสลิปโอน, ใบเสร็จ)
```

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `Code.gs` | ค่าคงที่, อ่านแผ่น ตั้งค่า, LINE (verify ID token, push, webhook), token จดจำเครื่อง, `doGet`/`doPost`, `setup()` |
| `Staff.gs` | ฝั่งช่าง: ผูก LINE ด้วย PIN, ลงเวลา + GPS + สาย, หยิบเงินสด, เก็บเงินสด, สรุป/สลิปของฉัน |
| `Office.gs` | API แอป Dashboard: วันนี้, กรอกยอด (คิดค่าแรง), รายจ่าย, โอนรายวัน, รายเดือน, เงินเดือน, ปิดงวด, โอนแล้ว, จัดการช่าง |
| `Slip.gs` | สลิปเงินเดือน PDF (Google Docs → PDF) |
| `Manuals.gs` | คู่มือตามบทบาท (พิมพ์ "คู่มือ" ในไลน์) |
| `Index.html` | หน้าช่างแบบเก่า (รันใน GAS โดยตรง — ไม่ได้ใช้แล้ว เก็บไว้สำรอง) |
| `appsscript.json` | ค่าโปรเจกต์ Apps Script |
| `docs/index.html` | หน้าช่าง (LIFF): ลงเวลา GPS · หยิบเงินสด · เก็บเงินสด · สลิป — คุยกับ Apps Script ผ่าน JSON API |
| `docs/admin.html` | แอป Dashboard ทิพย์/ปิ๊ก (PWA เพิ่มไอคอนหน้าจอได้) |
| `docs/config.js` | LIFF ID + URL ของ Apps Script (ค่าสาธารณะ) |
| `docs/คู่มือ*.md` | คู่มือ ช่าง / ปิ๊ก / ทิพย์ |
| `DEPLOY.md` | ขั้นตอนติดตั้งทีละขั้น |

## กติกาที่ระบบใช้ (แก้ได้ในแผ่น ตั้งค่า)
- ค่าแรง ราม/โลตัส = 50% ของยอด · Kraft = 200/หัว · ขั้นต่ำ/วัน ต่อช่าง (Pond, Phoom 550 · Bow 600 · อื่น 500) · ปิ๊กแก้ค่าแรงได้ (ช่อง "ค่าแรงที่แก้")
- โบนัส 1,000/คน ทุกคนในร้านที่ตัดครบเป้าหัวของเดือน (ทิพย์ตั้งเป้าต้นเดือน)
- ประกันสังคมหักต่อคนตามแผ่น ตั้งค่า · เบิก หักจากค่าแรง · มาสาย บันทึกนาที ไม่หัก
- ปอน: ปิ๊กโอนรายวัน (ยอดของ 2 วันก่อน) → วันที่ 2 รับเฉพาะ โบนัส − ปกส. − เบิก · ช่างอื่น ทิพย์โอนวันที่ 2
- รีวิว Google 50 / ขายผลิตภัณฑ์ 50: ช่างหยิบเงินสด → รายจ่ายร้าน (ไม่หักค่าแรง)
- เงินสดคงเหลือควรมี = ตั้งต้น + เงินสดจากยอดขาย − รายจ่ายที่ "จ่ายจาก: เงินสดร้าน" − เก็บเงินสดไปแล้ว

## Script Properties (Apps Script → Project Settings → Script Properties)
| Key | ค่า |
|---|---|
| `SHEET_ID` | ID ของ Google Sheet (ส่วนในลิงก์ระหว่าง `/d/` กับ `/edit`) |
| `LIFF_ID` | LIFF ID จาก LINE Login channel |
| `LINE_CHANNEL_ID` | LINE Login channel ID (ตัวที่มี LIFF) |
| `LINE_TOKEN` | Channel access token ของ Messaging API channel (**ห้ามใส่ใน repo/แชท**) |
| `APP_URL` | (ไม่บังคับ) URL แอป Dashboard ถ้าไม่ใช่ค่าเริ่มต้น |

ระบบตั้งเองตอนใช้งาน: `ADMINS`, `ADMIN_DEVICES`, `CLOSED_MONTHS`, `PAID_MONTHS`, `FOLDER_ID`

## คำสั่งในไลน์ OA
| พิมพ์ | ใครใช้ | ผล |
|---|---|---|
| `ผูกแอดมิน <Admin PIN>` / `ผูกผู้จัดการ <Admin PIN>` | ทิพย์ / ปิ๊ก | ผูกบัญชีเป็นแอดมิน (Admin PIN อยู่ที่ ตั้งค่า!B73) |
| `คู่มือ` | ทุกคน | คู่มือตามบทบาท |
| `สถานะ` | แอดมิน | ใครเข้างานวันนี้ |
| `โอนแล้ว yyyy-MM` | ทิพย์ | ปิดงวด (ถ้ายัง) + ส่งสลิปให้ช่างทุกคน |
| `ล้างเครื่อง` | แอดมิน | ยกเลิกเครื่องที่จำไว้ทั้งหมด |

## การแก้โค้ดบนระบบที่ใช้งานอยู่
1. แก้ไฟล์ใน repo → วางทับใน Apps Script editor → บันทึก
2. Deploy → Manage deployments → ✏️ → Version: New version → Deploy (ลิงก์เดิม)
3. หน้าใน `docs/` อัปเดตเองเมื่อ push (GitHub Pages)

---
สร้าง พ.ย. 2569 สำหรับ Barber Near Me / Kraft Barbers · ผู้ดูแล: ทิพย์

## วันเริ่มใช้ระบบ
- `START_DATE = '2026-11-01'` (Code.gs) และ `START_YM` (docs/config.js): หน้าช่าง / Dashboard แสดงข้อมูลตั้งแต่ 1 พ.ย. 2569 เท่านั้น
- ข้อมูลเก่าที่ย้ายจาก NewBarber2026.xlsx (ต.ค. 68 – ต.ค. 69) ยังเก็บอยู่ใน Google Sheet (แผ่น ยอดรายวัน / รายจ่าย / กำไรขาดทุน / เงินเดือน) ไว้ดูย้อนหลัง
