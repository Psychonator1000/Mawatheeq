# Employee workspaces

Authorized by the owner on 9 October 2026: add a post-login choice of legal, secretary, collections, accounting and HR environments over the same database. Existing administrator-only account provisioning and case grants remain authoritative. This request activates the previously deferred collections workflow.

| Module | Responsibility | Depends on |
|---|---|---|
| workspace-access | Chooser, department grants, shared case scope and minimal case lookup | Existing local sessions/permissions |
| secretary | Agenda and existing task/hearing records | workspace-access |
| collections | Structured case-linked collection files and reviewed Word outputs | workspace-access |
| accounting | Fees, receipts, expenses and currency-specific balances | workspace-access |
| hr | Employee profiles and leave records | workspace-access |

Build order: workspace-access → secretary → collections → accounting → hr → integrated security/browser verification. A user may enter multiple assigned environments. Selecting an environment never changes their authority.
