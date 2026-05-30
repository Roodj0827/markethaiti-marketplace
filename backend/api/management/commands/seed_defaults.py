from datetime import datetime

from django.core.management.base import BaseCommand

from api.models import Announcement, AppSetting, Product, Vendor


class Command(BaseCommand):
    help = "Charge les vendeurs et produits par défaut (données de démo)"

    def handle(self, *args, **options):
        settings = AppSetting.get_solo()
        settings.store_name = "MarketHaiti"
        settings.store_logo_url = (
            "https://images.unsplash.com/photo-1523275335684-37898b6baf30"
            "?auto=format&fit=crop&w=160&q=80"
        )
        settings.brand_color = "#E63946"
        settings.support_phone = "+50941641700"
        settings.global_commission = 10
        settings.save()

        Announcement.objects.update_or_create(
            pk=1,
            defaults={
                "active": False,
                "message": "Profitez des nouveautés et des promotions directement sur notre boutique !",
                "text_color": "#ffffff",
            },
        )

        vendors_data = [
            {
                "external_id": "vendor-ma-boutique",
                "name": "Ma Boutique",
                "phone": "+50900000000",
                "logo": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=160&q=80",
                "commission": 100,
                "payment_method": "MonCash",
                "payment_details": "+509 0000 0000",
            },
            {
                "external_id": "vendor-mark-enley",
                "name": "Mark-Enley Shop",
                "phone": "+50937123456",
                "logo": "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=160&q=80",
                "commission": 85,
                "payment_method": "NatCash",
                "payment_details": "+509 3712 3456",
            },
            {
                "external_id": "vendor-kreyol-lakay",
                "name": "Kreyol Lakay",
                "phone": "+50938123456",
                "logo": "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=160&q=80",
                "commission": 90,
                "payment_method": "Bank",
                "payment_details": "BNC - 123-456-789",
            },
        ]
        for v in vendors_data:
            Vendor.objects.update_or_create(external_id=v["external_id"], defaults=v)

        products_data = [
            {
                "external_id": "prod-1",
                "vendor_id": "vendor-mark-enley",
                "name": "Chemise en lin tropical",
                "description": "Coupe légère, parfaite pour les journées chaudes.",
                "image_url": "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=900&q=80",
                "price": 2850,
                "stock": 18,
                "category": "Mode",
            },
            {
                "external_id": "prod-2",
                "vendor_id": "vendor-kreyol-lakay",
                "name": "Panier artisanal",
                "description": "Tressage local solide pour maison et marché.",
                "image_url": "https://images.unsplash.com/photo-1597481499666-130f8eb24e2a?auto=format&fit=crop&w=900&q=80",
                "price": 1950,
                "stock": 9,
                "category": "Maison",
            },
        ]
        now = datetime.utcnow()
        for p in products_data:
            vendor = Vendor.objects.get(external_id=p.pop("vendor_id"))
            Product.objects.update_or_create(
                external_id=p["external_id"],
                defaults={
                    **p,
                    "vendor": vendor,
                    "vendor_name": vendor.name,
                    "vendor_logo": vendor.logo,
                    "is_active": True,
                    "created_at": now,
                },
            )

        self.stdout.write(self.style.SUCCESS("Données par défaut chargées avec succès."))
