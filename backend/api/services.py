import json
import re
import secrets
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import Announcement, AppSetting, AuditLog, Customer, Order, OrderItem, Product, Vendor


def generate_external_id(prefix):
    if prefix == "order":
        settings = AppSetting.get_solo()
        settings.order_counter += 1
        settings.save(update_fields=["order_counter"])
        return f"order-{str(settings.order_counter).zfill(7)}"
    return f"{prefix}-{secrets.token_hex(4)}"


def normalize_status(status):
    text = str(status or "")
    text = re.sub(r"[\u0300-\u036f]", "", text.normalize("NFD"))
    return text.lower().strip()


def is_revenue_status(status):
    return normalize_status(status) in ("validee", "en livraison", "livree")


def apply_order_due(order):
    if order.due_applied:
        return
    settings = AppSetting.get_solo()
    for item in order.items.all():
        vendor = Vendor.objects.filter(external_id=item.vendor_id).first()
        if not vendor or vendor.external_id == "vendor-ma-boutique":
            continue
        item_total = Decimal(item.unit_price) * Decimal(item.quantity)
        rate = Decimal(vendor.commission or settings.global_commission)
        vendor.due_balance += item_total * (rate / Decimal("100"))
        vendor.save(update_fields=["due_balance"])
    order.due_applied = True
    order.save(update_fields=["due_applied"])


def log_audit(action, details=""):
    AuditLog.objects.create(
        action=action,
        details=details,
        date_display=timezone.localtime().strftime("%d/%m/%Y %H:%M:%S"),
    )


def parse_json_body(request):
    try:
        return json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return None


def product_from_payload(data, instance=None):
    vendor = None
    vendor_id = data.get("vendorId") or data.get("vendor_id") or ""
    if vendor_id:
        vendor = Vendor.objects.filter(external_id=vendor_id).first()
    vendor_name = data.get("vendorName") or (vendor.name if vendor else "")
    vendor_logo = data.get("vendorLogo") or (vendor.logo if vendor else "")
    fields = {
        "name": data.get("name", "").strip(),
        "description": data.get("description", "").strip(),
        "image_url": data.get("imageUrl", data.get("image_url", "")),
        "price": Decimal(str(data.get("price", 0))),
        "stock": int(data.get("stock", 0)),
        "category": data.get("category", "").strip(),
        "is_active": bool(data.get("active", data.get("is_active", True))),
        "vendor": vendor,
        "vendor_name": vendor_name,
        "vendor_logo": vendor_logo,
    }
    if instance:
        for key, val in fields.items():
            setattr(instance, key, val)
        instance.save()
        return instance
    external_id = data.get("id") or generate_external_id("prod")
    return Product.objects.create(external_id=external_id, **fields)


def vendor_from_payload(data, instance=None):
    fields = {
        "name": data.get("name", "").strip(),
        "phone": data.get("phone", "").strip(),
        "logo": data.get("logo", "").strip(),
        "commission": Decimal(str(data.get("commission", 10))),
        "payment_method": data.get("paymentMethod", data.get("payment_method", "MonCash")),
        "payment_details": data.get("paymentDetails", data.get("payment_details", "")),
        "moncash_number": data.get("moncashNumber", data.get("moncash_number", "")),
        "natcash_number": data.get("natcashNumber", data.get("natcash_number", "")),
    }
    if instance:
        for key, val in fields.items():
            setattr(instance, key, val)
        instance.save()
        return instance
    external_id = data.get("id") or generate_external_id("vend")
    due = Decimal(str(data.get("dueBalance", data.get("due_balance", 0))))
    return Vendor.objects.create(external_id=external_id, due_balance=due, **fields)


@transaction.atomic
def create_order_from_payload(payload):
    settings = AppSetting.get_solo()
    customer = None
    customer_id = payload.get("customerId") or payload.get("customer_id")
    if customer_id:
        customer = Customer.objects.filter(external_id=customer_id).first()

    items_data = payload.get("items") or []
    if not items_data:
        raise ValueError("Le panier est vide.")

    for item in items_data:
        product = Product.objects.filter(external_id=item.get("id")).select_for_update().first()
        if not product or not product.is_active:
            raise ValueError(f"Produit indisponible: {item.get('name', item.get('id'))}")
        qty = int(item.get("quantity", 1))
        if qty > product.stock:
            raise ValueError(
                f'Quantité dépasse le stock de "{product.name}" (max {product.stock})'
            )

    order_id = payload.get("id") or generate_external_id("order")
    total = Decimal(str(payload.get("total", 0)))
    if total <= 0:
        total = sum(
            Decimal(str(i.get("price", 0))) * int(i.get("quantity", 1)) for i in items_data
        )

    first_item = items_data[0]
    order = Order.objects.create(
        external_id=order_id,
        customer=customer,
        customer_name=payload.get("customerName", ""),
        customer_username=payload.get("customerUsername", ""),
        customer_phone=payload.get("customerPhone", ""),
        address=payload.get("address", ""),
        reception_phone=payload.get("receptionPhone", ""),
        notes=payload.get("notes", ""),
        payment_method=payload.get("paymentMethod", ""),
        proof_url=payload.get("proofUrl", ""),
        vendor_id=payload.get("vendorId") or first_item.get("vendorId", ""),
        vendor_name=payload.get("vendorName") or first_item.get("vendorName", ""),
        total=total,
        status=payload.get("status", "En attente"),
    )

    for item in items_data:
        product = Product.objects.filter(external_id=item.get("id")).select_for_update().first()
        qty = int(item.get("quantity", 1))
        product.stock = max(0, product.stock - qty)
        product.save(update_fields=["stock", "updated_at"])
        OrderItem.objects.create(
            order=order,
            product_external_id=item.get("id", ""),
            vendor_id=item.get("vendorId", ""),
            name=item.get("name", product.name if product else ""),
            vendor_name=item.get("vendorName", ""),
            quantity=qty,
            unit_price=Decimal(str(item.get("price", product.price if product else 0))),
        )

    return order


def update_settings_from_payload(payload):
    settings = AppSetting.get_solo()
    if "storeName" in payload:
        settings.store_name = payload["storeName"]
    if "storeLogoUrl" in payload:
        settings.store_logo_url = payload["storeLogoUrl"]
    if "brandColor" in payload:
        settings.brand_color = payload["brandColor"]
    if "supportPhone" in payload:
        settings.support_phone = payload["supportPhone"]
    if "globalCommission" in payload:
        settings.global_commission = Decimal(str(payload["globalCommission"]))
    settings.save()
    return settings


def update_announcement_from_payload(payload):
    ann = Announcement.get_solo()
    if "active" in payload:
        ann.active = bool(payload["active"])
    if "message" in payload:
        ann.message = payload["message"]
    if "textColor" in payload:
        ann.text_color = payload["textColor"]
    ann.save()
    return ann
