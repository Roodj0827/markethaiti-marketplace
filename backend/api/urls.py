from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
    path("bootstrap/", views.bootstrap_view),
    path("admin/bootstrap/", views.admin_bootstrap),
    path("products/", views.products_list),
    path("products/admin/", views.products_admin),
    path("products/<str:product_id>/", views.product_detail),
    path("settings/", views.settings_view),
    path("settings/update/", views.settings_update),
    path("announcements/", views.announcements_view),
    path("payments/", views.payments_view),
    path("payments/update/", views.payments_update),
    path("orders/", views.orders_create),
    path("orders/list/", views.orders_list),
    path("orders/<str:order_id>/", views.order_detail),
    path("orders/<str:order_id>/validate/", views.orders_validate),
    path("vendors/", views.vendors_list),
    path("vendors/<str:vendor_id>/", views.vendor_detail),
    path("vendors/<str:vendor_id>/reset-due/", views.vendor_reset_due),
    path("customers/", views.customers_list),
    path("customers/<str:customer_id>/", views.customer_detail),
    path("auth/register/", views.auth_register),
    path("auth/login/", views.auth_login),
    path("audit/", views.audit_list),
]
