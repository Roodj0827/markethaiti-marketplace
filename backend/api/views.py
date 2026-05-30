import json

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Announcement, AppSetting, AuditLog, Customer, Order, OrderItem, Product, Vendor
from .services import (
    apply_order_due,
    create_order_from_payload,
    generate_external_id,
    is_revenue_status,
    log_audit,
    normalize_status,
    parse_json_body,
    product_from_payload,
    update_announcement_from_payload,
    update_settings_from_payload,
    vendor_from_payload,
)


def cors_json(data, status=200):
    response = JsonResponse(data, status=status, safe=isinstance(data, dict))
    return response


def require_admin(request):
    key = request.headers.get("X-Admin-Key", "")
    expected = getattr(settings, "ADMIN_API_KEY", "")
    if not expected or key != expected:
        return cors_json({"error": "Non autorisé"}, status=403)
    return None


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def health(request):
    return cors_json({"status": "ok", "service": "marketplace-haiti-api"})


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def products_list(request):
    qs = Product.objects.filter(is_active=True).select_related("vendor")
    if request.GET.get("all") == "1":
        denied = require_admin(request)
        if denied:
            return denied
        qs = Product.objects.all().select_related("vendor")
    return cors_json([p.to_json() for p in qs])


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def settings_view(request):
    s = AppSetting.get_solo()
    return cors_json(s.settings_json())


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def announcements_view(request):
    return cors_json(Announcement.get_solo().to_json())


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def payments_view(request):
    s = AppSetting.get_solo()
    return cors_json(s.payments_json())


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def bootstrap_view(request):
    """Single call for storefront initial load."""
    s = AppSetting.get_solo()
    products = Product.objects.filter(is_active=True).select_related("vendor")
    return cors_json(
        {
            "products": [p.to_json() for p in products],
            "settings": s.settings_json(),
            "payments": s.payments_json(),
            "announcements": Announcement.get_solo().to_json(),
        }
    )


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def admin_bootstrap(request):
    denied = require_admin(request)
    if denied:
        return denied
    s = AppSetting.get_solo()
    return cors_json(
        {
            "products": [p.to_json() for p in Product.objects.all().select_related("vendor")],
            "customers": [c.to_json() for c in Customer.objects.all()],
            "orders": [o.to_json() for o in Order.objects.prefetch_related("items").all()],
            "vendors": [v.to_json() for v in Vendor.objects.all()],
            "settings": s.settings_json(),
            "payments": s.payments_json(),
            "announcements": Announcement.get_solo().to_json(),
            "auditLog": [a.to_json() for a in AuditLog.objects.all()[:500]],
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def orders_create(request):
    payload = parse_json_body(request)
    if payload is None:
        return cors_json({"error": "JSON invalide"}, status=400)
    try:
        order = create_order_from_payload(payload)
    except ValueError as exc:
        return cors_json({"error": str(exc)}, status=400)
    log_audit("Commande créée", f"ID: {order.external_id}, Client: {order.customer_name}")
    return cors_json(order.to_json(), status=201)


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def orders_list(request):
    customer_id = request.GET.get("customer_id")
    if customer_id:
        qs = Order.objects.filter(customer__external_id=customer_id).prefetch_related("items")
        return cors_json([o.to_json() for o in qs])
    denied = require_admin(request)
    if denied:
        return denied
    qs = Order.objects.prefetch_related("items").all()
    return cors_json([o.to_json() for o in qs])


@csrf_exempt
@require_http_methods(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
def order_detail(request, order_id):
    denied = require_admin(request)
    if denied:
        return denied
    order = Order.objects.filter(external_id=order_id).prefetch_related("items").first()
    if not order:
        return cors_json({"error": "Commande introuvable"}, status=404)

    if request.method == "DELETE":
        order.delete()
        log_audit("Commande supprimée", f"ID: {order_id}")
        return cors_json({"ok": True})

    payload = parse_json_body(request) or {}
    old_status = order.status
    if "status" in payload:
        order.status = payload["status"]
        order.save(update_fields=["status", "updated_at"])
        new_norm = normalize_status(order.status)
        if new_norm in ("validee", "livree") and not order.due_applied:
            apply_order_due(order)
        log_audit(
            "Statut commande changé",
            f"ID: {order.external_id}, {old_status} → {order.status}",
        )
    return cors_json(order.to_json())


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def orders_validate(request, order_id):
    denied = require_admin(request)
    if denied:
        return denied
    order = Order.objects.filter(external_id=order_id).first()
    if not order:
        return cors_json({"error": "Commande introuvable"}, status=404)
    order.status = "Validée"
    order.save(update_fields=["status", "updated_at"])
    apply_order_due(order)
    log_audit("Commande validée", f"ID: {order.external_id}, Client: {order.customer_name}")
    return cors_json(order.to_json())


@csrf_exempt
@require_http_methods(["GET", "POST", "OPTIONS"])
def products_admin(request):
    if request.method == "GET":
        denied = require_admin(request)
        if denied:
            return denied
        return cors_json([p.to_json() for p in Product.objects.all().select_related("vendor")])

    denied = require_admin(request)
    if denied:
        return denied
    payload = parse_json_body(request)
    if payload is None:
        return cors_json({"error": "JSON invalide"}, status=400)
    product = product_from_payload(payload)
    log_audit("Produit sauvegardé", f"ID: {product.external_id}, Nom: {product.name}")
    return cors_json(product.to_json(), status=201)


@csrf_exempt
@require_http_methods(["PUT", "PATCH", "DELETE", "OPTIONS"])
def product_detail(request, product_id):
    denied = require_admin(request)
    if denied:
        return denied
    product = Product.objects.filter(external_id=product_id).first()
    if not product:
        return cors_json({"error": "Produit introuvable"}, status=404)

    if request.method == "DELETE":
        name = product.name
        product.delete()
        log_audit("Produit supprimé", f"ID: {product_id}, Nom: {name}")
        return cors_json({"ok": True})

    payload = parse_json_body(request) or {}
    product = product_from_payload(payload, instance=product)
    log_audit("Produit sauvegardé", f"ID: {product.external_id}, Nom: {product.name}")
    return cors_json(product.to_json())


@csrf_exempt
@require_http_methods(["GET", "POST", "OPTIONS"])
def vendors_list(request):
    if request.method == "GET":
        return cors_json([v.to_json() for v in Vendor.objects.all()])

    denied = require_admin(request)
    if denied:
        return denied
    payload = parse_json_body(request)
    if payload is None:
        return cors_json({"error": "JSON invalide"}, status=400)
    vendor = vendor_from_payload(payload)
    log_audit("Vendeur sauvegardé", f"ID: {vendor.external_id}, Nom: {vendor.name}")
    return cors_json(vendor.to_json(), status=201)


@csrf_exempt
@require_http_methods(["PUT", "PATCH", "DELETE", "OPTIONS"])
def vendor_detail(request, vendor_id):
    denied = require_admin(request)
    if denied:
        return denied
    vendor = Vendor.objects.filter(external_id=vendor_id).first()
    if not vendor:
        return cors_json({"error": "Vendeur introuvable"}, status=404)

    if request.method == "DELETE":
        if vendor_id == "vendor-ma-boutique":
            return cors_json({"error": "Impossible de supprimer le vendeur par défaut."}, status=400)
        deleted_products = Product.objects.filter(vendor=vendor).count()
        order_ids = OrderItem.objects.filter(vendor_id=vendor_id).values_list(
            "order_id", flat=True
        ).distinct()
        deleted_orders = len(order_ids)
        Product.objects.filter(vendor=vendor).delete()
        Order.objects.filter(pk__in=order_ids).delete()
        vendor.delete()
        log_audit(
            "Vendeur supprimé",
            f"ID: {vendor_id}, Produits supprimés: {deleted_products}, Commandes: {deleted_orders}",
        )
        return cors_json({"ok": True})

    payload = parse_json_body(request) or {}
    if "dueBalance" in payload:
        from decimal import Decimal

        vendor.due_balance = Decimal(str(payload["dueBalance"]))
    vendor = vendor_from_payload(payload, instance=vendor)
    log_audit("Vendeur sauvegardé", f"ID: {vendor.external_id}, Nom: {vendor.name}")
    return cors_json(vendor.to_json())


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def vendor_reset_due(request, vendor_id):
    denied = require_admin(request)
    if denied:
        return denied
    vendor = Vendor.objects.filter(external_id=vendor_id).first()
    if not vendor:
        return cors_json({"error": "Vendeur introuvable"}, status=404)
    vendor.due_balance = 0
    vendor.save(update_fields=["due_balance"])
    log_audit("Solde dû réinitialisé", f"Vendeur: {vendor.name}")
    return cors_json(vendor.to_json())


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def customers_list(request):
    denied = require_admin(request)
    if denied:
        return denied
    return cors_json([c.to_json() for c in Customer.objects.all()])


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def auth_register(request):
    payload = parse_json_body(request)
    if payload is None:
        return cors_json({"error": "JSON invalide"}, status=400)

    phone = (payload.get("phone") or payload.get("credential") or "").strip()
    name = (payload.get("name") or "").strip()
    username = (payload.get("username") or "").strip().lstrip("@")
    password_hash = payload.get("passwordHash") or payload.get("password_hash") or ""

    if not phone or not name or not username or not password_hash:
        return cors_json({"error": "Champs requis manquants"}, status=400)
    if Customer.objects.filter(phone=phone).exists():
        return cors_json({"error": "Ce téléphone est déjà inscrit."}, status=400)
    if Customer.objects.filter(username__iexact=username).exists():
        return cors_json({"error": "Ce nom d'utilisateur est déjà pris."}, status=400)

    customer = Customer.objects.create(
        external_id=payload.get("id") or generate_external_id("cust"),
        name=name,
        username=username,
        phone=phone,
        password_hash=password_hash,
    )
    return cors_json({"customer": customer.to_json()}, status=201)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def auth_login(request):
    payload = parse_json_body(request)
    if payload is None:
        return cors_json({"error": "JSON invalide"}, status=400)

    credential = (payload.get("credential") or "").strip()
    password_hash = payload.get("passwordHash") or payload.get("password_hash") or ""
    customer = Customer.objects.filter(phone=credential, password_hash=password_hash).first()
    if not customer:
        customer = Customer.objects.filter(
            username__iexact=credential.lstrip("@"), password_hash=password_hash
        ).first()
    if not customer:
        return cors_json({"error": "Téléphone/username ou mot de passe incorrect."}, status=401)
    orders = [o.to_json() for o in customer.orders.prefetch_related("items").all()]
    return cors_json({"customer": customer.to_json(), "orders": orders})


@csrf_exempt
@require_http_methods(["PUT", "PATCH", "DELETE", "OPTIONS"])
def customer_detail(request, customer_id):
    denied = require_admin(request)
    if denied:
        return denied
    customer = Customer.objects.filter(external_id=customer_id).first()
    if not customer:
        return cors_json({"error": "Client introuvable"}, status=404)

    if request.method == "DELETE":
        Order.objects.filter(customer=customer).delete()
        customer.delete()
        log_audit("Client supprimé", f"ID: {customer_id}")
        return cors_json({"ok": True})

    payload = parse_json_body(request) or {}
    if "passwordHash" in payload:
        customer.password_hash = payload["passwordHash"]
        customer.save(update_fields=["password_hash"])
        log_audit(
            "Mot de passe client réinitialisé",
            f"Client: {customer.name}, Téléphone: {customer.phone}",
        )
    return cors_json(customer.to_json())


@csrf_exempt
@require_http_methods(["PUT", "PATCH", "OPTIONS"])
def settings_update(request):
    denied = require_admin(request)
    if denied:
        return denied
    payload = parse_json_body(request) or {}
    settings = update_settings_from_payload(payload)
    if any(k in payload for k in ("active", "message", "textColor")):
        update_announcement_from_payload(payload)
        log_audit("Annonce enregistrée", f"Actif: {payload.get('active')}")
    log_audit(
        "Paramètres globaux enregistrés",
        f"Commission: {settings.global_commission}%",
    )
    return cors_json(
        {
            "settings": settings.settings_json(),
            "announcements": Announcement.get_solo().to_json(),
        }
    )


@csrf_exempt
@require_http_methods(["PUT", "PATCH", "OPTIONS"])
def payments_update(request):
    denied = require_admin(request)
    if denied:
        return denied
    payload = parse_json_body(request) or {}
    s = AppSetting.get_solo()
    payments = s.payments_json()
    for key in ("moncash", "natcash", "bank"):
        if key in payload:
            payments[key] = payload[key]
    s.payments = payments
    s.save(update_fields=["payments"])
    log_audit("Paramètres de paiement enregistrés", json.dumps(list(payload.keys())))
    return cors_json(s.payments_json())


@csrf_exempt
@require_http_methods(["GET", "POST", "OPTIONS"])
def audit_list(request):
    if request.method == "GET":
        denied = require_admin(request)
        if denied:
            return denied
        return cors_json([a.to_json() for a in AuditLog.objects.all()[:500]])

    denied = require_admin(request)
    if denied:
        return denied
    payload = parse_json_body(request) or {}
    entry = AuditLog.objects.create(
        action=payload.get("action", ""),
        details=payload.get("details", ""),
        date_display=payload.get("dateDisplay", ""),
    )
    return cors_json(entry.to_json(), status=201)
