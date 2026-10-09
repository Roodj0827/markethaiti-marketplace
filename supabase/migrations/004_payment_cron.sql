-- =====================================================================
-- MarketHaiti — Vérification automatique des paiements Bazik (cron)
-- Toutes les 2 minutes, appelle l'Edge Function bazik-verify-payment en
-- mode "sweep" : elle relit toutes les commandes MonCash encore
-- "pending" directement auprès de Bazik et met à jour paymentStatus.
--
-- POURQUOI : un client peut payer sur MonCash puis fermer son navigateur
-- sans jamais revenir sur la boutique. Sans ce job, sa commande resterait
-- bloquée "en attente" alors que l'argent a été encaissé.
--
-- PRÉREQUIS : activer les extensions "pg_cron" et "pg_net" dans
-- Dashboard → Database → Extensions (ou laisser les lignes ci-dessous).
--
-- NOTE : la clé anon ci-dessous est publique par conception (elle est déjà
-- embarquée dans js/config.js côté client) — ce n'est pas un secret.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Nettoie un éventuel job précédent avant de (re)programmer
select cron.unschedule('verify-bazik-payments')
  where exists (select 1 from cron.job where jobname = 'verify-bazik-payments');

select cron.schedule(
  'verify-bazik-payments',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://ishbmvzuwdygepwhduug.supabase.co/functions/v1/bazik-verify-payment',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzaGJtdnp1d2R5Z2Vwd2hkdXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDc1MzQsImV4cCI6MjA5NjcyMzUzNH0.VRmc4tJei93sO2cD7OFYCSaPRjMS8lt3hL5vXp145EY","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzaGJtdnp1d2R5Z2Vwd2hkdXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDc1MzQsImV4cCI6MjA5NjcyMzUzNH0.VRmc4tJei93sO2cD7OFYCSaPRjMS8lt3hL5vXp145EY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
