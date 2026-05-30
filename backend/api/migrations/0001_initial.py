import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Announcement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("active", models.BooleanField(default=False)),
                ("message", models.TextField(blank=True, default="")),
                ("text_color", models.CharField(default="#ffffff", max_length=16)),
            ],
        ),
        migrations.CreateModel(
            name="AppSetting",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("store_name", models.CharField(default="MarketHaiti", max_length=255)),
                ("store_logo_url", models.TextField(blank=True, default="")),
                ("brand_color", models.CharField(default="#E63946", max_length=16)),
                ("support_phone", models.CharField(default="+50941641700", max_length=32)),
                ("global_commission", models.DecimalField(decimal_places=2, default=10, max_digits=6)),
                ("payments", models.JSONField(blank=True, default=dict)),
                ("order_counter", models.PositiveIntegerField(default=1000)),
            ],
        ),
        migrations.CreateModel(
            name="AuditLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                ("date_display", models.CharField(blank=True, default="", max_length=64)),
                ("action", models.CharField(max_length=255)),
                ("details", models.TextField(blank=True, default="")),
            ],
            options={"ordering": ["-timestamp"]},
        ),
        migrations.CreateModel(
            name="Customer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("external_id", models.CharField(max_length=64, unique=True)),
                ("name", models.CharField(max_length=255)),
                ("username", models.CharField(blank=True, default="", max_length=64)),
                ("phone", models.CharField(db_index=True, max_length=32)),
                ("password_hash", models.CharField(max_length=128)),
                ("registered_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-registered_at"]},
        ),
        migrations.CreateModel(
            name="Vendor",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("external_id", models.CharField(max_length=64, unique=True)),
                ("name", models.CharField(max_length=255)),
                ("phone", models.CharField(blank=True, default="", max_length=32)),
                ("logo", models.TextField(blank=True, default="")),
                ("commission", models.DecimalField(decimal_places=2, default=10, max_digits=6)),
                ("payment_method", models.CharField(blank=True, default="MonCash", max_length=32)),
                ("payment_details", models.TextField(blank=True, default="")),
                ("moncash_number", models.CharField(blank=True, default="", max_length=64)),
                ("natcash_number", models.CharField(blank=True, default="", max_length=64)),
                ("due_balance", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="Order",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("external_id", models.CharField(max_length=64, unique=True)),
                ("customer_name", models.CharField(max_length=255)),
                ("customer_username", models.CharField(blank=True, default="", max_length=64)),
                ("customer_phone", models.CharField(blank=True, default="", max_length=32)),
                ("address", models.TextField(blank=True, default="")),
                ("reception_phone", models.CharField(blank=True, default="", max_length=32)),
                ("notes", models.TextField(blank=True, default="")),
                ("payment_method", models.CharField(blank=True, default="", max_length=64)),
                ("proof_url", models.TextField(blank=True, default="")),
                ("vendor_id", models.CharField(blank=True, default="", max_length=64)),
                ("vendor_name", models.CharField(blank=True, default="", max_length=255)),
                ("total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("status", models.CharField(choices=[("En attente", "En attente"), ("Validée", "Validée"), ("En livraison", "En livraison"), ("Livrée", "Livrée")], default="En attente", max_length=32)),
                ("due_applied", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("customer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="orders", to="api.customer")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="Product",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("external_id", models.CharField(max_length=64, unique=True)),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True, default="")),
                ("price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("image_url", models.TextField(blank=True, default="")),
                ("stock", models.PositiveIntegerField(default=0)),
                ("category", models.CharField(blank=True, default="", max_length=128)),
                ("is_active", models.BooleanField(default=True)),
                ("vendor_name", models.CharField(blank=True, default="", max_length=255)),
                ("vendor_logo", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("vendor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="products", to="api.vendor")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="OrderItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("product_external_id", models.CharField(blank=True, default="", max_length=64)),
                ("vendor_id", models.CharField(blank=True, default="", max_length=64)),
                ("name", models.CharField(max_length=255)),
                ("vendor_name", models.CharField(blank=True, default="", max_length=255)),
                ("quantity", models.PositiveIntegerField(default=1)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="api.order")),
            ],
        ),
    ]
