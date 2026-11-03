# ขั้นตอนติดตั้ง (ทำครั้งเดียว ~30 นาที)

ของที่มีแล้ว: Google Sheet "Barber Back Office 2026" · LINE OA @529vfxbd (Messaging API channel 2011900471) · LINE Login channel 2012346628 + LIFF 2012346628-T0nYneoW · repo นี้ (GitHub Pages ที่ `docs/`)

## 1. Apps Script
1. เปิด Google Sheet "Barber Back Office 2026" → เมนู **ส่วนขยาย → Apps Script** (จะได้โปรเจกต์ที่ผูกกับชีตนี้)
2. ตั้งชื่อโปรเจกต์ "Barber Back Office"
3. สร้างไฟล์ให้ครบตามนี้ แล้วคัดลอกเนื้อหาจาก repo วางทับ (ไฟล์ `Code.gs` มีอยู่แล้ว ให้วางทับ):
   - Script: `Code`, `Staff`, `Office`, `Slip`, `Manuals`
   - HTML: `Index`
4. **Project Settings (⚙️) → Script Properties → Add script property** ใส่ 4 ค่า:
   - `SHEET_ID` = ID ของชีต (ในลิงก์ระหว่าง `/d/` กับ `/edit`)
   - `LIFF_ID` = `2012346628-T0nYneoW`
   - `LINE_CHANNEL_ID` = `2012346628`
   - `LINE_TOKEN` = Channel access token (LINE Developers → Provider Tamink → **BarberNearMeInHouse** → tab Messaging API → Channel access token (long-lived) → **Issue** → copy)
5. ในชีต แผ่น **ตั้งค่า** ช่อง **B73** ใส่ Admin PIN (ตัวเลข 4–6 หลัก คิดเอง)
6. ใน Apps Script เลือกฟังก์ชัน **`setup`** → Run → กด Allow สิทธิ์ทั้งหมด → ดู Execution log ต้องขึ้น ✓ ทุกแผ่น และ "ตั้งแล้ว" ทุกค่า
7. เลือกฟังก์ชัน **`authDocs`** → Run (ขอสิทธิ์ Docs/Drive สำหรับสลิป PDF)
8. **Deploy → New deployment** → ⚙️ เลือก **Web app** → Execute as: **Me** · Who has access: **Anyone** → Deploy → copy **Web app URL** (ลงท้าย `/exec`)

## 2. GitHub Pages
1. แก้ `docs/config.js` ใส่ Web app URL จากข้อ 1.8 ที่ `GAS_URL` → commit/push (หรือส่ง URL ให้ Claude แก้ให้)
2. GitHub → repo → Settings → Pages → Source: **Deploy from a branch** → Branch `main` / folder **`/docs`** → Save
3. รอ 1–2 นาที แล้วเปิด `https://thipwonh-ship-it.github.io/barber-back-office/admin.html` ต้องเห็นหน้า "ล็อกอินด้วย LINE"

## 3. LINE Developers
1. LINE Login channel **Barber Back Office** → tab **LIFF** → แก้ Endpoint URL เป็น `https://thipwonh-ship-it.github.io/barber-back-office/`
2. หน้าเดียวกัน ด้านบนข้างชื่อ channel: เปลี่ยนจาก **Developing → Published** (ไม่งั้นช่างเปิดไม่ได้)
3. Messaging API channel **BarberNearMeInHouse** → tab Messaging API:
   - Webhook URL = Web app URL (`/exec`) → Verify → **Use webhook: On**
   - Auto-reply messages: ปิด (ไปที่ LINE Official Account Manager → Response settings → ปิด Auto-response)

## 4. Rich menu
วิธีง่าย: ใน Apps Script เลือกฟังก์ชัน **`setupRichMenu`** → Run (ต้องใส่ `LINE_TOKEN` และเปิด GitHub Pages ก่อน) — ระบบสร้างเมนู 4 ปุ่มจากรูป `docs/richmenu.png` ให้เอง

วิธีทำเอง (LINE Official Account Manager → Rich menus → Create): ขนาด Large · 4 ช่อง · แต่ละช่องเป็น Link:
| ช่อง | ข้อความ | ลิงก์ |
|---|---|---|
| 1 | ⏰ ลงเวลา | `https://liff.line.me/2012346628-T0nYneoW` |
| 2 | 💵 หยิบเงินสด | `https://liff.line.me/2012346628-T0nYneoW?mode=cash` |
| 3 | 🏦 เก็บเงินสด | `https://liff.line.me/2012346628-T0nYneoW?mode=collect` |
| 4 | 🧾 สลิป | `https://liff.line.me/2012346628-T0nYneoW?mode=slip` |

## 5. เริ่มใช้งาน
1. ทิพย์: เพิ่มเพื่อน OA @529vfxbd → พิมพ์ `ผูกแอดมิน <Admin PIN>` · ปิ๊ก: พิมพ์ `ผูกปิ๊ก <Admin PIN>`
2. เปิด `https://thipwonh-ship-it.github.io/barber-back-office/admin.html` → ล็อกอิน LINE → Safari/Chrome: **แชร์ → เพิ่มไปยังหน้าจอโฮม** (ได้ไอคอน ✂️)
3. ใส่ PIN ช่างในแผ่น ตั้งค่า คอลัมน์ F (Pond, M, Phoom, Leko, Bow) · บอก PIN ช่างแต่ละคน
4. ช่าง: เพิ่มเพื่อน OA → กดเมนู "ลงเวลา" → ใส่ PIN ครั้งแรก → ใช้ได้เลย (คู่มือส่งเข้าไลน์อัตโนมัติ)
5. ทดสอบ: ให้ช่าง 1 คนกดเข้างาน → ทิพย์ควรเห็นในแอป "วันนี้"

## แก้ปัญหา
- แอปขึ้น "ยังไม่ได้ตั้ง GAS_URL" → แก้ `docs/config.js`
- ช่างเปิดเมนูแล้วค้าง/ขาว → LINE Login channel ยังเป็น Developing หรือ Endpoint URL ผิด
- ไม่มีข้อความไลน์เข้า → `LINE_TOKEN` ผิด หรือ Webhook ยังไม่ On · รัน `testLine` ใน Apps Script
- หลังแก้โค้ด ต้อง Deploy → Manage deployments → New version ทุกครั้ง
