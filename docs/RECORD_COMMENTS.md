# Case and task discussion

Staff discuss a case or task inside Mawatheeq instead of external chat. Each saved case has an **النقاش** tab, and each saved task or hearing shows **النقاش الداخلي** under its details. Mentioning a colleague puts an alert in their notification bell; opening it marks the mention read and opens the discussion.

## Access rules (enforced in the database)

- Comments are reachable only through `public.mawatheeq_comment_request`, which validates the local session. The `comments` and `mention_reads` tables have no direct grants.
- A case comment is visible exactly when the case is visible to the user (`can_case`). A task comment follows the task list rules (`can_work_payload`, or an unlinked task the user created).
- Posting requires edit permission. Read-only accounts can read the discussion.
- A mention must name an enabled colleague who can already see the record, so a mention never discloses a case to someone without access. Self-mentions are rejected.
- Authors and the office owner can delete a comment. Deletion hides the text and mentions from everyone but keeps the row privately.
- Revoking a user's access to a case or task also hides its comments and mentions from that user.
- Comments are limited to 4000 characters and 20 mentions. No email or external notification is sent.

## Applying the migration (one time)

The app works before and after this step. Until it is applied, the discussion tab and mention alerts stay hidden.

1. Sign in to Supabase and open the Mawatheeq project.
2. Open **SQL Editor** → **New query**.
3. Paste the full contents of `supabase/migrations/20261011150000_record_comments.sql` from this repository and select **Run**. The script is one transaction: it either applies completely or changes nothing. It only adds tables and functions; existing records are untouched.
4. Expect “Success. No rows returned”. Reload Mawatheeq; the **النقاش** tab appears in saved cases.

Verified locally with `pnpm test:comments` (PGlite, synthetic accounts) and the synthetic browser workflow in `scripts/verify-tools-ui.mjs`. Neither contacts the real backend.

## Rollback

Hide the feature without losing comments by revoking the entry point:

```sql
revoke execute on function public.mawatheeq_comment_request(text,text,jsonb), mawatheeq_private.comment_request(text,text,jsonb) from anon, authenticated;
notify pgrst, 'reload schema';
```

The app then treats comments as unavailable. Re-grant the same functions to restore them. Do not drop the tables unless the comments are no longer needed.
