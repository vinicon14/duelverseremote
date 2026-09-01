select cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);