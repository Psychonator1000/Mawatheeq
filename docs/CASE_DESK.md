# Cases desk (أعمال القضايا)

Ten pages under «أعمال القضايا» in the cases workspace sidebar. Anyone who can open the cases section sees them. They only show the cases that account may already see, and they edit those cases with the same save path and the same edit permission as the case file. No new tables, migrations or permissions are needed: the extra fields are stored in the case record.

| Page | What it does |
| --- | --- |
| ترحيل الجلسات | Lists the cases whose next sitting falls on the chosen day. The clerk records the decision, plus the next date and time for adjournments, and the sitting is added to the case's sessions log. Posted cases leave the list. |
| أخطاء الترحيل | Finds these problems automatically:<br>• a sitting date passed without a result<br>• an adjournment without a next date<br>• a next date on a Friday or Saturday, or before the sitting itself<br>• a judgment date that passed with no judgment recorded<br>Missed sittings can be posted from the page. The sidebar shows how many cases have an error. |
| مواعيد الجلسات (رول) | Sittings in a date range, grouped by day and court, with the last decision and what the court asked for. Can be filtered by lawyer and printed. |
| متابعة الجلسات | The next 7, 14 or 30 days of sittings, showing:<br>• what is required at each one<br>• who is assigned to attend, taken from the hearings in «المهام والجلسات»<br>• how many days are left |
| كشوف القضايا | A printable statement of the cases for one client, lawyer or court: last decision, next sitting and judgment. |
| الاستشارات | Consultations linked to a client, with type, subject, requester, the dates they were received and are due, status, answer and fee. «تحويل إلى قضية» moves one to cases under study. |
| الأحكام | Every judgment issued in a period at every court level, including earlier levels saved in the case. Can be filtered by outcome and printed. |
| القضايا بدون عقود | Open filed cases with no fee agreement. The contract number can be saved from the page, or the case marked «لا يلزم عقد». |
| قضايا تحت الدراسة | Matters prepared before filing. «قيد الدعوى» records the case number, court, filing date and first hearing date. The case then moves into the register, and its first hearing appears in the roll and in posting. |
| القضايا الموقوفة | Cases stayed or struck off by the last sitting's decision, or stayed by hand from the case file. Struck-off cases show a renewal reminder 60 days after striking off. The reminder is advisory; the lawyer confirms the actual deadline. |

## Fields stored in the case record

| Field | Meaning |
| --- | --- |
| `workflow` | `consultation`, `study`, or empty for a filed case. Consultations and cases under study stay out of the judgments register, its counts and its analytics. |
| `consultation` | `{type, subject, requester, status, receivedDate, dueDate, answer, fee}` |
| `contractNumber`, `contractDate`, `contractFee`, `contractWaived` | The fee agreement. These are edited from the case file's «عقد الأتعاب» card. |
| `stayed`, `stayReason`, `stayDate` | A manual stay. This is edited from the case file's «إيقاف القضية» card. |

## Logic and tests

The logic is in `lib/case-desk.ts` and is unit-tested in `scripts/verify-case-browse.mjs` (`test:browse`). The synthetic browser test is `scripts/verify-case-desk-ui.mjs`. It covers posting a sitting, posting errors, stayed cases, the roll, saving a contract, adding a consultation and filing a case under study, plus the mobile layout.
