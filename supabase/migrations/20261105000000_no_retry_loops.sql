begin;
-- No retry loops (5 November 2026). «Changed by someone else, reload first» was raised as a serialization failure
-- (40001). The API layer retries those at once and without end, so one stale save held a database connection until
-- every connection was taken and the whole app stopped answering («Timed out acquiring connection from connection
-- pool»). Each entry point now turns such an error into a plain conflict (HTTP 409, code PT409) with the same message,
-- returned to the person once. Nothing else about the requests changes. Safe to run again.

create or replace function public.mawatheeq_attendance_request(p_token text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 return mawatheeq_private.attendance_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_books_request(p_token text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 perform mawatheeq_private.set_power(p_token,'books',p_action);
 return mawatheeq_private.books_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_bridge_request(p_key text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 return mawatheeq_private.bridge_request(p_key,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_case_file_request(p_token text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 return mawatheeq_private.case_file_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_chat_request(p_token text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 perform mawatheeq_private.set_power(p_token,'chat',p_action);
 return mawatheeq_private.chat_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_client_request(p_token text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 perform mawatheeq_private.set_power(p_token,'client',p_action);
 return mawatheeq_private.client_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_comment_request(p_token text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 perform mawatheeq_private.set_power(p_token,'comment',p_action);
 return mawatheeq_private.comment_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_department_request(p_token text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 perform mawatheeq_private.set_power(p_token,'department',p_action);
 return mawatheeq_private.department_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_local_request(p_token text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 perform mawatheeq_private.set_power(p_token,'local',p_action);
 return mawatheeq_private.local_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_mail_request(p_token text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 return mawatheeq_private.mail_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_mail_service(p_token text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 return mawatheeq_private.mail_service(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_office_request(p_token text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 perform mawatheeq_private.set_power(p_token,'office',p_action);
 return mawatheeq_private.office_request(p_token,p_action,p_data);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_import_cases(p_cases jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 return mawatheeq_private.mawatheeq_import_cases(p_cases);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_save_case(p_case jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 return mawatheeq_private.mawatheeq_save_case(p_case);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_save_document(p_id uuid,p_payload jsonb,p_filename text,p_file_key text,p_revision integer) returns jsonb
language plpgsql set search_path='' as $$
begin
 return mawatheeq_private.mawatheeq_save_document(p_id,p_payload,p_filename,p_file_key,p_revision);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

create or replace function public.mawatheeq_save_rules(p_rules jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 return mawatheeq_private.mawatheeq_save_rules(p_rules);
exception when serialization_failure or deadlock_detected then
 raise exception '%', sqlerrm using errcode='PT409';
end $$;

notify pgrst,'reload schema';
commit;
