from django.contrib import admin

from .models import Announcement, AppSetting, AuditLog, Customer, Order, OrderItem, Product, Vendor


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("product_external_id", "name", "quantity", "unit_price")


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "commission", "due_balance", "external_id")
    search_fields = ("name", "phone", "external_id")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "vendor_name", "price", "stock", "category", "is_active")
    list_filter = ("category", "is_active")
    search_fields = ("name", "external_id", "vendor_name")


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "username", "phone", "registered_at")
    search_fields = ("name", "username", "phone", "external_id")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("external_id", "customer_name", "total", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("external_id", "customer_name", "customer_phone")
    inlines = [OrderItemInline]


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ("order", "name", "quantity", "unit_price")


@admin.register(AppSetting)
class AppSettingAdmin(admin.ModelAdmin):
    list_display = ("store_name", "brand_color", "global_commission", "order_counter")


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("active", "message", "text_color")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "timestamp", "details")
    search_fields = ("action", "details")
    readonly_fields = ("timestamp",)
