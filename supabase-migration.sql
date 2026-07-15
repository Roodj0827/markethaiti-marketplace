-- =====================================================================
-- VantNet Haiti — Migration Supabase (v2, alignée sur le schéma réel)
-- Basé sur la disposition exacte fournie : product_options(id, group,
-- value, createdAt), products.imageGallery, products.priceByVolume,
-- products.brand/color/ram/rom/condition, customers.email — toutes ces
-- colonnes existent déjà, aucune ALTER n'est donc nécessaire dessus.
--
-- Cette migration ne fait que : (1) empêcher les doublons dans
-- product_options, (2) s'assurer que l'admin et le client peuvent bien
-- lire/écrire cette table, (3) proposer quelques valeurs de départ pour
-- les listes déroulantes (catégories, couleurs, contenances ml).
-- Additive et idempotente : peut être relancée sans risque.
-- =====================================================================

-- 1) Empêche les doublons "même groupe + même valeur"
--    (ex: deux fois "Rouge" dans les couleurs)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_options_group_value_key'
  ) then
    alter table public.product_options
      add constraint product_options_group_value_key unique ("group", "value");
  end if;
end $$;

-- 2) Sécurité (RLS) — accès ouvert en lecture/écriture avec la clé anon,
--    cohérent avec le reste de l'application (products, customers, ...)
--    qui fonctionne déjà ainsi sans rôle serveur dédié.
alter table public.product_options enable row level security;

drop policy if exists "public read product_options" on public.product_options;
create policy "public read product_options" on public.product_options
  for select using (true);

drop policy if exists "public write product_options" on public.product_options;
create policy "public write product_options" on public.product_options
  for all using (true) with check (true);

-- 3) Valeurs de départ (facultatif) — l'admin peut en ajouter d'autres à
--    la volée depuis le bouton "+" à côté de chaque liste déroulante.
insert into public.product_options (id, "group", "value") values
  ('opt-cat-parfum',      'category', 'Parfum'),
  ('opt-cat-spray',       'category', 'Spray'),
  ('opt-cat-mode',        'category', 'Mode'),
  ('opt-cat-electro',     'category', 'Électronique'),
  ('opt-cat-maison',      'category', 'Maison'),
  ('opt-cat-epicerie',    'category', 'Épicerie'),

  ('opt-cond-neuf',       'condition', 'Neuf'),
  ('opt-cond-recond',     'condition', 'Reconditionné'),
  ('opt-cond-occasion',   'condition', 'Occasion'),

  ('opt-ram-4',           'ram', '4 Go'),
  ('opt-ram-8',           'ram', '8 Go'),
  ('opt-ram-16',          'ram', '16 Go'),

  ('opt-rom-64',          'rom', '64 Go'),
  ('opt-rom-128',         'rom', '128 Go'),
  ('opt-rom-256',         'rom', '256 Go'),

  ('opt-ml-30',           'ml', '30ml'),
  ('opt-ml-50',           'ml', '50ml'),
  ('opt-ml-100',          'ml', '100ml'),

  ('opt-color-noir',      'color', 'Noir'),
  ('opt-color-blanc',     'color', 'Blanc'),
  ('opt-color-rouge',     'color', 'Rouge'),
  ('opt-color-bleu',      'color', 'Bleu')
on conflict ("group", "value") do nothing;

-- =====================================================================
-- Rien d'autre à modifier : products.imageGallery, products.priceByVolume,
-- products.brand/color/ram/rom/condition/isActive et customers.email
-- existent déjà dans ta base et sont utilisés tels quels par le code.
-- =====================================================================

-- =====================================================================
-- Ajout (session suivante) : liste de couleurs sélectionnables par
-- produit (vêtements, téléphones, ordinateurs, montres...), affichée
-- comme un sélecteur graphique côté client. Même prix/stock pour toutes
-- les couleurs d'un même produit (pas de stock séparé par couleur).
-- =====================================================================
alter table public.products
  add column if not exists "colorOptions" jsonb default '[]'::jsonb;

comment on column public.products."colorOptions" is 'Liste de couleurs sélectionnables (ex: ["Rouge","Noir","Bleu"]) — affichage uniquement, même prix/stock pour toutes.';
