from django.db import models


class Vendor(models.Model):
    external_id = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, blank=True, default="")
    logo = models.TextField(blank=True, default="")
    commission = models.DecimalField(max_digits=6, decimal_places=2, default=10)
    payment_method = models.CharField(max_length=32, blank=True, default="MonCash")
    payment_details = models.TextField(blank=True, default="")
    moncash_number = models.CharField(max_length=64, blank=True, default="")
    natcash_number = models.CharField(max_length=64, blank=True, default="")
    due_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def to_json(self):
        return {
            "id": self.external_id,
            "name": self.name,
            "phone": self.phone,
            "logo": self.logo,
            "commission": float(self.commission),
            "paymentMethod": self.payment_method,
            "paymentDetails": self.payment_details,
            "moncashNumber": self.moncash_number,
            "natcashNumber": self.natcash_number,
            "dueBalance": float(self.due_balance),
            "createdAt": self.created_at.isoformat(),
        }


class Product(models.Model):
    external_id = models.CharField(max_length=64, unique=True)
    vendor = models.ForeignKey(
        Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name="products"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    price = models.DecimalField(max_digits=12, decimal_places=2)
    image_url = models.TextField(blank=True, default="")
    stock = models.PositiveIntegerField(default=0)
    category = models.CharField(max_length=128, blank=True, default="")
    is_active = models.BooleanField(default=True)
    vendor_name = models.CharField(max_length=255, blank=True, default="")
    vendor_logo = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    def sync_vendor_fields(self):
        if self.vendor:
            self.vendor_name = self.vendor.name
            self.vendor_logo = self.vendor.logo
        self.save(update_fields=["vendor_name", "vendor_logo", "updated_at"])

    def to_json(self):
        return {
            "id": self.external_id,
            "name": self.name,
            "description": self.description,
            "imageUrl": self.image_url,
            "price": float(self.price),
            "stock": int(self.stock),
            "category": self.category,
            "active": self.is_active,
            "vendorId": self.vendor.external_id if self.vendor else "",
            "vendorName": self.vendor_name,
            "vendorLogo": self.vendor_logo,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


class Customer(models.Model):
    external_id = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255)
    username = models.CharField(max_length=64, blank=True, default="")
    phone = models.CharField(max_length=32, db_index=True)
    password_hash = models.CharField(max_length=128)
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-registered_at"]

    def __str__(self):
        return self.name

    def to_json(self, include_hash=False):
        data = {
            "id": self.external_id,
            "name": self.name,
            "username": self.username,
            "phone": self.phone,
            "registeredAt": self.registered_at.isoformat(),
        }
        if include_hash:
            data["passwordHash"] = self.password_hash
        return data


class Order(models.Model):
    STATUS_CHOICES = [
        ("En attente", "En attente"),
        ("Validée", "Validée"),
        ("En livraison", "En livraison"),
        ("Livrée", "Livrée"),
    ]

    external_id = models.CharField(max_length=64, unique=True)
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="orders"
    )
    customer_name = models.CharField(max_length=255)
    customer_username = models.CharField(max_length=64, blank=True, default="")
    customer_phone = models.CharField(max_length=32, blank=True, default="")
    address = models.TextField(blank=True, default="")
    reception_phone = models.CharField(max_length=32, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    payment_method = models.CharField(max_length=64, blank=True, default="")
    proof_url = models.TextField(blank=True, default="")
    vendor_id = models.CharField(max_length=64, blank=True, default="")
    vendor_name = models.CharField(max_length=255, blank=True, default="")
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="En attente")
    due_applied = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.external_id

    def to_json(self):
        return {
            "id": self.external_id,
            "customerId": self.customer.external_id if self.customer else "",
            "customerName": self.customer_name,
            "customerUsername": self.customer_username,
            "customerPhone": self.customer_phone,
            "address": self.address,
            "receptionPhone": self.reception_phone,
            "notes": self.notes,
            "paymentMethod": self.payment_method,
            "proofUrl": self.proof_url,
            "vendorId": self.vendor_id,
            "vendorName": self.vendor_name,
            "total": float(self.total),
            "status": self.status,
            "dueApplied": self.due_applied,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
            "items": [item.to_json() for item in self.items.all()],
        }


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product_external_id = models.CharField(max_length=64, blank=True, default="")
    vendor_id = models.CharField(max_length=64, blank=True, default="")
    name = models.CharField(max_length=255)
    vendor_name = models.CharField(max_length=255, blank=True, default="")
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    def to_json(self):
        return {
            "id": self.product_external_id,
            "vendorId": self.vendor_id,
            "name": self.name,
            "vendorName": self.vendor_name,
            "quantity": int(self.quantity),
            "price": float(self.unit_price),
        }


class AppSetting(models.Model):
    """Singleton row (pk=1) for global storefront configuration."""

    store_name = models.CharField(max_length=255, default="MarketHaiti")
    store_logo_url = models.TextField(blank=True, default="")
    brand_color = models.CharField(max_length=16, default="#E63946")
    support_phone = models.CharField(max_length=32, default="+50941641700")
    global_commission = models.DecimalField(max_digits=6, decimal_places=2, default=10)
    payments = models.JSONField(default=dict, blank=True)
    order_counter = models.PositiveIntegerField(default=1000)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def settings_json(self):
        return {
            "storeName": self.store_name,
            "storeLogoUrl": self.store_logo_url,
            "brandColor": self.brand_color,
            "supportPhone": self.support_phone,
            "globalCommission": float(self.global_commission),
        }

    def default_payments(self):
        return {
            "moncash": {"numbers": [], "account": ""},
            "natcash": {"numbers": [], "account": ""},
            "bank": {"accountHolder": "", "accountNumber": "", "bankName": ""},
        }

    def payments_json(self):
        data = self.payments or {}
        defaults = self.default_payments()
        for key in defaults:
            if key not in data:
                data[key] = defaults[key]
        return data


class Announcement(models.Model):
    """Singleton announcement banner."""

    active = models.BooleanField(default=False)
    message = models.TextField(blank=True, default="")
    text_color = models.CharField(max_length=16, default="#ffffff")

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def to_json(self):
        return {
            "active": self.active,
            "message": self.message,
            "textColor": self.text_color,
        }


class AuditLog(models.Model):
    timestamp = models.DateTimeField(auto_now_add=True)
    date_display = models.CharField(max_length=64, blank=True, default="")
    action = models.CharField(max_length=255)
    details = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-timestamp"]

    def to_json(self):
        return {
            "timestamp": self.timestamp.isoformat(),
            "dateDisplay": self.date_display or self.timestamp.strftime("%d/%m/%Y %H:%M:%S"),
            "action": self.action,
            "details": self.details,
        }
