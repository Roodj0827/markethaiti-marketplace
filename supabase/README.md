# MarketHaiti — Backend Supabase

## Structure

```
supabase/
  functions/
    bazik-create-payment/index.ts   # Crée un paiement MonCash via api.bazik.io
    bazik-verify-payment/index.ts   # Vérifie le statut en direct (GET /order/{id})
  migrations/
    001_reviews.sql                 # Table avis clients (facultative)
    002_payment_bazik.sql           # Colonnes paymentRef / paymentProvider / paymentStatus + payments.custom
    003_vendor_accounts.sql         # Comptes vendeurs (email, passwordHash, status…)
    004_payment_cron.sql            # Cron pg_cron → sweep des paiements pending (toutes les 2 min)
```

## Comptes vendeurs (vendor.html)

1. Le vendeur s'inscrit depuis la boutique (Compte → "Rejoignez-nous ici") :
   son compte est créé dans `vendors` avec `status = 'pending'`.
2. L'admin l'approuve dans **Vendeurs** (bouton Approuver) → `status = 'active'`.
   Suspendre un compte bloque la connexion mais laisse ses produits en ligne.
3. Le vendeur se connecte sur **vendor.html** et peut :
   - ajouter / modifier / masquer / supprimer SES produits uniquement ;
   - voir ses commandes et sa part (`commission %` fixée par l'admin, sinon
     la commission globale des Paramètres) ;
   - suivre son `dueBalance` (solde à lui reverser) et ses infos de paiement.
4. Quand une commande passe à **Livrée**, l'admin crédite automatiquement
   `dueBalance` du vendeur : `montant_articles × (commission vendeur) %`.
   Le reste revient à la plateforme. "Soldé" remet le compteur à zéro.

## Déploiement

```bash
# 1. Lier le projet
supabase link --project-ref ishbmvzuwdygepwhduug

# 2. Secrets Bazik — JAMAIS dans le code ni dans une table publique.
#    Le couple userID/secretKey choisit automatiquement sandbox ou production.
supabase secrets set BAZIK_USER_ID="bzk_xxxxxxxx_xxxxxxxxxx"
supabase secrets set BAZIK_SECRET_KEY="sk_xxxxxxxxxxxxxxxxxxxxxxxx"

# 3. Déployer les fonctions
supabase functions deploy bazik-create-payment
supabase functions deploy bazik-verify-payment

# 4. Exécuter les migrations dans le SQL Editor du dashboard Supabase
```

## Flux de paiement MonCash (automatique)

1. Client valide la commande → `js/store.js` POST `bazik-create-payment` `{orderId}`.
2. La fonction relit le total en base, appelle `POST api.bazik.io/token` puis
   `POST /moncash/token` (`referenceId` = id de commande) et renvoie
   `redirectUrl` → le client est redirigé vers la page MonCash.
3. Au retour (`?paiement=succes&commande=ID`) ou via le bouton "Vérifier le
   paiement" (compte client + admin), `bazik-verify-payment` interroge
   `GET /order/{paymentRef}` en direct et met à jour `orders.paymentStatus`
   (`succeeded` / `failed` / `pending`).

## Sécurité anti-perte de paiement

Un client peut payer sur MonCash puis quitter sans jamais revenir sur la
boutique. Quatre filets de sécurité garantissent que sa commande est quand
même validée :

1. **Cron Supabase** (`004_payment_cron.sql`) — toutes les 2 min,
   `bazik-verify-payment` est appelée en mode *sweep* (body `{}`) : elle
   relit toutes les commandes `pending` directement auprès de Bazik.
2. **Retour client** — `?paiement=succes&commande=ID` déclenche une
   vérification immédiate + polling 60s.
3. **Compte client** — ouvrir "Historique" vérifie silencieusement chaque
   commande MonCash en attente.
4. **Admin** — le panneau balaye les paiements en attente toutes les 2 min
   + bouton "Vérifier paiement" par commande.

Et l'inverse : une commande abandonnée n'est annulée (30 min) qu'après une
vérification Bazik confirmant qu'elle n'a PAS été payée — jamais d'annulation
sur un paiement encaissé.

## Notes

- **MonCash = automatique uniquement.** Le client est toujours redirigé vers
  la page de paiement hébergée ; il n'y a pas de mode manuel MonCash.
- **NatCash / Banque / méthodes custom** : mode manuel — le client voit les
  numéros/comptes et uploade une preuve que l'admin valide.
- **Montant maximum** : 75 000 HTG par transaction (limite Bazik).
- **Logos & méthodes** : admin → Paiements permet d'ajouter le logo, des
  instructions et d'activer/masquer chaque méthode (MonCash, NatCash, banque,
  + méthodes personnalisées dans l'onglet "Autres méthodes").
- `config.toml` : pour que le storefront anon appelle les fonctions, laisser
  `verify_jwt = true` (les appels passent `apikey` + `Bearer anon`).
