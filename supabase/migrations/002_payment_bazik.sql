-- =====================================================================
-- MarketHaiti — Paiement automatique Bazik (MonCash)
-- Colonnes utilisées par les Edge Functions bazik-create-payment et
-- bazik-verify-payment pour retracer et vérifier les transactions.
-- =====================================================================

alter table public.orders
  add column if not exists "paymentProvider" text,
  add column if not exists "paymentRef" text,
  add column if not exists "paymentStatus" text default 'pending';

-- Index pour les recherches par référence Bazik
create index if not exists orders_payment_ref_idx on public.orders ("paymentRef");

-- Méthodes de paiement personnalisées (colonne jsonb sur la ligne "main"
-- de la table payments — les autres méthodes sont des colonnes jsonb :
-- moncash / natcash / bank contiennent numbers, account, logoUrl, enabled…)
alter table public.payments
  add column if not exists "custom" jsonb not null default '[]'::jsonb;
