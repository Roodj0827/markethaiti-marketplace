# MarketHaiti — Marketplace collaborative (Haïti)

Architecture client-serveur : boutique et panneau admin (HTML/CSS/JS) + API Django + PostgreSQL.

## Structure

```
Mon site -cc/
├── marketplace-haiti-production.html   # Boutique client
├── admin-marketplace-haiti.html       # Administration
└── backend/                           # Django + API REST
```

## Démarrage local

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py seed_defaults
python manage.py runserver
```

Ouvrir :

- Boutique : http://127.0.0.1:8000/
- Admin : http://127.0.0.1:8000/admin-panel/
- API : http://127.0.0.1:8000/api/health/

Les fichiers HTML détectent automatiquement l’URL de l’API (`window.location.origin` quand ils sont servis par Django).

## Déploiement Render

1. Créer un **Web Service** Python pointant vers `backend/`.
2. Ajouter une base **PostgreSQL** et lier `DATABASE_URL`.
3. Variables d’environnement : `DJANGO_SECRET_KEY`, `ADMIN_API_KEY`, `DEBUG=False`.
4. Build : `./build.sh` — Start : `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`

## Clé admin API

Le panneau admin envoie l’en-tête `X-Admin-Key` (valeur par défaut locale : `PHRJ2003`, configurable via `ADMIN_API_KEY`).

## Endpoints principaux

| Méthode | Route | Usage |
|---------|-------|--------|
| GET | `/api/bootstrap/` | Chargement boutique |
| GET | `/api/admin/bootstrap/` | Chargement admin (clé requise) |
| POST | `/api/orders/` | Créer une commande |
| POST | `/api/auth/login/` | Connexion client |
| POST | `/api/auth/register/` | Inscription client |
| CRUD | `/api/products/`, `/api/vendors/`, etc. | Admin |

Le panier reste dans `localStorage` (session navigateur) ; tout le reste est en base de données.
