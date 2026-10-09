// =====================================================================
// MarketHaiti — Espace Vendeur (vendor.html)
// Chaque vendeur se connecte avec son email/téléphone + mot de passe,
// publie ses propres produits, suit ses ventes et son solde dû.
// La commission est gérée côté admin (par vendeur ou globale) — le vendeur
// voit sa part calculée en direct mais ne peut pas la modifier.
// =====================================================================

window.addEventListener("DOMContentLoaded", () => {
  (async () => {
    hydrateIcons();

    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.MH;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    const money = (amt) => `${Number(amt || 0).toLocaleString("fr-HT")} HTG`;
    const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const safeText = (val) => String(val ?? "");
    const STORAGE = { vendorSession: "mh_vendor_session_v1" };

    async function sha256(val) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(val));
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    // Liens Google Drive partagés → lien direct utilisable dans <img>
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
      return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000` : url;
    }

    async function uploadFileToBucket(bucket, file) {
      if (!supabase || !file) return "";
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "3600", upsert: false });
        if (error) { console.error("Erreur upload:", error); return ""; }
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data?.publicUrl || "";
      } catch (err) { console.error(err); return ""; }
    }

    const state = { vendor: null, products: [], orders: [], settings: {}, categories: [], view: "dashboard" };

    async function readTable(table) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) { console.error(`Lecture ${table}:`, error); return []; }
      return data || [];
    }

    async function loadData() {
      const [products, orders, settingsRows, optionRows] = await Promise.all([
        readTable("products"), readTable("orders"), readTable("settings"), readTable("product_options")
      ]);
      state.products = products.filter((p) => p.vendorId === state.vendor.id);
      state.orders = orders;
      state.settings = settingsRows?.[0] || {};
      state.categories = (optionRows || []).filter((o) => o.group === "category").map((o) => o.value);
    }

    const STATUS_LABELS = { pending: "En attente de validation", active: "Actif", suspended: "Suspendu" };
    const statusPillClass = (s) => s === "active" ? "validated" : s === "suspended" ? "suspended" : "pending";
    const myItems = (order) => (order.items || []).filter((i) => i.vendorId === state.vendor.id);
    const myOrders = () => state.orders.filter((o) => myItems(o).length > 0);
    const myOrderTotal = (order) => myItems(order).reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
    const myRate = () => Number((state.vendor.commission ?? state.settings.globalCommission) || 0);

    // ===== VUES =====
    function switchView(view) {
      state.view = view;
      $$(".admin-tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
      $$(".view").forEach((v) => v.classList.toggle("active", v.id === `${view}View`));
      const titles = {
        dashboard: ["Tableau de bord", "Aperçu de votre activité de vente."],
        products: ["Mes produits", "Ajoutez et gérez vos articles en vente."],
        sales: ["Mes ventes", "Historique de vos commandes et montants."],
        account: ["Mon compte", "Informations de votre boutique et moyen de paiement."]
      };
      const [title, sub] = titles[view] || [view, ""];
      $("#viewTitle").textContent = title;
      $("#viewSubtitle").textContent = sub;
      renderView();
    }

    async function renderView() {
      if (state.view === "sales" || state.view === "dashboard") {
        state.orders = await readTable("orders"); // relecture fraîche à l'ouverture
      }
      if (state.view === "dashboard") renderDashboard();
      if (state.view === "products") renderProductsTable();
      if (state.view === "sales") renderSalesTable();
      if (state.view === "account") fillAccountForm();
    }

    function renderDashboard() {
      const orders = myOrders();
      const revenue = orders.reduce((s, o) => s + myOrderTotal(o), 0);
      $("#statProducts").textContent = state.products.filter((p) => p.isActive !== false).length;
      $("#statSales").textContent = orders.length;
      $("#statRevenue").textContent = money(revenue);
      $("#statDue").textContent = money(state.vendor.dueBalance || 0);
      const recent = orders.slice().reverse().slice(0, 6);
      $("#recentSales").innerHTML = recent.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Commande</th><th>Articles</th><th>Votre part</th><th>Statut</th><th>Date</th></tr></thead>
        <tbody>${recent.map((o) => `
          <tr>
            <td><strong>${safeText(o.id)}</strong></td>
            <td>${myItems(o).map((i) => `${safeText(i.name)} x${i.quantity}`).join(", ")}</td>
            <td>${money(myOrderTotal(o) * myRate() / 100)}</td>
            <td><span class="status-pill ${o.status === "Livrée" ? "delivered" : o.status === "Validée" ? "validated" : o.status === "Annulée" ? "cancelled" : "pending"}">${safeText(o.status)}</span></td>
            <td>${new Date(o.createdAt).toLocaleDateString("fr-FR")}</td>
          </tr>`).join("")}
        </tbody></table></div>` : `<div class="panel-body"><p class="muted">Aucune vente pour le moment — vos commandes apparaîtront ici.</p></div>`;
    }

    function renderProductsTable() {
      $("#vendorProductsTable").innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Image</th><th>Produit</th><th>Prix</th><th>Stock</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${state.products.map((p) => `
          <tr>
            <td>${p.imageUrl ? `<img class="thumb" src="${safeText(p.imageUrl)}" alt="">` : `<span class="thumb" style="display:grid;place-items:center;background:var(--bg);">${icon('image')}</span>`}</td>
            <td><strong>${safeText(p.name)}</strong><br><span class="muted">${safeText(p.category || "")}</span></td>
            <td>${money(p.price)}${p.compareAtPrice ? `<br><span class="muted" style="text-decoration:line-through;">${money(p.compareAtPrice)}</span>` : ""}</td>
            <td>${Number(p.stock)}</td>
            <td><span class="status-pill ${p.isActive !== false ? "validated" : "cancelled"}">${p.isActive !== false ? "En ligne" : "Masqué"}</span></td>
            <td>
              <button class="btn-soft" type="button" data-edit-product="${p.id}" title="Modifier">${icon('pencil')}</button>
              <button class="btn-soft" type="button" data-toggle-product="${p.id}" title="Afficher / masquer">${icon(p.isActive !== false ? 'eye' : 'eye-off')}</button>
              <button class="btn-danger" type="button" data-delete-product="${p.id}" title="Supprimer">${icon('trash-2')}</button>
            </td>
          </tr>`).join("") || `<tr><td colspan="6">Aucun produit — utilisez le formulaire ci-dessus pour en ajouter un.</td></tr>`}
        </tbody></table></div>`;
    }

    function renderSalesTable() {
      const orders = myOrders().slice().reverse();
      $("#vendorSalesTable").innerHTML = orders.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Commande</th><th>Articles</th><th>Montant</th><th>Votre part (${myRate()}%)</th><th>Statut</th><th>Date</th></tr></thead>
        <tbody>${orders.map((o) => `
          <tr>
            <td><strong>${safeText(o.id)}</strong></td>
            <td>${myItems(o).map((i) => `${safeText(i.name)} x${i.quantity}`).join(", ")}</td>
            <td>${money(myOrderTotal(o))}</td>
            <td>${money(myOrderTotal(o) * myRate() / 100)}</td>
            <td><span class="status-pill ${o.status === "Livrée" ? "delivered" : o.status === "Validée" ? "validated" : o.status === "Annulée" ? "cancelled" : "pending"}">${safeText(o.status)}</span></td>
            <td>${new Date(o.createdAt).toLocaleDateString("fr-FR")}</td>
          </tr>`).join("")}
        </tbody></table></div>` : `<div class="panel-body"><p class="muted">Aucune vente enregistrée pour le moment.</p></div>`;
    }

    function fillAccountForm() {
      const v = state.vendor;
      $("#vendorName").value = v.name || "";
      $("#vendorOwnerName").value = v.ownerName || "";
      $("#vendorPhone").value = v.phone || "";
      $("#vendorEmail").value = v.email || "";
      $("#vendorAddress").value = v.address || "";
      $("#vendorLogoUrl").value = v.logo || "";
      $("#vendorPaymentMethod").value = v.paymentMethod || "MonCash";
      $("#vendorPaymentDetails").value = v.paymentDetails || "";
      $("#newPassword").value = "";
    }

    function resetProductForm() {
      $("#productForm").reset();
      $("#productId").value = "";
      $("#productIsActive").checked = true;
      $("#productFormTitle").textContent = "Ajouter un produit";
    }

    function fillProductForm(p) {
      $("#productId").value = p.id;
      $("#productName").value = p.name || "";
      $("#productPrice").value = p.price ?? "";
      $("#productCompareAtPrice").value = p.compareAtPrice ?? "";
      $("#productStock").value = p.stock ?? 0;
      $("#productCategory").value = p.category || "";
      $("#productDescription").value = p.description || "";
      $("#productImage").value = p.imageUrl || "";
      $("#productIsActive").checked = p.isActive !== false;
      $("#productFormTitle").textContent = "Modifier le produit";
      $("#productForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // ===== ÉVÉNEMENTS =====
    document.addEventListener("click", async (event) => {
      const target = event.target.closest("button");
      if (!target) return;

      if (target.matches(".admin-tab")) switchView(target.dataset.view);

      if (target.matches("#logoutVendor")) {
        localStorage.removeItem(STORAGE.vendorSession);
        location.reload();
      }

      if (target.matches("#resetProductForm")) resetProductForm();

      if (target.matches("[data-edit-product]")) {
        const p = state.products.find((x) => x.id === target.dataset.editProduct);
        if (p) fillProductForm(p);
      }

      if (target.matches("[data-toggle-product]")) {
        const p = state.products.find((x) => x.id === target.dataset.toggleProduct);
        if (!p) return;
        p.isActive = p.isActive === false;
        await supabase.from("products").upsert([p], { onConflict: "id" });
        renderProductsTable();
      }

      if (target.matches("[data-delete-product]")) {
        const p = state.products.find((x) => x.id === target.dataset.deleteProduct);
        if (!p || !confirm(`Supprimer "${p.name}" ?`)) return;
        const { error } = await supabase.from("products").delete().eq("id", p.id);
        if (error) { alert("Impossible de supprimer ce produit."); return; }
        state.products = state.products.filter((x) => x.id !== p.id);
        renderProductsTable();
      }
    });

    // --- Connexion ---
    $("#vendorLoginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const cred = $("#loginCredential").value.trim().toLowerCase();
      const password = $("#loginPassword").value;
      const btn = e.target.querySelector("button[type='submit']");
      btn.disabled = true; btn.innerHTML = `${icon('loader-circle','spin')} Connexion...`;
      $("#loginError").textContent = "";

      const vendors = await readTable("vendors");
      const vendor = vendors.find((v) => (v.email || "").toLowerCase() === cred || v.phone === cred);
      const hash = await sha256(password);

      if (!vendor || !vendor.passwordHash || vendor.passwordHash !== hash) {
        $("#loginError").textContent = "Identifiants incorrects. Vérifiez votre email/téléphone et mot de passe.";
      } else if (vendor.status === "pending") {
        $("#loginError").textContent = "Votre compte est en attente de validation par l'équipe MarketHaiti.";
      } else if (vendor.status === "suspended") {
        $("#loginError").textContent = "Ce compte a été suspendu. Contactez le support.";
      } else {
        localStorage.setItem(STORAGE.vendorSession, vendor.id);
        showApp(vendor);
        return;
      }
      btn.disabled = false; btn.innerHTML = `${icon('log-in')} Connexion`;
    });

    // --- Produit ---
    function populateCategories() {
      const sel = $("#productCategory");
      const cats = state.categories.length ? state.categories : ["Électronique & Tech", "Mode Femme", "Mode Homme", "Maison & Décoration", "Alimentation & Épicerie", "Beauté & Cosmétiques", "Autre"];
      sel.innerHTML = `<option value="">-- Choisir --</option>` + cats.map((c) => `<option value="${safeText(c)}">${safeText(c)}</option>`).join("");
    }

    $("#productForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type='submit']");
      btn.disabled = true; btn.innerHTML = `${icon('loader-circle','spin')} Enregistrement...`;

      const id = $("#productId").value || uid("prod");
      const existing = state.products.find((p) => p.id === id);
      let imageUrl = normalizeImageUrl($("#productImage").value.trim());
      const fileInput = $("#productImageFile");
      if (fileInput.files.length > 0) {
        const uploaded = await uploadFileToBucket("images", fileInput.files[0]);
        if (uploaded) imageUrl = uploaded;
      }
      const gallery = [...(existing?.imageGallery || [])];
      const galleryInput = $("#productGalleryFiles");
      if (galleryInput.files.length > 0) {
        for (const f of Array.from(galleryInput.files).slice(0, 5)) {
          const up = await uploadFileToBucket("images", f);
          if (up) gallery.push(up);
        }
      }

      const product = {
        ...(existing || {}),
        id,
        name: $("#productName").value.trim(),
        price: Number($("#productPrice").value),
        compareAtPrice: $("#productCompareAtPrice").value === "" ? null : Number($("#productCompareAtPrice").value),
        stock: Number($("#productStock").value),
        category: $("#productCategory").value,
        description: $("#productDescription").value.trim(),
        imageUrl,
        imageGallery: gallery,
        isActive: $("#productIsActive").checked,
        vendorId: state.vendor.id,
        vendorName: state.vendor.name,
        vendorLogo: state.vendor.logo || "",
        createdAt: existing?.createdAt || new Date().toISOString()
      };

      const { error } = await supabase.from("products").upsert([product], { onConflict: "id" });
      btn.disabled = false; btn.innerHTML = `${icon('save')} Enregistrer`;
      if (error) { alert("Erreur lors de l'enregistrement du produit."); console.error(error); return; }
      if (!existing) state.products.push(product); else Object.assign(existing, product);
      resetProductForm();
      renderProductsTable();
    });

    // --- Compte ---
    $("#accountForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type='submit']");
      btn.disabled = true; btn.innerHTML = `${icon('loader-circle','spin')} Enregistrement...`;

      let logo = normalizeImageUrl($("#vendorLogoUrl").value.trim());
      const logoFile = $("#vendorLogoFile");
      if (logoFile.files.length > 0) {
        const uploaded = await uploadFileToBucket("images", logoFile.files[0]);
        if (uploaded) logo = uploaded;
      }

      const v = state.vendor;
      Object.assign(v, {
        name: $("#vendorName").value.trim(),
        ownerName: $("#vendorOwnerName").value.trim(),
        phone: $("#vendorPhone").value.trim(),
        email: $("#vendorEmail").value.trim(),
        address: $("#vendorAddress").value.trim(),
        logo,
        paymentMethod: $("#vendorPaymentMethod").value,
        paymentDetails: $("#vendorPaymentDetails").value.trim()
      });

      const newPassword = $("#newPassword").value;
      if (newPassword) v.passwordHash = await sha256(newPassword);

      const { error } = await supabase.from("vendors").upsert([v], { onConflict: "id" });
      btn.disabled = false; btn.innerHTML = `${icon('save')} Enregistrer`;
      if (error) { alert("Erreur lors de l'enregistrement."); console.error(error); return; }

      // Propage le nom/logo de la boutique sur ses produits (affichés côté client)
      state.products.forEach((p) => { p.vendorName = v.name; p.vendorLogo = v.logo || ""; });
      if (state.products.length) await supabase.from("products").upsert(state.products, { onConflict: "id" });
      $("#vendorBrandName").textContent = v.name;
      if (logo) { $("#vendorBrandLogo").src = logo; $("#vendorBrandLogo").style.display = "block"; }
      alert("Informations enregistrées !");
    });

    // ===== DÉMARRAGE =====
    function showApp(vendor) {
      state.vendor = vendor;
      $("#vendorLogin").style.display = "none";
      $("#vendorShell").style.display = "";
      $("#vendorBrandName").textContent = vendor.name;
      const pill = $("#vendorStatusPill");
      pill.textContent = STATUS_LABELS[vendor.status] || vendor.status;
      pill.className = `status-pill ${statusPillClass(vendor.status)}`;
      if (vendor.logo) { $("#vendorBrandLogo").src = vendor.logo; $("#vendorBrandLogo").style.display = "block"; }
      loadData().then(() => { populateCategories(); renderDashboard(); });
    }

    const savedId = localStorage.getItem(STORAGE.vendorSession);
    if (savedId) {
      const vendors = await readTable("vendors");
      const vendor = vendors.find((v) => v.id === savedId);
      if (vendor && vendor.status === "active") { showApp(vendor); return; }
      localStorage.removeItem(STORAGE.vendorSession);
    }
    $("#vendorLogin").style.display = "grid";
  })();
});
