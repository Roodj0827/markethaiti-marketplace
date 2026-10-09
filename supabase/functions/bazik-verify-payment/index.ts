// =========================================================================
// Edge Function : bazik-verify-payment
// Vérifie EN DIRECT le statut d'un paiement auprès de Bazik
// (GET https://api.bazik.io/order/{orderId}) puis met à jour la commande.
//
// 2 modes :
//   POST {orderId}  → vérifie une commande précise (retour client, bouton
//                     "Vérifier le paiement" du compte client / admin)
//   POST {}         → mode SWEEP : vérifie toutes les commandes Bazik encore
//                     "pending" (jusqu'à 50) — appelé par le cron job Supabase
//                     (migrations/004_payment_cron.sql) toutes les 2 min, pour
//                     couvrir les clients qui paient puis quittent sans jamais
//                     revenir sur la boutique.
//
// Secrets requis : BAZIK_USER_ID, BAZIK_SECRET_KEY (mêmes que create-payment)
// =========================================================================

const BAZIK_BASE_URL = "https://api.bazik.io";
const SWEEP_LIMIT = 50;
// On ignore les commandes créées depuis moins de 90s : le client est peut-être
// encore en train de payer sur la page MonCash à cet instant.
const SWEEP_MIN_AGE_MS = 90 * 1000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function bazikToken(userID: string, secretKey: string): Promise<string> {
  const res = await fetch(`${BAZIK_BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userID, secretKey }),
  });
  const data = await res.json().catch(() => ({}));
  // Bazik renvoie le JWT dans "token" (certains environnements utilisent "access_token")
  const token = data.token || data.access_token;
  if (!res.ok || !token) {
    throw new Error(data?.error || data?.message || `Authentification Bazik échouée (${res.status})`);
  }
  return token;
}

// Normalise les statuts possibles renvoyés par l'API Bazik / MonCash.
function mapStatus(raw: string | undefined): "succeeded" | "failed" | "pending" {
  const s = (raw || "").toLowerCase();
  if (["success", "succeeded", "completed", "complete", "paid", "approved", "successful"].includes(s)) return "succeeded";
  if (["failed", "failure", "cancelled", "canceled", "expired", "declined", "rejected"].includes(s)) return "failed";
  return "pending";
}

// Vérifie une commande auprès de Bazik et met à jour orders.paymentStatus.
async function verifyOrder(order: { id: string; paymentRef: string; paymentStatus: string }, token: string, supabaseUrl: string, serviceKey: string) {
  const checkRes = await fetch(`${BAZIK_BASE_URL}/order/${encodeURIComponent(order.paymentRef)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const checkData = await checkRes.json().catch(() => ({}));

  const rawStatus =
    checkData?.data?.status ||
    checkData?.data?.transaction?.status ||
    checkData?.status ||
    checkData?.paymentStatus ||
    (checkData?.success === true ? "success" : undefined);
  const paymentStatus = mapStatus(rawStatus);

  if (paymentStatus !== order.paymentStatus) {
    await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ paymentStatus, updatedAt: new Date().toISOString() }),
    });
  }
  return paymentStatus;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const orderId = body?.orderId || null;

    const BAZIK_USER_ID = Deno.env.get("BAZIK_USER_ID") || "";
    const BAZIK_SECRET_KEY = Deno.env.get("BAZIK_SECRET_KEY") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!BAZIK_USER_ID || !BAZIK_SECRET_KEY) {
      return json({ error: "Vérification non configurée (secrets Bazik manquants)." }, 500);
    }

    const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
    const token = await bazikToken(BAZIK_USER_ID, BAZIK_SECRET_KEY);

    // ===== Mode SWEEP : aucune commande précise → on balaye les pending =====
    if (!orderId) {
      const cutoff = new Date(Date.now() - SWEEP_MIN_AGE_MS).toISOString();
      const listRes = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?paymentProvider=eq.bazik&paymentStatus=eq.pending&paymentRef=not.is.null&createdAt=lt.${encodeURIComponent(cutoff)}&select=id,paymentRef,paymentStatus&limit=${SWEEP_LIMIT}`,
        { headers }
      );
      const pendingOrders = await listRes.json().catch(() => []);
      const results: Record<string, string> = {};
      for (const o of Array.isArray(pendingOrders) ? pendingOrders : []) {
        try { results[o.id] = await verifyOrder(o, token, SUPABASE_URL, SERVICE_KEY); }
        catch { results[o.id] = "error"; }
      }
      return json({ sweep: true, checked: Object.keys(results).length, results });
    }

    // ===== Mode ciblé : une commande =====
    const orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,status,paymentStatus,paymentRef,paymentMethod`,
      { headers }
    );
    const orders = await orderRes.json();
    const order = orders?.[0];
    if (!order) return json({ error: "Commande introuvable" }, 404);
    if (order.paymentStatus === "succeeded") return json({ paymentStatus: "succeeded" });
    if (!order.paymentRef) return json({ paymentStatus: order.paymentStatus || "pending", note: "pas de référence Bazik" });

    const paymentStatus = await verifyOrder(order, token, SUPABASE_URL, SERVICE_KEY);
    return json({ paymentStatus, bazikOrderId: order.paymentRef });
  } catch (err) {
    return json({ error: (err as Error).message || "Erreur interne" }, 500);
  }
});
