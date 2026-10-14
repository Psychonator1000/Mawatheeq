# Collection files and cases: which number is which

A collection file and a case are tracked by different numbers. They must never be copied into each other.

| Record | Office number | Automatic number |
| --- | --- | --- |
| Collection file («التحصيل») | The file number (رقم ملف التحصيل), the office's own numbering for collection files. | The number printed above the payment-order request (طلب استصدار أمر أداء). The same number appears on the court-fee receipt as «الرقم الآلي». It belongs to the payment order. |
| Case («سجل الأحكام») | The case code (كود القضية), the office's own case numbering. | The case's automatic number on بوابة العدل, issued when the lawsuit is filed. |

## How a file becomes a case

1. A new collection file starts with a demand letter (تكليف بالوفاء), a payment-order request and a bundle of documents (حافظة المستندات). It has a file number and, once the request is filed, the order's automatic number.
2. If the payment order is rejected, a lawsuit is filed. Only then does a case exist, with its own code and its own automatic number.
3. The file is then linked to the case, either with «ربط بقضية» or with «إنشاء قضية من الملف».

## What the app does

- **Making a case from a file** asks for the case code and leaves the case's automatic number empty until it is known. It refuses the file number as the case code, and it refuses the order's automatic number as the case's automatic number.
- **Picking a case on a new file** fills in the parties, but the file keeps its own file number.
- **Importing collection files** never links them to cases by number. The sheet's automatic number is the order's number and stays on the file.
- **The two copies of the order's number** («الرقم الآلي لأمر الأداء» on the request and «الرقم الآلي في الإيصال» on the receipt) fill each other while one of them is empty.
- **Searching** for files to attach to a case also matches the order's automatic number, the order number, the lawsuit number, the phone and the extra parties (migration `20261014030000_collection_numbers.sql`).
