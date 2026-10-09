"use strict";
    // =====================================================================
    // VantNet Haiti — Back-office Admin — fichier unique (HTML + CSS + JS)
    // Sommaire rapide de ce script :
    //   1. Config Supabase + état global (state) + ATTRIBUTE_TYPES
    //   2. Lecture/écriture Supabase (readStore, writeStore, deleteRows, upload)
    //   3. Chargement initial (seedData) + écoute temps réel
    //   4. Listes déroulantes dynamiques (renderAttributeSelect → table product_options)
    //   5. Visibilité des champs produit selon la catégorie (categoryProfile)
    //   6. Formulaire produit : galerie (fichier + URL), grille de prix par ml
    //   7. Rendu des tableaux (produits, clients, commandes, vendeurs, rapports)
    //   8. Écouteurs d'événements globaux (clics, formulaires, exports)
    // =====================================================================

    // SUPABASE CONFIGURATION (partagée via js/config.js → window.MH)
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.MH;
    const PAYMENT_VERIFY_URL = window.MH.PAYMENT_VERIFY_URL;

    // Rend les icônes Lucide du markup statique (<i data-icon="...">)
    hydrateIcons();

    let supabase = null;

    // Dynamically import and initialize Supabase
    const supabaseReady = (async () => {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.0/+esm');
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    })();

    // Hash SHA-256 du mot de passe PHRJ2003
    const ADMIN_HASH = "1a5e5d98ecd28d09630d95c9027845434ac8445573b2a27bff119c2d9314bebf";
    // Fallback cleartext pour environnements locaux sans crypto.subtle (temporaire)
    const FALLBACK_ADMIN_PW = "PHRJ2003";
    
    const STORAGE = {
      adminSession: "mh_admin_session_v2"
    };

    // Données par défaut
    const DEFAULT_SETTINGS = {
      storeName: "MarketHaiti",
      storeLogoUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=160&q=80",
      brandColor: "#1B4F9C",
      globalCommission: 10
    };

    const DEFAULT_PAYMENTS = {
      moncash: { numbers: [], account: "", logoUrl: "", enabled: true, instructions: "" },
      natcash: { numbers: [], account: "", logoUrl: "", enabled: true, instructions: "" },
      bank: { accountHolder: "", accountNumber: "", bankName: "", logoUrl: "", enabled: true, instructions: "" },
      custom: []
    };

    // Normalise la config paiement : garantit les nouvelles clés (logoUrl,
    // enabled, instructions, custom) même sur une ancienne ligne en base.
    function normalizePayments(raw) {
      const base = JSON.parse(JSON.stringify(DEFAULT_PAYMENTS));
      const src = raw || {};
      ["moncash", "natcash", "bank"].forEach((k) => {
        base[k] = { ...base[k], ...(src[k] || {}) };
        base[k].numbers = (base[k].numbers || []).map((n) => (typeof n === "string" ? { name: "", number: n } : n));
        if (base[k].enabled === undefined) base[k].enabled = true;
      });
      base.custom = Array.isArray(src.custom) ? src.custom : [];
      return base;
    }

    const DEFAULT_ANNOUNCEMENTS = {
      active: false,
      message: "Bienvenue sur VantNet — publiez une annonce active pour vos clients.",
      textColor: "#ffffff"
    };

    const state = {
      products: [], customers: [], orders: [], vendors: [], view: "dashboard", paymentType: "moncash",
      settings: {}, payments: {}, announcements: {}, auditLog: [],
      attributeOptions: {}, // { category: [...], brand: [...], color: [...], ram: [...], rom: [...], ml: [...], condition: [...] }
      formGallery: [], // URLs des images secondaires (imageGallery) en cours d'édition dans le formulaire produit
      formVolumes: [], // grille de prix par contenance (priceByVolume) en cours d'édition dans le formulaire produit
      formColorOptions: [] // liste de couleurs (colorOptions) en cours d'édition dans le formulaire produit
    };
    const ATTRIBUTE_TYPES = ["category", "brand", "color", "ram", "rom", "ml", "condition"];

    // ===== VISIBILITÉ DES CHAMPS SELON LA CATÉGORIE =====
    // Heuristique par mots-clés : comme les catégories sont libres et
    // ajoutées à la volée par l'admin, on détecte leur "famille" par le
    // texte plutôt que par une liste figée.
    const CATEGORY_KEYWORDS = {
      electronics: ["électronique", "electronique", "téléphone", "telephone", "smartphone", "informatique", "ordinateur", "tablette", "laptop", "pc", "tech", "gadget", "montre", "smartwatch"],
      fashion: ["mode", "vêtement", "vetement", "vêtements", "vetements", "chaussure", "chaussures", "montre", "accessoire", "sac", "bijou", "bijoux"],
      fragrance: ["parfum", "spray", "fragrance", "cologne", "cosmétique", "cosmetique"],
      food: ["épicerie", "epicerie", "alimentation", "nourriture", "boisson", "food"]
    };
    function categoryProfile(category) {
      const c = (category || "").toLowerCase();
      const matches = (list) => list.some((k) => c.includes(k));
      const isElectronics = matches(CATEGORY_KEYWORDS.electronics);
      const isFashion = matches(CATEGORY_KEYWORDS.fashion);
      const isFragrance = matches(CATEGORY_KEYWORDS.fragrance);
      const isFood = matches(CATEGORY_KEYWORDS.food);
      return {
        showBrand: !!c && !isFood,
        showCondition: !!c && !isFood,
        showRam: isElectronics,
        showRom: isElectronics,
        showVolume: isFragrance,
        showColorOptions: isElectronics || isFashion
      };
    }
    function applyCategoryFieldVisibility(category) {
      const profile = categoryProfile(category);
      if ($("#brandFieldBox")) $("#brandFieldBox").hidden = !profile.showBrand;
      if ($("#conditionFieldBox")) $("#conditionFieldBox").hidden = !profile.showCondition;
      if ($("#ramFieldBox")) $("#ramFieldBox").hidden = !profile.showRam;
      if ($("#romFieldBox")) $("#romFieldBox").hidden = !profile.showRom;
      if ($("#volumeSectionBox")) $("#volumeSectionBox").hidden = !profile.showVolume;
      if ($("#colorOptionsFieldBox")) $("#colorOptionsFieldBox").hidden = !profile.showColorOptions;
    }

    // Utilitaires
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    const money = (amt) => `${Number(amt || 0).toLocaleString("fr-HT")} HTG`;
    const uid = (prefix) => {
      if (prefix === "order") {
        const ts = Date.now().toString(36).toUpperCase();
        const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
        return `order-${ts}${rand}`;
      }
      return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    };
    const safeText = (val) => String(val ?? "");

    // Correspondance couleur (texte libre en français) → code hexadécimal,
    // utilisée pour afficher une pastille visuelle. Couleur non reconnue →
    // pastille neutre (dégradé gris), le nom reste affiché en texte à côté.
    const COLOR_NAME_TO_HEX = {
      "rouge": "#e63946", "bleu": "#3b82f6", "bleu marine": "#1d3557", "noir": "#111111",
      "blanc": "#ffffff", "vert": "#22c55e", "jaune": "#eab308", "gris": "#9ca3af",
      "rose": "#ec4899", "orange": "#f97316", "violet": "#8b5cf6", "mauve": "#a78bfa",
      "marron": "#78350f", "beige": "#e8dcc8", "doré": "#d4af37", "dore": "#d4af37",
      "or": "#d4af37", "argent": "#c0c0c0", "argenté": "#c0c0c0", "turquoise": "#14b8a6",
      "bordeaux": "#7f1d1d", "kaki": "#7a7d3c", "corail": "#ff6f61", "ivoire": "#fdf6ec",
      "champagne": "#f7e7ce", "bronze": "#8c6b4f", "cuivre": "#b87333", "multicolore": "linear-gradient(90deg,#e63946,#f4a261,#2a9d8f,#457b9d)"
    };
    function colorNameToHex(name) {
      const key = (name || "").trim().toLowerCase();
      return COLOR_NAME_TO_HEX[key] || "linear-gradient(135deg,#d1d5db,#f3f4f6)";
    }
    const copyToClipboard = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        alert("Copié dans le presse-papiers !");
      } catch (err) {
        prompt("Copier manuellement ce texte :", text);
      }
    };

    // MODAL MANAGEMENT
    function openModal(id) {
      $("#modalOverlay").classList.add("open");
      $(id).classList.add("open");
    }

    function closeModal() {
      $("#modalOverlay").classList.remove("open");
      $$(".modal").forEach((m) => m.classList.remove("open"));
    }

    // SHA-256 pour mot de passe
    async function sha256(val) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(val));
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    // Storage - Supabase integration
    async function readStore(table, fallback) {
      try {
        if (!supabase) return fallback;
        const { data, error } = await supabase.from(table).select("*");
        if (error) { console.error(`Supabase error reading ${table}:`, error); return fallback; }

        if (table === "settings" || table === "announcements" || table === "payments") {
          return data && data.length > 0 ? data[0] : fallback;
        }
        return data || fallback;
      } catch (err) {
        console.error(`Error in readStore(${table}):`, err);
        return fallback;
      }
    }

    async function writeStore(table, val) {
      try {
        if (!supabase) return;

        if (table === "settings" || table === "announcements" || table === "payments") {
          const { error } = await supabase.from(table).upsert([{ ...val, id: "main" }], { onConflict: "id" });
          if (error) console.error(`Supabase error writing to ${table}:`, error);
        } else if (Array.isArray(val)) {
          const { error } = await supabase.from(table).upsert(val, { onConflict: "id" });
          if (error) console.error(`Supabase error writing to ${table}:`, error);
        }
      } catch (err) {
        console.error("Error in writeStore:", err);
      }
    }

    // Supprime réellement une ou plusieurs lignes côté Supabase (un upsert seul ne supprime jamais une ligne)
    async function deleteRows(table, ids) {
      try {
        if (!supabase) return false;
        const list = Array.isArray(ids) ? ids : [ids];
        if (list.length === 0) return true;
        const { error } = await supabase.from(table).delete().in("id", list);
        if (error) { console.error(`Supabase error deleting from ${table}:`, error); return false; }
        return true;
      } catch (err) {
        console.error(`Error in deleteRows(${table}):`, err);
        return false;
      }
    }

    // Convertit un lien Google Drive partagé (vue/partage) en lien d'image direct utilisable dans une balise <img>
    function normalizeImageUrl(url) {
      if (!url) return url;
      url = url.trim();
      if (!/drive\.google\.com/.test(url)) return url;
      let fileId = "";
      let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (m) fileId = m[1];
      if (!fileId) {
        m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (m) fileId = m[1];
      }
      if (!fileId) return url;
      // Format fiable pour l'affichage direct d'images Google Drive (le fichier doit être partagé en "Tous les utilisateurs disposant du lien")
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    }

    // Applique la conversion Google Drive en direct sur un champ URL d'image (au blur)
    function bindDriveLinkNormalizer(inputId) {
      const el = document.getElementById(inputId);
      if (!el) return;
      el.addEventListener("blur", () => {
        const normalized = normalizeImageUrl(el.value);
        if (normalized && normalized !== el.value.trim()) el.value = normalized;
      });
    }

    // Upload d'un fichier vers Supabase Storage et récupération de l'URL publique
    async function uploadFileToBucket(bucket, file) {
      if (!supabase || !file) return "";
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
          cacheControl: "3600",
          upsert: false
        });
        if (uploadError) {
          console.error(`Erreur upload vers le bucket ${bucket}:`, uploadError);
          return "";
        }
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data?.publicUrl || "";
      } catch (err) {
        console.error(`Erreur uploadFileToBucket(${bucket}):`, err);
        return "";
      }
    }

    // AUDIT TRAIL - Enregistrement immuable de chaque action
    async function logAudit(action, details = "") {
      const entry = {
        timestamp: new Date().toISOString(),
        dateDisplay: new Date().toLocaleString("fr-FR"),
        action,
        details
      };
      state.auditLog.push(entry);
      await writeStore("audit_logs", state.auditLog);
    }

    // Initialisation
    async function seedData() {
      try {
        // Load products from Supabase
        const productsData = await readStore("products", []);
        state.products = productsData || [];

        // Load des listes déroulantes dynamiques (catégories, marques, couleurs, RAM, ROM, ml, états)
        const attrData = await readStore("product_options", []);
        state.attributeOptions = {};
        ATTRIBUTE_TYPES.forEach((t) => state.attributeOptions[t] = []);
        (attrData || []).forEach((a) => {
          if (!state.attributeOptions[a.group]) state.attributeOptions[a.group] = [];
          state.attributeOptions[a.group].push(a);
        });

        // Load vendors from Supabase
        const vendorsData = await readStore("vendors", []);
        state.vendors = vendorsData || [];

        // Load settings
        const settingsData = await readStore("settings", DEFAULT_SETTINGS);
        state.settings = settingsData || DEFAULT_SETTINGS;

        // Load payments (+ normalise : nouvelles clés logoUrl/enabled/instructions/custom)
        const paymentsData = await readStore("payments", DEFAULT_PAYMENTS);
        state.payments = normalizePayments(paymentsData);

        // Load announcements
        const announcementsData = await readStore("announcements", DEFAULT_ANNOUNCEMENTS);
        state.announcements = announcementsData || DEFAULT_ANNOUNCEMENTS;

        // Load customers
        const customersData = await readStore("customers", []);
        state.customers = customersData || [];

        // Load orders
        const ordersData = await readStore("orders", []);
        state.orders = (ordersData || []).map((order) => ({
          ...order,
          vendorId: order.vendorId || order.items?.[0]?.vendorId || "",
          vendorName: order.vendorName || order.items?.[0]?.vendorName || ""
        }));

        // Load audit log
        const auditData = await readStore("audit_logs", []);
        state.auditLog = auditData || [];
      } catch (err) {
        console.error("Error in seedData:", err);
      }
    }

    // Recharge les données depuis Supabase puis rafraîchit l'interface (utilisé par les écouteurs Realtime)
    async function reloadAndRenderAll() {
      await seedData();
      renderAll();
    }

    let realtimeInitialized = false;

    function setupRealtimeListeners() {
      if (!supabase || realtimeInitialized) return;
      realtimeInitialized = true;

      // Nouvelles commandes / changements de statut → rafraîchissement instantané du tableau de bord et des commandes
      supabase
        .channel('public:orders:admin')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
          const ordersData = await readStore("orders", []);
          state.orders = (ordersData || []).map((order) => ({
            ...order,
            vendorId: order.vendorId || order.items?.[0]?.vendorId || "",
            vendorName: order.vendorName || order.items?.[0]?.vendorName || ""
          }));
          renderAll();
        })
        .subscribe();

      // Vendeurs ajoutés/modifiés/supprimés depuis un autre poste admin
      supabase
        .channel('public:vendors:admin')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, async () => {
          const vendorsData = await readStore("vendors", []);
          state.vendors = vendorsData || [];
          renderAll();
        })
        .subscribe();

      // Produits ajoutés/modifiés/supprimés depuis un autre poste admin
      supabase
        .channel('public:products:admin')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
          const productsData = await readStore("products", []);
          state.products = productsData || [];
          renderAll();
        })
        .subscribe();

      // Journal d'audit alimenté en direct (utile si plusieurs admins sont connectés)
      supabase
        .channel('public:audit_logs:admin')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, async () => {
          const auditData = await readStore("audit_logs", []);
          state.auditLog = auditData || [];
          renderAuditLog();
        })
        .subscribe();
    }

    function showApp() { $("#appShell").style.display = "block"; $("#appShell").classList.add("authenticated"); renderAll(); }
    function showLogin() { showApp(); }

    function normalizeStatus(status) {
      return String(status || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    }

    function isRevenueOrder(status) {
      const normalized = normalizeStatus(status);
      return ["validee", "en livraison", "livree"].includes(normalized);
    }

    function isDeliveredOrder(status) {
      return normalizeStatus(status) === "livree";
    }

    function isPendingOrder(status) {
      return normalizeStatus(status) === "en attente";
    }

    function getOrderPrimaryVendorId(order) {
      return order.vendorId || order.items?.[0]?.vendorId || "";
    }

    function getOrderPrimaryVendorName(order) {
      return order.vendorName || order.items?.[0]?.vendorName || "";
    }

    function getOrderVendorTotal(order, vendorId) {
      return (order.items || []).filter((item) => item.vendorId === vendorId).reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    }

    function hasOrderVendor(order, vendorId) {
      return (order.items || []).some((item) => item.vendorId === vendorId);
    }

    function applyOrderDue(order) {
      if (order.dueApplied) return;
      (order.items || []).forEach((item) => {
        const vendor = state.vendors.find((v) => v.id === item.vendorId);
        if (!vendor || vendor.id === "vendor-ma-boutique") return;
        const itemTotal = Number(item.price) * Number(item.quantity);
        const commissionRate = Number((vendor.commission ?? state.settings.globalCommission) || 0);
        vendor.dueBalance = Number(vendor.dueBalance || 0) + itemTotal * (commissionRate / 100);
      });
      order.dueApplied = true;
    }

    function renderStats() {
      const delivered = state.orders.filter(o => isDeliveredOrder(o.status));
      const validated = state.orders.filter(o => isRevenueOrder(o.status));
      const pending = state.orders.filter(o => isPendingOrder(o.status));
      const commission = delivered.reduce((sum, order) => {
        const rate = state.settings.globalCommission || 10;
        return sum + (Number(order.total) * rate / 100);
      }, 0);
      $("#statProducts").textContent = state.products.length;
      $("#statCustomers").textContent = state.customers.length;
      $("#statCommissionEarned").textContent = money(commission);
      $("#statDelivered").textContent = delivered.length;
      // Alerte : comptes vendeurs en attente de validation (inscriptions
      // faites depuis la boutique — à approuver dans l'onglet Vendeurs)
      const pendingVendors = state.vendors.filter(v => v.status === "pending");
      const vendorAlert = pendingVendors.length ? `
        <div class="panel" style="border-left:4px solid #f59e0b;margin-bottom:14px;">
          <div class="panel-header"><h3>Comptes vendeurs en attente (${pendingVendors.length})</h3></div>
          <div class="panel-body"><p class="muted">${pendingVendors.map(v => `<strong>${safeText(v.name)}</strong>`).join(", ")} — approuvez-les dans l'onglet Vendeurs.</p></div>
        </div>` : "";
      $("#recentOrders").innerHTML = vendorAlert + `<div class="panel"><div class="panel-header"><h3>Commandes en attente de vérification (${pending.length})</h3></div>${renderOrdersTable(pending.slice(0, 5), true)}</div>`;
    }

    // RENDER PRODUCTS TABLE
    function renderProductsTable() {
      $("#productsTable").innerHTML = `
        <div class="table-wrap"><table>
          <thead><tr><th>Image</th><th>Produit</th><th>Boutique</th><th>Prix</th><th>Stock</th><th>Actions</th></tr></thead>
          <tbody>${state.products.map((p) => `
            <tr>
              <td>${p.imageUrl ? `<img class="thumb" src="${safeText(p.imageUrl)}" alt="">` : ""}</td>
              <td><strong>${safeText(p.name)}</strong><br><span class="muted">${safeText(p.category)}</span></td>
              <td>${p.vendorLogo ? `<img class="thumb" src="${safeText(p.vendorLogo)}" alt="">` : ""} ${safeText(p.vendorName)}</td>
              <td>${money(p.price)}</td><td>${Number(p.stock)}</td>
              <td><button class="btn-soft" type="button" data-edit-product="${p.id}">${icon('pencil')}</button> <button class="btn-danger" type="button" data-delete-product="${p.id}">${icon('trash-2')}</button></td>
            </tr>`).join("") || `<tr><td colspan="6">Aucun produit.</td></tr>`}
          </tbody>
        </table></div>`;
    }

    // RENDER CUSTOMERS TABLE
    function renderCustomersTable() {
      $("#customersTable").innerHTML = `
        <div class="table-wrap"><table>
          <thead><tr><th>Nom</th><th>Username</th><th>Téléphone</th><th>Email</th><th>Commandes</th><th>Total dépensé</th><th>Date inscription</th><th>Actions</th></tr></thead>
          <tbody>${state.customers.map((c) => {
            const orders = state.orders.filter(o => o.customerId === c.id && o.status !== "En attente");
            const total = orders.reduce((sum, o) => sum + Number(o.total), 0);
            return `<tr><td><strong>${safeText(c.name)}</strong></td><td>${safeText(c.username)}</td><td>${safeText(c.phone)}</td><td>${safeText(c.email) || '<span class="muted">—</span>'}</td><td>${orders.length}</td><td>${money(total)}</td><td>${new Date(c.registeredAt).toLocaleDateString("fr-FR")}</td><td>
              <button class="btn-soft" type="button" data-reset-password="${c.id}" title="Définir un mot de passe temporaire">${icon('key')}</button>
              ${c.email ? `<button class="btn-soft" type="button" data-send-reset-email="${c.id}" title="Envoyer un lien de réinitialisation par email">${icon('mail')}</button>` : ""}
              <button class="btn-danger" type="button" data-delete-customer="${c.id}">${icon('trash-2')}</button>
            </td></tr>`;
          }).join("") || `<tr><td colspan="8">Aucun client.</td></tr>`}
          </tbody>
        </table></div>`;
    }

    // RENDER ORDERS TABLE
    function renderOrdersTable(orders = state.orders, compact = false) {
      const getStatusClass = (status) => {
        if (status === "En attente") return "pending";
        if (status === "Validée") return "validated";
        if (status === "En livraison") return "shipping";
        if (status === "Livrée") return "delivered";
        if (status === "Annulée") return "cancelled";
        return "";
      };
      const paymentBadge = (o) => {
        if (o.paymentMethod !== "MonCash") return "";
        const map = {
          pending: ["Paiement en attente", "payment-pending"],
          succeeded: ["Payé", "payment-succeeded"],
          failed: ["Paiement échoué", "payment-failed"],
          cancelled: ["Paiement annulé", "payment-cancelled"],
        };
        const [label, cls] = map[o.paymentStatus] || map.pending;
        return `<br><span class="status-pill ${cls}" style="margin-top:4px;">${label}</span>`;
      };
      return `<div class="table-wrap"><table>
        <thead><tr><th>Commande</th><th>Client</th><th>Total</th><th>Statut</th><th>Preuve</th><th>Date</th>${compact ? "" : "<th>Actions</th>"}</tr></thead>
        <tbody>${orders.map((o) => `
          <tr>
            <td><strong>${safeText(o.id)}</strong><br><span class="muted">${o.items.map((i) => `${safeText(i.name)} x${i.quantity}`).join(", ")}</span></td>
            <td>${safeText(o.customerName)}<br><span class="muted">${safeText(o.customerPhone)}</span></td>
            <td>${money(o.total)}</td>
            <td>${compact ? `<span class="status-pill ${getStatusClass(o.status)}">${safeText(o.status)}</span>` : `<select data-order-status="${o.id}"><option ${o.status === "En attente" ? "selected" : ""}>En attente</option><option ${o.status === "Validée" ? "selected" : ""}>Validée</option><option ${o.status === "En livraison" ? "selected" : ""}>En livraison</option><option ${o.status === "Livrée" ? "selected" : ""}>Livrée</option><option ${o.status === "Annulée" ? "selected" : ""}>Annulée</option></select>`}${paymentBadge(o)}</td>
            <td>${o.proofUrl ? `<span class="badge">${icon('check')} OUI</span>` : "<span class='muted'>-</span>"}</td>
            <td>${new Date(o.createdAt).toLocaleString("fr-FR")}</td>
            ${compact ? "" : `<td><button class="btn-soft" type="button" data-view-order="${o.id}">${icon('info')} Détails</button> <button class="btn-soft" type="button" data-view-proof="${o.id}" ${o.proofUrl ? "" : "disabled"}>${icon('image')}</button> ${o.paymentMethod === "MonCash" && o.paymentStatus !== "succeeded" ? `<button class="btn-soft" type="button" data-verify-payment="${o.id}">${icon('refresh-cw')} Vérifier paiement</button>` : ""} <button class="btn-soft" type="button" data-validate-order="${o.id}" ${o.status === "En attente" && o.proofUrl ? "" : "disabled"}>${icon('circle-check')} Valider</button> <button class="btn-soft" type="button" data-whatsapp="${o.id}">${icon('whatsapp')} WhatsApp</button> <button class="btn-danger" type="button" data-delete-order="${o.id}">${icon('trash-2')}</button></td>`}
          </tr>`).join("") || `<tr><td colspan="${compact ? 6 : 8}">Aucune commande.</td></tr>`}
        </tbody>
      </table></div>`;
    }

    function renderOrders() { $("#ordersTable").innerHTML = renderOrdersTable(); }

    // Balayage silencieux : demande à bazik-verify-payment de vérifier TOUTES
    // les commandes MonCash "pending" auprès de Bazik (mode sweep, body {}).
    // Sécurité contre les clients qui paient puis ferment le navigateur sans
    // revenir — le solde est rattrapé même sans retour sur la boutique.
    let paymentSweepRunning = false;
    async function sweepPendingPayments() {
      if (paymentSweepRunning) return;
      paymentSweepRunning = true;
      try {
        const res = await fetch(PAYMENT_VERIFY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "apikey": SUPABASE_ANON_KEY },
          body: JSON.stringify({})
        });
        const data = await res.json();
        if (data?.checked > 0) {
          const ordersData = await readStore("orders", []);
          state.orders = ordersData || state.orders;
          renderOrders(); renderStats();
        }
      } catch { /* silencieux : le cron Supabase prend le relais */ }
      paymentSweepRunning = false;
    }
    // Balayage au chargement puis toutes les 2 minutes tant que l'admin reste ouvert
    sweepPendingPayments();
    setInterval(sweepPendingPayments, 2 * 60 * 1000);

    // RENDER PAYMENT FIELDS — chaque méthode a : logo (URL ou upload), toggle
    // "activée au checkout", instructions client, et ses infos de compte.
    // MonCash peut en plus basculer en mode automatique via l'API Bazik.
    function renderPaymentFields() {
      const type = state.paymentType;
      const data = state.payments[type] || {};
      let html = "";
      // Les méthodes personnalisées se sauvegardent à l'ajout — pas besoin du
      // bouton "Enregistrer" du formulaire dans cet onglet.
      const submitBtn = $("#paymentForm button[type='submit']");
      if (submitBtn) submitBtn.style.display = type === "custom" ? "none" : "";

      // Méthodes personnalisées (ex: Lajan Cash, virement, cash...) — le client
      // voit nom + logo + instructions et uploade une preuve, comme NatCash.
      if (type === "custom") {
        html = `
          <div class="field full"><p class="muted">Méthodes de paiement supplémentaires affichées au checkout avec leur logo et leurs instructions. Le client envoie une preuve de paiement comme pour NatCash.</p></div>
          <div class="field full"><div id="customMethodsList"></div></div>
          <div class="field"><label for="customMethodName">Nom de la méthode</label><input id="customMethodName" type="text" placeholder="Ex: Lajan Cash"></div>
          <div class="field"><label for="customMethodLogo">Logo (URL)</label><input id="customMethodLogo" type="url" placeholder="https://..."></div>
          <div class="field"><label for="customMethodLogoFile">...ou importer le logo</label><input id="customMethodLogoFile" type="file" accept="image/*"></div>
          <div class="field full"><label for="customMethodInstructions">Instructions affichées au client</label><textarea id="customMethodInstructions" placeholder="Numéro, nom du compte, étapes à suivre..."></textarea></div>
          <div class="field full"><button id="addCustomMethod" class="btn-soft" type="button">${icon('plus')} Ajouter la méthode</button></div>
        `;
        setTimeout(() => { renderCustomMethodsList(); }, 0);
        $("#paymentFields").innerHTML = html;
        return;
      }

      const methodLabel = type === "moncash" ? "MonCash" : type === "natcash" ? "NatCash" : "Compte bancaire";
      const commonFields = `
        <div class="field full" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
          ${data.logoUrl ? `<img src="${safeText(data.logoUrl)}" alt="Logo ${methodLabel}" class="pay-method-logo-preview">` : `<div class="pay-method-logo-placeholder">${icon('image')}</div>`}
          <div style="flex:1;min-width:220px;display:grid;gap:8px;">
            <div><label for="paymentLogoUrl" style="font-size:12.5px;font-weight:700;">Logo ${methodLabel} (URL)</label><input id="paymentLogoUrl" type="url" value="${safeText(data.logoUrl || "")}" placeholder="https://..."></div>
            <div><label for="paymentLogoFile" style="font-size:12.5px;font-weight:700;">...ou importer le logo</label><input id="paymentLogoFile" type="file" accept="image/*"></div>
          </div>
        </div>
        <div class="field full"><label style="display:flex;align-items:center;gap:10px;font-weight:800;"><input id="methodEnabledToggle" type="checkbox" ${data.enabled !== false ? "checked" : ""}> Méthode activée (visible au checkout)</label></div>
        <div class="field full"><label for="paymentInstructions">Instructions affichées au client</label><textarea id="paymentInstructions" placeholder="Ex: Envoyez le montant exact, puis uploadez la capture...">${safeText(data.instructions || "")}</textarea></div>
      `;

      if (type === "moncash") {
        // MonCash = automatique uniquement (Bazik) — pas de flux manuel.
        // Le client paie en direct et la commande est validée automatiquement.
        html = `
          <div class="field full" style="background:var(--bg,#f6f7fb);border:1.5px solid var(--border,#e2e5ec);border-radius:10px;padding:14px;margin-bottom:6px;">
            <label style="display:flex;align-items:center;gap:10px;font-weight:800;">
              ${icon('lock')} Paiement MonCash automatique (API Bazik)
            </label>
            <p class="muted" style="margin-top:6px;font-size:12.5px;">
              Le client est redirigé vers la page de paiement MonCash sécurisée et la commande est validée automatiquement dès confirmation Bazik — aucune preuve à uploader.<br>
              <strong>Clés API :</strong> les identifiants Bazik (BAZIK_USER_ID / BAZIK_SECRET_KEY) se configurent comme secrets Supabase — voir <code>supabase/README.md</code>. Ne les saisissez jamais ici.
            </p>
          </div>
          ${commonFields}
        `;
      } else if (type === "natcash") {
        html = `
          ${commonFields}
          <div class="field full"><label>Destinataires NATCASH</label><div id="numbersList"></div></div>
          <div class="field full"><button id="addNumber" class="btn-soft" type="button">${icon('plus')} Ajouter destinataire</button></div>
          <div class="field full"><label for="paymentAccount">Compte à créditer</label><input id="paymentAccount" type="text" value="${safeText(data.account || "")}" placeholder="Numéro de compte..."></div>
        `;
        setTimeout(() => {
          const list = $("#numbersList");
          if (!list) return;
          list.innerHTML = (data.numbers || []).map((r, idx) => `
            <div class="payment-method">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                <div>
                  <div style="font-size:15px;font-weight:800">${safeText(r.name || "(Nom non renseigné)")}</div>
                  <div class="muted">${safeText(r.number)}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <button type="button" data-copy-number="${idx}" class="btn-soft" title="Copier le numéro">${icon('copy')}</button>
                  <button type="button" data-remove-number="${idx}" class="btn-danger" title="Supprimer">${icon('trash-2')}</button>
                </div>
              </div>
            </div>
          `).join("");
        }, 0);
      } else {
        html = `
          ${commonFields}
          <div class="field"><label for="bankName">Nom de la banque</label><input id="bankName" type="text" value="${safeText(data.bankName || "")}" placeholder="Ex: BNC"></div>
          <div class="field"><label for="accountHolder">Titulaire du compte</label><input id="accountHolder" type="text" value="${safeText(data.accountHolder || "")}"></div>
          <div class="field full"><label for="bankAccount">Numéro de compte</label><input id="bankAccount" type="text" value="${safeText(data.accountNumber || "")}" placeholder="Numéro complet..."></div>
        `;
      }
      $("#paymentFields").innerHTML = html;
    }

    // Liste des méthodes personnalisées (state.payments.custom)
    function renderCustomMethodsList() {
      const list = $("#customMethodsList");
      if (!list) return;
      const custom = state.payments.custom || [];
      list.innerHTML = custom.map((m, idx) => `
        <div class="payment-method">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div style="display:flex;align-items:center;gap:10px;">
              ${m.logoUrl ? `<img src="${safeText(m.logoUrl)}" class="pay-method-logo-preview" alt="">` : `<div class="pay-method-logo-placeholder">${icon('wallet')}</div>`}
              <div>
                <div style="font-size:15px;font-weight:800">${safeText(m.name)}</div>
                <div class="muted">${m.enabled !== false ? "Visible au checkout" : "Masquée"}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <button type="button" data-toggle-custom="${idx}" class="btn-soft" title="Activer / masquer">${icon(m.enabled !== false ? 'eye' : 'eye-off')}</button>
              <button type="button" data-remove-custom="${idx}" class="btn-danger" title="Supprimer">${icon('trash-2')}</button>
            </div>
          </div>
        </div>
      `).join("") || `<p class="muted">Aucune méthode personnalisée pour le moment.</p>`;
    }

    // RENDER AUDIT LOG
    function renderAuditLog() {
      $("#auditLog").innerHTML = state.auditLog.length ? state.auditLog.slice().reverse().map((entry) => `
        <div class="audit-entry">
          <strong>${entry.action}</strong><br>
          <span class="muted">${entry.dateDisplay}</span>${entry.details ? `<br>${entry.details}` : ""}
        </div>
      `).join("") : `<p class="muted">Aucune activité enregistrée.</p>`;
    }

    // RENDER FINANCIAL REPORTS
    function renderReports() {
      const validated = state.orders.filter(o => isRevenueOrder(o.status));
      const totalRevenue = validated.reduce((sum, o) => sum + Number(o.total), 0);
      let platformCommission = 0;
      let maBoutiqueSales = 0;
      validated.forEach(order => {
        (order.items || []).forEach((item) => {
          const vendor = state.vendors.find(v => v.id === item.vendorId);
          const itemTotal = Number(item.price) * Number(item.quantity);
          if (vendor?.id === "vendor-ma-boutique" || vendor?.commission === 100) {
            maBoutiqueSales += itemTotal;
          } else if (vendor) {
            const vendorShare = itemTotal * (Number(vendor.commission) / 100);
            platformCommission += (itemTotal - vendorShare);
          } else {
            platformCommission += itemTotal * (state.settings.globalCommission / 100);
          }
        });
      });
      const totalDueToVendors = state.vendors.reduce((sum, v) => sum + Number(v.dueBalance || 0), 0);
      const platformRevenue = maBoutiqueSales + platformCommission;
      const counters = `
        <div class="stats-grid">
          <div class="stat-card">${icon('chart-line')}<strong>${money(totalRevenue)}</strong><span class="muted">Chiffre d'affaires total</span></div>
          <div class="stat-card">${icon('building')}<strong>${money(platformRevenue)}</strong><span class="muted">Revenus plateforme</span></div>
          <div class="stat-card">${icon('hand-coins')}<strong>${money(totalDueToVendors)}</strong><span class="muted">Total dû aux vendeurs</span></div>
        </div>
      `;
      let html = counters + `<div class="table-wrap"><table><thead><tr><th>Vendeur</th><th>Commandes validées</th><th>Total brut</th><th>Solde dû</th></tr></thead><tbody>`;
      state.vendors.forEach(v => {
        const validatedOrders = validated.filter(o => hasOrderVendor(o, v.id));
        const totalSales = validatedOrders.reduce((sum, o) => sum + getOrderVendorTotal(o, v.id), 0);
        html += `<tr><td><strong>${safeText(v.name)}</strong></td><td>${validatedOrders.length}</td><td>${money(totalSales)}</td><td>${money(Number(v.dueBalance || 0))}</td></tr>`;
      });
      html += `</tbody></table></div>`;

      if (validated.length) {
        html += `<div class="panel" style="margin-top:18px;"><div class="panel-header"><h3>Commandes validées</h3></div><div class="table-wrap"><table><thead><tr><th>Commande</th><th>Client</th><th>Vendeur</th><th>Total brut</th><th>Statut</th></tr></thead><tbody>`;
        validated.forEach((order) => {
          const vendorNames = [...new Set((order.items || []).map((item) => item.vendorName || state.vendors.find((v) => v.id === item.vendorId)?.name || "MarketHaiti"))].filter(Boolean);
          html += `<tr><td>${safeText(order.id)}</td><td>${safeText(order.customerName)}</td><td>${safeText(vendorNames.length > 1 ? "Plusieurs vendeurs" : vendorNames[0] || "MarketHaiti")}</td><td>${money(order.total)}</td><td>${safeText(order.status)}</td></tr>`;
        });
        html += `</tbody></table></div></div>`;
      } else {
        html += `<div class="panel" style="margin-top:18px;"><div class="panel-header"><h3>Commandes validées</h3></div><div class="panel-body"><p class="muted">Aucune commande validée pour le moment.</p></div></div>`;
      }
      $("#reportsContent").innerHTML = html;
    }

    // Export CSV Financier
    function exportFinancialExcel() {
      const validated = state.orders.filter(o => isRevenueOrder(o.status));
      
      // Sheet 1: RÉSUMÉ
      const averageCommission = state.vendors.length
        ? (state.vendors.reduce((sum, v) => sum + Number(v.commission || 0), 0) / state.vendors.length).toFixed(2)
        : "0.00";
      const summaryData = [
        ["RÉSUMÉ FINANCIER", ""],
        ["Date d'export", new Date().toLocaleString("fr-HT")],
        [],
        ["Métrique", "Valeur"],
        ["Chiffre d'affaires total", validated.reduce((sum, o) => sum + Number(o.total), 0)],
        ["Nombre de commandes", validated.length],
        ["Total dû aux vendeurs", state.vendors.reduce((sum, v) => sum + Number(v.dueBalance || 0), 0)],
        ["Commission moyenne", averageCommission]
      ];

      // Sheet 2: VENDEURS
      const vendorData = [["Vendeur", "Commission %", "Commandes", "Total brut", "Solde dû"]];
      state.vendors.forEach(v => {
        const vendorOrders = validated.filter(o => hasOrderVendor(o, v.id));
        const totalSales = vendorOrders.reduce((sum, o) => sum + getOrderVendorTotal(o, v.id), 0);
        vendorData.push([v.name, Number(v.commission || 0), vendorOrders.length, totalSales, Number(v.dueBalance || 0)]);
      });

      // Sheet 3: CLIENTS
      const customerData = [["Client", "Username", "Téléphone", "Commandes", "Total dépensé"]];
      state.customers.forEach(c => {
        const orders = validated.filter(o => o.customerId === c.id);
        const total = orders.reduce((sum, o) => sum + Number(o.total), 0);
        customerData.push([c.name, c.username, c.phone, orders.length, total]);
      });

      // Sheet 4: COMMANDES
      const ordersData = [["ID Commande", "Client", "Vendeur", "Montant", "Statut", "Date", "Preuve"]];
      validated.forEach(o => {
        const customer = state.customers.find(c => c.id === o.customerId);
        const vendorNames = [...new Set((o.items || []).map((item) => item.vendorName || state.vendors.find((v) => v.id === item.vendorId)?.name || "?"))].filter(Boolean);
        ordersData.push([o.id, customer?.name || "?", vendorNames.length > 1 ? "Plusieurs vendeurs" : vendorNames[0] || "?", Number(o.total), o.status, new Date(o.createdAt).toLocaleDateString("fr-HT"), o.proofUrl ? "Oui" : "Non"]);
      });

      // Sheet 5: PRODUITS
      const productData = [["Produit", "Vendeur", "Prix", "Stock", "Catégorie"]];
      state.products.forEach(p => {
        const vendor = state.vendors.find(v => v.id === p.vendorId);
        productData.push([p.name, vendor?.name || "?", Number(p.price), Number(p.stock), p.category]);
      });

      // Sheet 6: AUDIT
      const auditData = [["Timestamp", "Action", "Détails"]];
      state.auditLog.forEach(entry => {
        auditData.push([new Date(entry.timestamp).toLocaleString("fr-HT"), entry.action, entry.details]);
      });

      // Créer le classeur
      const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
      const ws2 = XLSX.utils.aoa_to_sheet(vendorData);
      const ws3 = XLSX.utils.aoa_to_sheet(customerData);
      const ws4 = XLSX.utils.aoa_to_sheet(ordersData);
      const ws5 = XLSX.utils.aoa_to_sheet(productData);
      const ws6 = XLSX.utils.aoa_to_sheet(auditData);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, "Résumé");
      XLSX.utils.book_append_sheet(wb, ws2, "Vendeurs");
      XLSX.utils.book_append_sheet(wb, ws3, "Clients");
      XLSX.utils.book_append_sheet(wb, ws4, "Commandes");
      XLSX.utils.book_append_sheet(wb, ws5, "Produits");
      XLSX.utils.book_append_sheet(wb, ws6, "Audit");

      XLSX.writeFile(wb, `marche-haiti-rapport-${Date.now()}.xlsx`);
      logAudit("Export Excel", "Rapport complet multi-feuilles généré");
    }

    function renderAll() {
      renderStats();
      renderProductsTable();
      renderCustomersTable();
      renderOrders();
      renderAuditLog();
      renderReports();
      renderVendorOptions();
      renderVendorsTable();
      renderVendorsFinancial();
      if ($("#storeName")) $("#storeName").value = state.settings.storeName || DEFAULT_SETTINGS.storeName;
      if ($("#storeLogoUrl")) $("#storeLogoUrl").value = state.settings.storeLogoUrl || DEFAULT_SETTINGS.storeLogoUrl;
      if ($("#adminBrandLogo")) $("#adminBrandLogo").src = state.settings.storeLogoUrl || DEFAULT_SETTINGS.storeLogoUrl;
      if ($("#adminBrandName")) $("#adminBrandName").textContent = state.settings.storeName || DEFAULT_SETTINGS.storeName;
      if ($("#brandColor")) $("#brandColor").value = state.settings.brandColor || DEFAULT_SETTINGS.brandColor;
      if ($("#brandColorDisplay")) $("#brandColorDisplay").textContent = state.settings.brandColor || DEFAULT_SETTINGS.brandColor;
      if ($("#globalCommission")) $("#globalCommission").value = state.settings.globalCommission ?? DEFAULT_SETTINGS.globalCommission;
      if ($("#announcementText")) $("#announcementText").value = state.announcements.message || DEFAULT_ANNOUNCEMENTS.message;
      if ($("#announcementTextColor")) $("#announcementTextColor").value = state.announcements.textColor || DEFAULT_ANNOUNCEMENTS.textColor;
      if ($("#announcementActive")) $("#announcementActive").checked = !!state.announcements.active;
      if ($("#storeLogoPreview")) $("#storeLogoPreview").src = state.settings.storeLogoUrl || DEFAULT_SETTINGS.storeLogoUrl;
    }

    // ===== LISTES DÉROULANTES DYNAMIQUES (catégories, marques, couleurs, RAM, ROM, ml, états) =====
    // Affiche un <select> rempli depuis product_options + un bouton "+" pour
    // ajouter une nouvelle option à la volée (persistée en base immédiatement).
    function renderAttributeSelect(containerEl, group, selectedValue, onChangeCb) {
      if (!containerEl) return;
      const options = state.attributeOptions[group] || [];
      containerEl.innerHTML = `
        <div style="display:flex;gap:6px;">
          <select class="attr-select" style="flex:1;">
            <option value="">-- Choisir --</option>
            ${options.map((o) => `<option value="${safeText(o.value)}" ${o.value === selectedValue ? "selected" : ""}>${safeText(o.value)}</option>`).join("")}
          </select>
          <button type="button" class="btn-ghost attr-add-btn" title="Ajouter une nouvelle option">${icon('plus')}</button>
        </div>`;
      const select = containerEl.querySelector(".attr-select");
      const addBtn = containerEl.querySelector(".attr-add-btn");
      if (onChangeCb) select.addEventListener("change", () => onChangeCb(select.value));
      addBtn.addEventListener("click", async () => {
        const newVal = prompt(`Nouvelle option pour "${group}" :`);
        if (!newVal || !newVal.trim()) return;
        const value = newVal.trim();
        if ((state.attributeOptions[group] || []).some((o) => o.value.toLowerCase() === value.toLowerCase())) {
          alert("Cette option existe déjà dans la liste.");
          return;
        }
        const row = { id: uid("opt"), group, value };
        const { error } = await supabase.from("product_options").upsert([row], { onConflict: "id" });
        if (error) { console.error("Erreur ajout product_options:", error); alert("Erreur lors de l'ajout de l'option."); return; }
        if (!state.attributeOptions[group]) state.attributeOptions[group] = [];
        state.attributeOptions[group].push(row);
        renderAttributeSelect(containerEl, group, value, onChangeCb);
        if (onChangeCb) onChangeCb(value);
      });
    }

    // ===== GALERIE (jusqu'à 5 images secondaires — imageGallery) =====
    let selectedGalleryFiles = []; // Fichiers nouvellement sélectionnés (pas encore uploadés)

    function renderGalleryPreview() {
      const box = $("#galleryPreview");
      if (!box) return;
      const existingThumbs = state.formGallery.map((url, idx) => `
        <div style="position:relative;">
          <img src="${safeText(url)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border,#e8e6e1);">
          <button type="button" class="gallery-remove-existing" data-idx="${idx}" title="Retirer" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--danger,#ef4444);color:#fff;border:0;font-size:11px;"></button>
        </div>`).join("");
      const newThumbs = selectedGalleryFiles.map((file, idx) => `
        <div style="position:relative;">
          <img src="${URL.createObjectURL(file)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:2px solid var(--brand,#E63946);">
          <button type="button" class="gallery-remove-new" data-idx="${idx}" title="Retirer" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--danger,#ef4444);color:#fff;border:0;font-size:11px;"></button>
        </div>`).join("");
      box.innerHTML = existingThumbs + newThumbs || `<p class="muted" style="font-size:12px;">Aucune image secondaire pour le moment.</p>`;
      box.querySelectorAll(".gallery-remove-existing").forEach((btn) => btn.addEventListener("click", () => {
        state.formGallery.splice(Number(btn.dataset.idx), 1);
        renderGalleryPreview();
      }));
      box.querySelectorAll(".gallery-remove-new").forEach((btn) => btn.addEventListener("click", () => {
        selectedGalleryFiles.splice(Number(btn.dataset.idx), 1);
        renderGalleryPreview();
      }));
    }

    $("#productGalleryFiles")?.addEventListener("change", (e) => {
      const totalAllowed = 5 - state.formGallery.length - selectedGalleryFiles.length;
      const incoming = Array.from(e.target.files || []).slice(0, Math.max(0, totalAllowed));
      if (Array.from(e.target.files || []).length > totalAllowed) {
        alert(`Maximum 5 images secondaires. ${totalAllowed} emplacement(s) restant(s) ont été utilisés.`);
      }
      selectedGalleryFiles = selectedGalleryFiles.concat(incoming).slice(0, 5);
      renderGalleryPreview();
      e.target.value = "";
    });

    $("#addGalleryUrlBtn")?.addEventListener("click", () => {
      const input = $("#productGalleryUrl");
      const url = normalizeImageUrl(input.value.trim());
      if (!url) { alert("Merci de coller un lien d'image valide."); return; }
      if (state.formGallery.length + selectedGalleryFiles.length >= 5) {
        alert("Maximum 5 images secondaires.");
        return;
      }
      if (state.formGallery.includes(url)) { alert("Ce lien est déjà dans la galerie."); return; }
      state.formGallery.push(url);
      input.value = "";
      renderGalleryPreview();
    });

    // ===== GRILLE DE PRIX PAR CONTENANCE (priceByVolume — parfums / sprays) =====
    function refreshNewVolumeField() {
      renderAttributeSelect($("#newVolumeMlWrap"), "ml", "");
    }

    function renderVolumesEditor() {
      const box = $("#volumesEditor");
      if (!box) return;
      if (state.formVolumes.length === 0) {
        box.innerHTML = `<p class="muted" style="font-size:12px;">Aucune contenance ajoutée — le produit utilisera le prix de base.</p>`;
        return;
      }
      box.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Contenance</th><th>Prix</th><th></th></tr></thead>
        <tbody>${state.formVolumes.map((v, idx) => `
          <tr>
            <td>${safeText(v.ml)}</td>
            <td>${money(v.price)}</td>
            <td><button type="button" class="btn-danger remove-volume-row" data-idx="${idx}">${icon('trash-2')}</button></td>
          </tr>`).join("")}</tbody>
      </table></div>`;
      box.querySelectorAll(".remove-volume-row").forEach((btn) => btn.addEventListener("click", () => {
        state.formVolumes.splice(Number(btn.dataset.idx), 1);
        renderVolumesEditor();
      }));
    }

    $("#addVolumeBtn")?.addEventListener("click", () => {
      const ml = $("#newVolumeMlWrap select")?.value || "";
      const price = $("#newVolumePrice").value;
      if (!ml) { alert("Choisissez une contenance (ou ajoutez-en une avec le bouton +)."); return; }
      if (price === "") { alert("Merci de renseigner le prix pour cette contenance."); return; }
      if (state.formVolumes.some((v) => v.ml === ml)) {
        alert("Cette contenance est déjà dans la grille.");
        return;
      }
      state.formVolumes.push({ ml, price: Number(price) });
      $("#newVolumePrice").value = "";
      renderVolumesEditor();
    });

    // ===== COULEURS DISPONIBLES (colorOptions — vêtements, électronique...) =====
    function renderColorOptionsEditor() {
      const box = $("#colorOptionsEditor");
      if (!box) return;
      if (state.formColorOptions.length === 0) {
        box.innerHTML = `<p class="muted" style="font-size:12px;">Aucune couleur ajoutée.</p>`;
        return;
      }
      box.innerHTML = state.formColorOptions.map((color, idx) => `
        <span class="color-chip">
          <span class="color-chip-dot" style="background:${colorNameToHex(color)};"></span>
          ${safeText(color)}
          <button type="button" class="color-chip-remove" data-idx="${idx}" title="Retirer"></button>
        </span>
      `).join("");
      box.querySelectorAll(".color-chip-remove").forEach((btn) => btn.addEventListener("click", () => {
        state.formColorOptions.splice(Number(btn.dataset.idx), 1);
        renderColorOptionsEditor();
      }));
    }

    $("#addColorOptionBtn")?.addEventListener("click", () => {
      const color = $("#productColorWrap select")?.value || "";
      if (!color) { alert("Choisissez une couleur (ou ajoutez-en une avec le bouton +)."); return; }
      if (state.formColorOptions.some((c) => c.toLowerCase() === color.toLowerCase())) {
        alert("Cette couleur est déjà dans la liste.");
        return;
      }
      state.formColorOptions.push(color);
      renderColorOptionsEditor();
    });

    function resetProductForm() {
      $("#productForm").reset();
      $("#productId").value = "";
      $("#productFormTitle").textContent = "Ajouter un produit";
      state.formGallery = [];
      state.formVolumes = [];
      state.formColorOptions = [];
      selectedGalleryFiles = [];
      if ($("#productIsActive")) $("#productIsActive").checked = true;
      renderAttributeSelect($("#productCategoryWrap"), "category", "", applyCategoryFieldVisibility);
      applyCategoryFieldVisibility("");
      renderAttributeSelect($("#productBrandWrap"), "brand", "");
      renderAttributeSelect($("#productConditionWrap"), "condition", "Neuf");
      renderAttributeSelect($("#productColorWrap"), "color", "");
      renderAttributeSelect($("#productRamWrap"), "ram", "");
      renderAttributeSelect($("#productRomWrap"), "rom", "");
      refreshNewVolumeField();
      renderGalleryPreview();
      renderVolumesEditor();
      renderColorOptionsEditor();
    }

    async function saveProduct(e) {
      e.preventDefault();
      const submitBtn = $("#productForm button[type='submit']");
      const id = $("#productId").value || uid("prod");
      const vendorId = $("#productVendor").value;
      const vendor = state.vendors.find(v => v.id === vendorId) || { id: "", name: "", logo: "" };
      let imageUrl = normalizeImageUrl($("#productImage").value.trim());
      const fileInput = document.getElementById("productImageFile");
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = `${icon('loader-circle','spin')} Envoi des images...`; }

      if (fileInput && fileInput.files.length > 0) {
        const uploadedUrl = await uploadFileToBucket("images", fileInput.files[0]);
        if (uploadedUrl) imageUrl = uploadedUrl;
      }

      // Upload des images secondaires nouvellement sélectionnées, puis fusion
      // avec celles déjà conservées (state.formGallery), plafonné à 5.
      let gallery = [...state.formGallery];
      for (const file of selectedGalleryFiles) {
        const url = await uploadFileToBucket("images", file);
        if (url) gallery.push(url);
      }
      gallery = gallery.slice(0, 5);

      const product = {
        id,
        name: $("#productName").value.trim(),
        description: $("#productDescription").value.trim(),
        imageUrl,
        imageGallery: gallery,
        price: Number($("#productPrice").value),
        compareAtPrice: $("#productCompareAtPrice").value ? Number($("#productCompareAtPrice").value) : null,
        stock: Number($("#productStock").value),
        category: $("#productCategoryWrap select")?.value || "",
        vendorId: vendor.id || "",
        vendorName: vendor.name || $("#productVendor").selectedOptions[0]?.text || "",
        vendorLogo: vendor.logo || "",
        brand: $("#productBrandWrap select")?.value || "",
        condition: $("#productConditionWrap select")?.value || "Neuf",
        color: state.formColorOptions[0] || "",
        colorOptions: state.formColorOptions,
        ram: $("#productRamWrap select")?.value || "",
        rom: $("#productRomWrap select")?.value || "",
        priceByVolume: state.formVolumes,
        isActive: $("#productIsActive")?.checked !== false,
        createdAt: state.products.find((p) => p.id === id)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (!product.category) {
        alert("Merci de choisir (ou ajouter) une catégorie pour ce produit.");
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `${icon('save')} Enregistrer`; }
        return;
      }
      state.products = state.products.some((item) => item.id === id) ? state.products.map((item) => item.id === id ? product : item) : [product, ...state.products];
      await writeStore("products", state.products);

      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `${icon('save')} Enregistrer`; }
      await logAudit("Produit sauvegardé", `ID: ${id}, Nom: ${product.name}`);
      resetProductForm(); renderAll();
    }

    // VENDORS CRUD + RENDER
    function renderVendorOptions() {
      const sel = $("#productVendor");
      if (!sel) return;
      sel.innerHTML = `<option value="">-- Aucune --</option>` + state.vendors.map(v => `<option value="${v.id}">${safeText(v.name)}</option>`).join("");
    }

    function renderVendorsTable() {
      const el = $("#vendorsTable");
      if (!el) return;
      // Comptes en attente de validation affichés en premier
      const sorted = [...state.vendors].sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0));
      const statusPill = (v) => {
        const s = v.status || "active";
        const map = { pending: ["En attente", "pending"], active: ["Actif", "validated"], suspended: ["Suspendu", "cancelled"] };
        const [label, cls] = map[s] || map.active;
        return `<span class="status-pill ${cls}">${label}</span>`;
      };
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Logo</th><th>Boutique</th><th>Contact</th><th>Statut</th><th>Commission</th><th>Ventes validées</th><th>Solde dû</th><th>Actions</th></tr></thead><tbody>${sorted.map(v => {
        const totalSales = state.orders.filter((o) => hasOrderVendor(o, v.id) && isRevenueOrder(o.status)).reduce((sum, o) => sum + getOrderVendorTotal(o, v.id), 0);
        const due = Number(v.dueBalance || 0);
        const productCount = state.products.filter(p => p.vendorId === v.id).length;
        const self = v.id === "vendor-ma-boutique";
        const statusActions = self ? "" : v.status === "pending"
          ? `<button class="btn-soft" type="button" data-approve-vendor="${v.id}" title="Approuver le compte">${icon('circle-check')} Approuver</button> <button class="btn-danger" type="button" data-suspend-vendor="${v.id}" title="Refuser / suspendre">${icon('ban')}</button>`
          : v.status === "suspended"
          ? `<button class="btn-soft" type="button" data-approve-vendor="${v.id}" title="Réactiver">${icon('rotate-ccw')} Réactiver</button>`
          : `<button class="btn-soft" type="button" data-suspend-vendor="${v.id}" title="Suspendre l'accès au portail">${icon('ban')}</button>`;
        return `<tr><td>${v.logo ? `<img class="thumb" src="${safeText(v.logo)}">` : ""}</td><td><strong>${safeText(v.name)}</strong><br><span class="muted">${safeText(v.ownerName || "")}${productCount ? ` · ${productCount} produit(s)` : ""}</span></td><td>${safeText(v.phone)}<br><span class="muted">${safeText(v.email || "")}</span></td><td>${statusPill(v)}</td><td>${Number(v.commission ?? state.settings.globalCommission)}%</td><td>${money(totalSales)}</td><td>${money(due)}</td><td>${statusActions} <button class="btn-soft" type="button" data-edit-vendor="${v.id}">${icon('pencil')}</button> ${self ? "" : `<button class="btn-soft" type="button" data-reset-due="${v.id}" title="Soldé">${icon('rotate-ccw')}</button>`} ${self ? "" : `<button class="btn-danger" type="button" data-delete-vendor="${v.id}">${icon('trash-2')}</button>`}</td></tr>`;
      }).join("") || `<tr><td colspan="8">Aucun vendeur.</td></tr>`}</tbody></table></div>`;
    }

    async function saveVendor(e) {
      e.preventDefault();
      const submitBtn = $("#vendorForm button[type='submit']");
      const id = $("#vendorId").value || uid("vend");
      let logo = normalizeImageUrl($("#vendorLogo").value.trim());
      const logoFileInput = document.getElementById("vendorLogoFile");
      if (logoFileInput && logoFileInput.files.length > 0) {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = `${icon('loader-circle','spin')} Envoi du logo...`; }
        const uploadedUrl = await uploadFileToBucket("images", logoFileInput.files[0]);
        if (uploadedUrl) logo = uploadedUrl;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `${icon('save')} Enregistrer`; }
      }
      const existing = state.vendors.find(v => v.id === id);
      const vendor = {
        ...(existing || {}),
        id,
        name: $("#vendorName").value.trim(),
        phone: $("#vendorPhone").value.trim(),
        email: $("#vendorEmail").value.trim().toLowerCase(),
        address: $("#vendorAddress").value.trim(),
        logo,
        commission: Number($("#vendorCommission").value),
        paymentMethod: $("#vendorPaymentMethod").value,
        paymentDetails: $("#vendorPaymentDetails").value.trim(),
        status: existing?.status || "active",
        dueBalance: existing?.dueBalance || 0,
        createdAt: existing?.createdAt || new Date().toISOString()
      };
      state.vendors = state.vendors.some(v => v.id === id) ? state.vendors.map(v => v.id === id ? vendor : v) : [vendor, ...state.vendors];
      await writeStore("vendors", state.vendors);
      await logAudit("Vendeur sauvegardé", `ID: ${id}, Nom: ${vendor.name}`);
      resetVendorForm(); renderAll();
    }

    function resetVendorForm() { if ($("#vendorForm")) { $("#vendorForm").reset(); $("#vendorId").value = ""; } }

    function renderVendorsFinancial() {
      const el = $("#vendorsFinancial"); if (!el) return;
      const validated = state.orders.filter(o => isRevenueOrder(o.status));
      const vendorStats = state.vendors.map(v => {
        const sales = validated.filter((o) => hasOrderVendor(o, v.id)).reduce((sum, o) => sum + getOrderVendorTotal(o, v.id), 0);
        return { vendor: v, sales, due: Number(v.dueBalance || 0) };
      });
      let html = `<div class="table-wrap"><table><thead><tr><th>Vendeur</th><th>Ventes validées</th><th>Solde dû</th></tr></thead><tbody>`;
      vendorStats.forEach(item => {
        html += `<tr><td><strong>${safeText(item.vendor.name)}</strong></td><td>${money(item.sales)}</td><td>${money(item.due)}</td></tr>`;
      });
      html += `</tbody></table></div>`;
      el.innerHTML = html;
    }

    // Event listeners
    document.addEventListener("click", async (event) => {
      const target = event.target.closest("button"); if (!target) return;

      if (target.matches("[data-close-modal]")) {
        closeModal();
        return;
      }

      if (target.matches("[data-view]")) {
        state.view = target.dataset.view;
        $$(".admin-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === state.view));
        $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${state.view}View`));
        $("#viewTitle").textContent = target.textContent.trim();
        logAudit("Vue changée", state.view);
      }

      if (target.matches("[data-payment-type]")) { 
        state.paymentType = target.dataset.paymentType; 
        $$(".sub-tab").forEach(t => t.classList.toggle("active", t.dataset.paymentType === state.paymentType)); 
        renderPaymentFields(); 
      }

      if (target.matches("#logoutAdmin")) { 
        if (!confirm("Déconnecter l'administrateur ?")) return;
        localStorage.removeItem(STORAGE.adminSession); 
        logAudit("Déconnexion", "Admin s'est déconnecté");
        showLogin(); 
      }

      if (target.matches("#resetProductForm")) resetProductForm();

      if (target.matches("#addNumber")) {
        const name = prompt(`Nom du destinataire (${state.paymentType.toUpperCase()}):`);
        if (!name) return;
        const num = prompt(`Numéro ${state.paymentType.toUpperCase()} pour ${name}:`);
        if (!num) return;
        state.payments[state.paymentType].numbers = state.payments[state.paymentType].numbers || [];
        state.payments[state.paymentType].numbers.push({ name: name.trim(), number: num.trim() });
        await writeStore("payments", state.payments);
        renderPaymentFields();
        await logAudit("Destinataire ajouté", `Type: ${state.paymentType}, Nom: ${name.trim()}, Numéro: ${num.trim()}`);
      }

      if (target.matches("[data-remove-number]")) {
        const idx = Number(target.dataset.removeNumber);
        const removed = state.payments[state.paymentType].numbers[idx];
        state.payments[state.paymentType].numbers.splice(idx, 1);
        await writeStore("payments", state.payments);
        await logAudit("Destinataire supprimé", `Type: ${state.paymentType}, Nom: ${removed?.name || ''}, Numéro: ${removed?.number || ''}`);
        renderPaymentFields();
      }

      // ===== Méthodes de paiement personnalisées =====
      if (target.matches("#addCustomMethod")) {
        const name = $("#customMethodName")?.value.trim();
        if (!name) { alert("Donnez un nom à la méthode (ex: Lajan Cash)."); return; }
        target.disabled = true;
        target.innerHTML = `${icon('loader-circle','spin')} Ajout...`;
        let logoUrl = normalizeImageUrl($("#customMethodLogo")?.value.trim() || "");
        const logoFile = $("#customMethodLogoFile");
        if (logoFile && logoFile.files.length > 0) {
          const uploaded = await uploadFileToBucket("images", logoFile.files[0]);
          if (uploaded) logoUrl = uploaded;
        }
        state.payments.custom = state.payments.custom || [];
        state.payments.custom.push({
          id: uid("paym"),
          name,
          logoUrl,
          instructions: $("#customMethodInstructions")?.value.trim() || "",
          enabled: true
        });
        await writeStore("payments", state.payments);
        await logAudit("Méthode de paiement ajoutée", `Nom: ${name}`);
        target.disabled = false;
        renderPaymentFields();
      }

      if (target.matches("[data-remove-custom]")) {
        const idx = Number(target.dataset.removeCustom);
        const removed = state.payments.custom?.[idx];
        if (!confirm(`Supprimer la méthode "${removed?.name || ''}" ?`)) return;
        state.payments.custom.splice(idx, 1);
        await writeStore("payments", state.payments);
        await logAudit("Méthode de paiement supprimée", `Nom: ${removed?.name || ''}`);
        renderPaymentFields();
      }

      if (target.matches("[data-toggle-custom]")) {
        const idx = Number(target.dataset.toggleCustom);
        const m = state.payments.custom?.[idx];
        if (!m) return;
        m.enabled = m.enabled === false;
        await writeStore("payments", state.payments);
        renderPaymentFields();
      }

      // Vérification en direct d'un paiement MonCash (Bazik)
      if (target.matches("[data-verify-payment]")) {
        const orderId = target.dataset.verifyPayment;
        target.disabled = true;
        target.innerHTML = `${icon('loader-circle','spin')} Vérification...`;
        try {
          const res = await fetch(PAYMENT_VERIFY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "apikey": SUPABASE_ANON_KEY },
            body: JSON.stringify({ orderId })
          });
          const data = await res.json();
          const order = state.orders.find((o) => o.id === orderId);
          if (order && data.paymentStatus) order.paymentStatus = data.paymentStatus;
          alert(data.paymentStatus === "succeeded" ? `Paiement confirmé pour ${orderId}.` : `Statut paiement : ${data.paymentStatus || "inconnu"}`);
          renderOrders();
          renderStats();
        } catch {
          alert("Vérification impossible pour le moment.");
          target.disabled = false;
          target.innerHTML = `${icon('refresh-cw')} Vérifier paiement`;
        }
      }

      if (target.matches("[data-copy-number]")) {
        const idx = Number(target.dataset.copyNumber);
        const receiver = state.payments[state.paymentType].numbers[idx];
        if (receiver) copyToClipboard(receiver.number || receiver);
      }

      if (target.matches("[data-edit-product]")) {
        const product = state.products.find((item) => item.id === target.dataset.editProduct);
        if (!product) return;
        $("#productId").value = product.id;
        $("#productName").value = product.name;
        $("#productPrice").value = product.price;
        $("#productCompareAtPrice").value = product.compareAtPrice || "";
        $("#productStock").value = product.stock;
        $("#productImage").value = product.imageUrl;
        $("#productDescription").value = product.description;
        // set vendor select if available
        if ($("#productVendor")) {
          $("#productVendor").value = product.vendorId || "";
        }
        if ($("#productIsActive")) $("#productIsActive").checked = product.isActive !== false;
        renderAttributeSelect($("#productCategoryWrap"), "category", product.category || "", applyCategoryFieldVisibility);
        applyCategoryFieldVisibility(product.category || "");
        renderAttributeSelect($("#productBrandWrap"), "brand", product.brand || "");
        renderAttributeSelect($("#productConditionWrap"), "condition", product.condition || "Neuf");
        renderAttributeSelect($("#productColorWrap"), "color", "");
        renderAttributeSelect($("#productRamWrap"), "ram", product.ram || "");
        renderAttributeSelect($("#productRomWrap"), "rom", product.rom || "");
        refreshNewVolumeField();
        state.formGallery = Array.isArray(product.imageGallery) ? [...product.imageGallery] : [];
        selectedGalleryFiles = [];
        renderGalleryPreview();
        state.formVolumes = Array.isArray(product.priceByVolume) ? product.priceByVolume.map((v) => ({ ...v })) : [];
        renderVolumesEditor();
        // Reprend colorOptions ; à défaut, récupère l'ancien champ "color"
        // unique (produits enregistrés avant l'ajout de cette liste).
        state.formColorOptions = Array.isArray(product.colorOptions) && product.colorOptions.length
          ? [...product.colorOptions]
          : (product.color ? [product.color] : []);
        renderColorOptionsEditor();
        $("#productFormTitle").textContent = "Modifier un produit";
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      if (target.matches("[data-delete-product]") && confirm("Supprimer ce produit ?")) {
        const id = target.dataset.deleteProduct;
        const product = state.products.find(p => p.id === id);
        state.products = state.products.filter((item) => item.id !== id); 
        await deleteRows("products", id);
        await logAudit("Produit supprimé", `ID: ${id}, Nom: ${product?.name}`);
        renderAll();
      }

      if (target.matches("[data-delete-order]") && confirm("Supprimer cette commande ?")) {
        const id = target.dataset.deleteOrder;
        state.orders = state.orders.filter((order) => order.id !== id); 
        await deleteRows("orders", id);
        await logAudit("Commande supprimée", `ID: ${id}`);
        renderAll();
      }

      if (target.matches("[data-view-order]")) {
        const order = state.orders.find(o => o.id === target.dataset.viewOrder);
        if (!order) return;
        const itemsList = order.items.map((i) => `<li>${safeText(i.name)}${i.variantLabel ? ' (' + safeText(i.variantLabel) + ')' : ''} x${i.quantity} — ${money(i.price * i.quantity)}</li>`).join("");
        $("#orderDetailContent").innerHTML = `
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div><span class="muted">Commande</span><br><strong>${safeText(order.id)}</strong></div>
            <div><span class="muted">Client</span><br><strong>${safeText(order.customerName)}</strong>${order.customerUsername ? ` (@${safeText(order.customerUsername)})` : ""}<br>${safeText(order.customerPhone)}</div>
            <div><span class="muted">Adresse de livraison</span><br><strong>${safeText(order.address) || "<em>Non renseignée</em>"}</strong></div>
            <div><span class="muted">Téléphone de réception</span><br><strong>${safeText(order.receptionPhone) || safeText(order.customerPhone)}</strong></div>
            <div><span class="muted">Notes additionnelles du client</span><br><strong>${order.notes ? safeText(order.notes) : "<em>Aucune note</em>"}</strong></div>
            <div><span class="muted">Articles</span><ul style="margin:6px 0 0 18px;">${itemsList}</ul></div>
            <div><span class="muted">Total</span><br><strong>${money(order.total)}</strong></div>
          </div>
        `;
        openModal("#orderDetailModal");
      }

      if (target.matches("[data-view-proof]")) {
        const order = state.orders.find(o => o.id === target.dataset.viewProof);
        if (order?.proofUrl) {
          $("#proofContent").innerHTML = `<img src="${order.proofUrl}" class="proof-img" alt="Preuve ${order.id}"><p class="muted">Commande: <strong>${safeText(order.id)}</strong><br>Client: <strong>${safeText(order.customerName)}</strong><br>Montant: <strong>${money(order.total)}</strong></p>`;
          openModal("#proofModal");
          logAudit("Preuve affichée", `Commande: ${order.id}`);
        }
      }

      if (target.matches("[data-validate-order]")) {
        const order = state.orders.find(o => o.id === target.dataset.validateOrder);
        if (!order) return;
        order.status = "Validée";
        order.updatedAt = new Date().toISOString();
        applyOrderDue(order);
        await writeStore("vendors", state.vendors);
        await writeStore("orders", state.orders);
        await logAudit("Commande validée", `ID: ${order.id}, Client: ${order.customerName}`);
        renderAll();
      }

      if (target.matches("[data-edit-vendor]")) {
        const vendor = state.vendors.find(v => v.id === target.dataset.editVendor);
        if (!vendor) return;
        $("#vendorId").value = vendor.id;
        $("#vendorName").value = vendor.name;
        $("#vendorPhone").value = vendor.phone;
        $("#vendorEmail").value = vendor.email || "";
        $("#vendorAddress").value = vendor.address || "";
        $("#vendorLogo").value = vendor.logo;
        $("#vendorCommission").value = vendor.commission ?? state.settings.globalCommission;
        $("#vendorPaymentMethod").value = vendor.paymentMethod || "MonCash";
        $("#vendorPaymentDetails").value = vendor.paymentDetails || "";
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      // Appréciation / suspension d'un compte vendeur (portail vendor.html)
      if (target.matches("[data-approve-vendor]")) {
        const vendor = state.vendors.find(v => v.id === target.dataset.approveVendor);
        if (!vendor) return;
        vendor.status = "active";
        await writeStore("vendors", state.vendors);
        await logAudit("Compte vendeur approuvé", `Vendeur: ${vendor.name}`);
        renderAll();
      }

      if (target.matches("[data-suspend-vendor]")) {
        const vendor = state.vendors.find(v => v.id === target.dataset.suspendVendor);
        if (!vendor) return;
        if (!confirm(`Suspendre le compte vendeur "${vendor.name}" ? Ses produits resteront en ligne mais il ne pourra plus se connecter.`)) return;
        vendor.status = "suspended";
        await writeStore("vendors", state.vendors);
        await logAudit("Compte vendeur suspendu", `Vendeur: ${vendor.name}`);
        renderAll();
      }

      if (target.matches("[data-reset-due]") && confirm("Marquer ce solde dû comme payé et réinitialiser le compteur ?")) {
        const vendor = state.vendors.find(v => v.id === target.dataset.resetDue);
        if (!vendor) return;
        vendor.dueBalance = 0;
        await writeStore("vendors", state.vendors);
        await logAudit("Solde dû réinitialisé", `Vendeur: ${vendor.name}`);
        renderAll();
      }

      if (target.matches("[data-delete-vendor]") && confirm("Supprimer ce vendeur, tous ses produits et commandes associées ?")) {
        const vendorId = target.dataset.deleteVendor;
        if (vendorId === "vendor-ma-boutique") {
          alert("Impossible de supprimer le vendeur par défaut.");
          return;
        }
        const productIdsToDelete = state.products.filter(p => p.vendorId === vendorId).map(p => p.id);
        const orderIdsToDelete = state.orders.filter(o => hasOrderVendor(o, vendorId)).map(o => o.id);
        state.vendors = state.vendors.filter(v => v.id !== vendorId);
        state.products = state.products.filter(p => p.vendorId !== vendorId);
        state.orders = state.orders.filter(o => !hasOrderVendor(o, vendorId));
        await deleteRows("products", productIdsToDelete);
        await deleteRows("orders", orderIdsToDelete);
        await deleteRows("vendors", vendorId);
        await logAudit("Vendeur supprimé", `ID: ${vendorId}, Produits supprimés: ${productIdsToDelete.length}, Commandes supprimées: ${orderIdsToDelete.length}`);
        renderAll();
      }

      if (target.matches("[data-reset-password]")) {
        const customer = state.customers.find(c => c.id === target.dataset.resetPassword);
        if (!customer) return;
        const newPassword = prompt("Entrez le nouveau mot de passe temporaire pour ce client :");
        if (!newPassword) return;
        sha256(newPassword).then(async (hash) => {
          customer.passwordHash = hash;
          await writeStore("customers", state.customers);
          alert(`Mot de passe réinitialisé pour ${customer.name}`);
          await logAudit("Mot de passe client réinitialisé", `Client: ${customer.name}, Téléphone: ${customer.phone}`);
          renderAll();
        });
      }

      if (target.matches("[data-send-reset-email]")) {
        const customer = state.customers.find(c => c.id === target.dataset.sendResetEmail);
        if (!customer || !customer.email || !supabase) return;
        const btn = target;
        btn.disabled = true;
        const redirectTo = window.location.origin + "/index.html?recovery=1";
        const { error } = await supabase.auth.resetPasswordForEmail(customer.email, { redirectTo });
        btn.disabled = false;
        if (error) {
          console.error("Erreur envoi email de réinitialisation:", error);
          alert("Échec de l'envoi du lien. Réessayez dans quelques instants.");
          return;
        }
        alert(`Lien de réinitialisation envoyé à ${customer.email}.`);
        await logAudit("Lien de réinitialisation envoyé", `Client: ${customer.name}, Email: ${customer.email}`);
      }

      if (target.matches("[data-delete-customer]") && confirm("Supprimer ce client et toutes ses commandes ?")) {
        const customerId = target.dataset.deleteCustomer;
        const orderIdsToDelete = state.orders.filter(o => o.customerId === customerId).map(o => o.id);
        state.customers = state.customers.filter(c => c.id !== customerId);
        state.orders = state.orders.filter(o => o.customerId !== customerId);
        await deleteRows("orders", orderIdsToDelete);
        await deleteRows("customers", customerId);
        await logAudit("Client supprimé", `ID: ${customerId}`);
        renderAll();
      }

      if (target.matches("[data-whatsapp]")) {
        const order = state.orders.find(o => o.id === target.dataset.whatsapp);
        if (!order) return;
        const vendorNames = [...new Set((order.items || []).map((item) => item.vendorName || state.vendors.find((v) => v.id === item.vendorId)?.name || "MarketHaiti"))].filter(Boolean);
        const items = order.items.map(i => `• ${i.name} (x${i.quantity})`).join("\n");
        const baseVendor = vendorNames.length > 1 ? "Plusieurs vendeurs" : vendorNames[0] || "MarketHaiti";
        const isPending = normalizeStatus(order.status) === "en attente";
        const msg = isPending
          ? `Bonjour ${order.customerName}, nous avons bien reçu votre commande ${order.id}. Nous vérifions actuellement votre paiement et reviendrons vers vous rapidement.\n\n*Détails:*\n${items}\n\n*Montant:* ${money(order.total)}\n*Vendeur:* ${baseVendor}\n\nMerci de votre patience !`
          : `Bonjour ${order.customerName}, votre commande ${order.id} a été validée.\n\n*Détails:*\n${items}\n\n*Total:* ${money(order.total)}\n*Vendeur:* ${baseVendor}\n\nLivraison à: ${order.address}\nTél: ${order.receptionPhone}\n\nNous arrangerons les détails de livraison avec vous. Merci !`;
        const rawPhone = order.customerPhone || order.receptionPhone || "";
        let customerPhone = rawPhone.replace(/\D/g, "");
        if (!customerPhone) {
          alert("Numéro de téléphone du client introuvable pour cette commande.");
          return;
        }
        if (customerPhone.length === 8) customerPhone = `509${customerPhone}`;
        const whatsappLink = `https://wa.me/${customerPhone}?text=${encodeURIComponent(msg)}`;
        window.open(whatsappLink, "_blank");
        await logAudit("Message WhatsApp envoyé", `Commande: ${order.id}, Client: ${order.customerName}, Statut: ${order.status}`);
      }

      if (target.matches("#exportData") || target.matches("#exportFinancial")) exportFinancialExcel();
    });

    document.addEventListener("change", async (event) => {
      const target = event.target;
      if (target.matches("[data-order-status]")) {
        const order = state.orders.find(o => o.id === target.dataset.orderStatus);
        const oldStatus = order.status;
        order.status = target.value;
        order.updatedAt = new Date().toISOString();
        
        // Calcul automatique des commissions quand Livrée (si non encore appliqué)
        if (target.value === "Livrée" && oldStatus !== "Livrée") {
          applyOrderDue(order);
          await writeStore("vendors", state.vendors);
          await logAudit("Solde vendeur mis à jour (livraison)", `Commande: ${order.id}, Commission calculée`);
        }
        
        await writeStore("orders", state.orders);
        await logAudit("Statut commande changé", `ID: ${order.id}, ${oldStatus} → ${target.value}`);
        renderAll();
      }
    });

    $("#productForm").addEventListener("submit", saveProduct);

    $("#vendorForm").addEventListener("submit", saveVendor);

    $("#paymentForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const type = state.paymentType;
      if (type === "custom") return; // les méthodes personnalisées se sauvegardent à l'ajout

      const submitBtn = $("#paymentForm button[type='submit']");
      const cfg = state.payments[type] || {};

      // Logo : URL saisie ou fichier importé (upload → bucket "images")
      let logoUrl = normalizeImageUrl($("#paymentLogoUrl")?.value.trim() || cfg.logoUrl || "");
      const logoFile = $("#paymentLogoFile");
      if (logoFile && logoFile.files.length > 0) {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = `${icon('loader-circle','spin')} Envoi du logo...`; }
        const uploaded = await uploadFileToBucket("images", logoFile.files[0]);
        if (uploaded) logoUrl = uploaded;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `${icon('save')} Enregistrer`; }
      }
      cfg.logoUrl = logoUrl;
      cfg.enabled = $("#methodEnabledToggle") ? $("#methodEnabledToggle").checked : cfg.enabled !== false;
      cfg.instructions = $("#paymentInstructions")?.value.trim() || "";
      state.payments[type] = cfg;

      if (type === "natcash") {
        // Compte à créditer : champ présent seulement en mode manuel (NatCash)
        state.payments[type].account = $("#paymentAccount")?.value.trim() || "";
      } else if (type === "bank") {
        state.payments.bank = {
          ...state.payments.bank,
          bankName: $("#bankName").value.trim(),
          accountHolder: $("#accountHolder").value.trim(),
          accountNumber: $("#bankAccount").value.trim()
        };
      }
      await writeStore("payments", state.payments);
      await logAudit("Paramètres de paiement enregistrés", `Type: ${type}`);
      alert("Paramètres de paiement enregistrés !");
      renderPaymentFields();
    });

    $("#settingsForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      state.settings.storeName = $("#storeName").value.trim();
      state.settings.storeLogoUrl = normalizeImageUrl($("#storeLogoUrl").value.trim());
      state.settings.brandColor = $("#brandColor").value;
      state.settings.globalCommission = Number($("#globalCommission").value);
      state.announcements.message = $("#announcementText").value.trim();
      state.announcements.textColor = $("#announcementTextColor").value || DEFAULT_ANNOUNCEMENTS.textColor;
      state.announcements.active = !!$("#announcementActive").checked;
      await writeStore("settings", state.settings);
      await writeStore("announcements", state.announcements);
      await logAudit("Paramètres globaux enregistrés", `Commission: ${state.settings.globalCommission}%`);
      await logAudit("Annonce enregistrée", `Actif: ${state.announcements.active}`);
      alert("Paramètres enregistrés !");
      renderAll();
    });

    // Logo file import handler
    $("#storeLogoFile").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const uploadedUrl = await uploadFileToBucket("images", f);
      if (!uploadedUrl) {
        alert("Échec de l'envoi du logo. Veuillez réessayer.");
        return;
      }
      state.settings.storeLogoUrl = uploadedUrl;
      $("#storeLogoUrl").value = uploadedUrl;
      await writeStore("settings", state.settings);
      await logAudit("Logo importé depuis la galerie", f.name);
      if ($("#storeLogoPreview")) $("#storeLogoPreview").src = uploadedUrl;
      renderAll();
    });

    $("#brandColor").addEventListener("input", (e) => {
      $("#brandColorDisplay").textContent = e.target.value;
    });

    // Conversion automatique des liens Google Drive partagés dès qu'on quitte le champ
    bindDriveLinkNormalizer("productImage");
    bindDriveLinkNormalizer("productGalleryUrl");
    bindDriveLinkNormalizer("vendorLogo");
    bindDriveLinkNormalizer("storeLogoUrl");

    async function initializeApp() {
      await supabaseReady;
      await seedData();
      showApp();
      resetProductForm();
      renderPaymentFields();
      setupRealtimeListeners();
    }
    
    initializeApp().catch(err => console.error("Initialization error:", err));
  