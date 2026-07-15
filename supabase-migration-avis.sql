-- =====================================================================
-- VantNet Haiti — Migration facultative : avis clients (notes + fiche
-- produit). Le site fonctionne déjà sans cette table (aucun avis ne
-- s'affiche, le formulaire échoue silencieusement avec un message
-- d'erreur discret) — à exécuter uniquement si vous voulez activer les
-- notes et commentaires clients.
-- =====================================================================

create table if not exists public.reviews (
  id text primary key,
  "productId" text not null references public.products(id) on delete cascade,
  "customerName" text not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  "createdAt" timestamptz not null default now()
);

alter table public.reviews enable row level security;

drop policy if exists "public read reviews" on public.reviews;
create policy "public read reviews" on public.reviews
  for select using (true);

drop policy if exists "public write reviews" on public.reviews;
create policy "public write reviews" on public.reviews
  for all using (true) with check (true);
