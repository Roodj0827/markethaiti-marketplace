-- =====================================================================
-- MarketHaiti — Buckets Supabase Storage + politiques d'upload
-- Le site uploade directement depuis le navigateur (clé anon) :
--   bucket "images"         → photos produits, logos vendeurs/paiements,
--                             galeries secondaires (admin + portail vendeur)
--   bucket "payment-proofs" → captures de preuve de paiement (checkout
--                             NatCash / banque / méthodes custom)
-- Sans ces buckets/politiques, uploadFileToBucket() échoue en silence
-- (retourne "" et le produit se crée sans image).
-- =====================================================================

-- 1. Buckets (publics : les images sont affichées directement via leur
--    URL publique dans <img>, y compris pour les visiteurs anonymes)
insert into storage.buckets (id, name, public)
values ('images', 'images', true), ('payment-proofs', 'payment-proofs', true)
on conflict (id) do nothing;

-- 2. Politiques — lecture publique + écriture publique (site sans auth
--    serveur ; l'admin/les vendeurs uploadent avec la clé anon).
drop policy if exists "images_public_read"   on storage.objects;
drop policy if exists "images_public_write"  on storage.objects;
drop policy if exists "proofs_public_read"   on storage.objects;
drop policy if exists "proofs_public_write"  on storage.objects;

create policy "images_public_read"
  on storage.objects for select using (bucket_id = 'images');
create policy "images_public_write"
  on storage.objects for insert with check (bucket_id = 'images');
create policy "images_public_update"
  on storage.objects for update using (bucket_id = 'images');
create policy "images_public_delete"
  on storage.objects for delete using (bucket_id = 'images');

create policy "proofs_public_read"
  on storage.objects for select using (bucket_id = 'payment-proofs');
create policy "proofs_public_write"
  on storage.objects for insert with check (bucket_id = 'payment-proofs');
create policy "proofs_public_update"
  on storage.objects for update using (bucket_id = 'payment-proofs');
create policy "proofs_public_delete"
  on storage.objects for delete using (bucket_id = 'payment-proofs');
