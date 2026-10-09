-- =====================================================================
-- MarketHaiti — Comptes vendeurs (portail vendor.html)
-- Colonnes ajoutées sur la table vendors existante :
--   email / passwordHash → connexion au portail vendeur
--   status               → 'pending' | 'active' | 'suspended'
--   ownerName / category / address → infos d'inscription
-- Les vendeurs créés manuellement dans l'admin gardent status 'active'
-- et peuvent recevoir un email + mot de passe ensuite.
-- =====================================================================

alter table public.vendors
  add column if not exists "email" text,
  add column if not exists "passwordHash" text,
  add column if not exists "status" text not null default 'active',
  add column if not exists "ownerName" text,
  add column if not exists "category" text,
  add column if not exists "address" text,
  add column if not exists "createdAt" timestamptz default now();

-- Un seul compte par email vendeur
create unique index if not exists vendors_email_unique_idx
  on public.vendors (lower("email"))
  where "email" is not null and "email" <> '';
