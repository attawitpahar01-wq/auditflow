# AuditFlow LINE Audit Coach

MVP นี้ต่อยอดจาก AuditFlow Web ให้ผู้ใช้ติดตามงาน audit ผ่าน LINE Official Account, LIFF, Google Apps Script และ Google Sheet

## Sheet Schema

### Users

| Column | Description |
| --- | --- |
| userId | LINE userId จริงจาก LIFF หรือ webhook |
| displayName | ชื่อจาก LINE profile |
| role | auditor, senior, supervisor, manager, admin |
| team | ทีม/แผนก/สาขา |
| status | active, inactive |
| registeredAt | เวลาลงทะเบียน |
| lastSeenAt | เวลาล่าสุดที่ระบบเห็นผู้ใช้ |

### AuditTasks

| Column | Description |
| --- | --- |
| taskId | รหัสงาน เช่น INV-001 |
| title | ชื่องาน |
| description | รายละเอียดงาน |
| auditArea | พื้นที่ audit เช่น Inventory, Tax, Payment |
| ownerUserId | LINE userId ของผู้รับผิดชอบ |
| ownerName | ชื่อผู้รับผิดชอบ |
| team | ทีม/สาขา |
| priority | low, medium, high, critical |
| risk | low, medium, high, critical |
| status | todo, pending, in_progress, review, done |
| dueDate | วันครบกำหนด yyyy-mm-dd |
| sourceTemplateId | template ที่ใช้สร้างงาน |
| notes | note ล่าสุด |
| completedAt | เวลาปิดงาน |
| updatedAt | เวลาแก้ไขล่าสุด |
| createdAt | เวลาสร้าง |

### AuditFindings

| Column | Description |
| --- | --- |
| findingId | รหัส finding |
| taskId | อ้างอิง AuditTasks.taskId |
| userId | ผู้สร้าง finding |
| displayName | ชื่อผู้สร้าง |
| severity | low, medium, high, critical |
| description | รายละเอียด finding |
| status | open, in_progress, resolved, closed |
| createdAt | เวลาสร้าง |
| updatedAt | เวลาแก้ไข |

### DailySummary

| Column | Description |
| --- | --- |
| summaryId | yyyy-mm-dd:userId:morning/evening |
| date | วันที่ |
| userId | LINE userId |
| displayName | ชื่อผู้ใช้ |
| type | morning, evening |
| highPriorityCount | งาน high/critical วันนี้ |
| pendingCount | งาน pending/todo/in_progress |
| overdueCount | งานเกินกำหนด |
| dueSoonCount | งานใกล้ deadline |
| highRiskCount | งาน high/critical risk |
| doneCount | งานเสร็จวันนี้ |
| newFindingCount | finding วันนี้ |
| weightedScore | คะแนนถ่วงน้ำหนัก |
| payloadJson | snapshot JSON |
| sentAt | เวลาส่ง |

### Settings

| Column | Description |
| --- | --- |
| key | ชื่อ setting |
| value | ค่า |
| description | คำอธิบาย |
| updatedAt | เวลาแก้ไข |

### TaskTemplates

| Column | Description |
| --- | --- |
| templateId | รหัส template |
| auditArea | หมวดงาน |
| title | ชื่องานตั้งต้น |
| description | รายละเอียดตั้งต้น |
| defaultPriority | low, medium, high, critical |
| defaultRisk | low, medium, high, critical |
| dueOffsetDays | จำนวนวันหลังจากสร้าง |
| active | TRUE/FALSE |

## LIFF Registration Flow

1. ผู้ดูแล deploy Google Apps Script เป็น Web App และตั้งค่า `LINE_CHANNEL_ACCESS_TOKEN` ใน Script Properties
2. ผู้ดูแลสร้าง LIFF app ใน LINE Developers และใส่ URL หน้าเว็บ AuditFlow เป็น Endpoint URL
3. ผู้ใช้เปิดหน้า `LINE Audit Coach` ในเว็บ AuditFlow ผ่าน LIFF
4. กรอก Apps Script Web App URL และ LIFF ID
5. กดเปิด LINE Login แล้วกดดึงข้อมูล LINE
6. ระบบอ่าน `userId`, `displayName` จาก LIFF profile
7. ผู้ใช้เลือก role/team แล้วกดลงทะเบียน Audit Coach
8. หน้าเว็บส่ง registration payload ไป Google Apps Script และ Apps Script บันทึกลงชีต `Users`

## LINE Commands

| Command | Result |
| --- | --- |
| `done INV-001` | เปลี่ยนงานเป็น done |
| `pending TAX-003` | เปลี่ยนงานเป็น pending |
| `note INV-001 เอกสารยังไม่ครบ` | บันทึก note ล่าสุด |
| `risk PAY-002 high` | ปรับ risk |
| `finding INV-001 พบเอกสาร support ไม่ครบ` | สร้าง finding |
| `งานวันนี้` | แสดงงานที่ครบกำหนดวันนี้ |
| `งานค้าง` | แสดงงานที่ยังไม่ done และ overdue/pending |
| `สรุป` | แสดง summary ปัจจุบัน |

## Setup

1. สร้าง Google Sheet ว่าง
2. เปิด Apps Script แล้วนำไฟล์ `apps-script/Code.gs` ไปวาง
3. ตั้ง Script Properties:
   - `SPREADSHEET_ID`
   - `LINE_CHANNEL_ACCESS_TOKEN`
4. Run `setupSheets` ครั้งแรกเพื่อสร้าง sheet/header
5. Deploy เป็น Web App:
   - Execute as: Me
   - Who has access: Anyone
6. นำ Web App URL ไปใส่ใน LINE Messaging API webhook และในหน้า LIFF registration
7. ตั้ง trigger ตามเวลา:
   - `createDailyAuditTasks`
   - `sendMorningAuditSummary`
   - `sendEveningAuditSummary`

## Web To LINE Data Flow

หน้าเว็บ AuditFlow ยังสามารถใช้ Firebase หรือ Demo/localStorage ตามโค้ดเดิมได้ แต่เมื่อใส่ `Apps Script Web App URL` ในหน้า `LINE Audit Coach` แล้ว:

1. งานที่กดบันทึกจากหน้าเว็บจะถูกส่งเข้า Google Sheet ชีต `AuditTasks` ผ่าน action `upsertAuditTask`
2. ปุ่ม `Sync งานทั้งหมดเข้า Sheet` จะส่งงานที่มีอยู่ในหน้าเว็บทั้งหมดเข้า `AuditTasks` ผ่าน action `bulkUpsertAuditTasks`
3. LINE command และ morning/evening summary จะอ่านจาก `AuditTasks` ดังนั้นงานที่ sync จากหน้าเว็บจะถูกนำไปแสดงใน LINE ได้

หมายเหตุ: การอัปเดตจาก LINE command จะเปลี่ยนข้อมูลใน Google Sheet ก่อน หากต้องการให้หน้าเว็บดึงสถานะล่าสุดจาก Sheet กลับมาแสดงแบบสองทาง ต้องเพิ่ม flow อ่านกลับจาก Apps Script ในระยะถัดไป
