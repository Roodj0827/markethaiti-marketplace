// =========================================================================
// Edge Function : bazik-create-payment
// Crée un paiement MonCash via l'API Bazik (https://api.bazik.io) et renvoie
// l'URL de redirection hébergée. Appelée depuis la boutique au checkout.
//
// Secrets requis (supabase secrets set ...) :
//   BAZIK_USER_ID     — ex: bzk_c5b754a0_1757383229 (sandbox ou production)
//   BAZIK_SECRET_KEY  — ex: sk_5b0ff521b331c73db55313dc82f17cab
// Le couple de credentials choisit automatiquement l'environnement
// (sandbox ou production) — aucune autre config n'est nécessaire.
// =========================================================================

const BAZIK_BASE_URL = "https://api.bazik.io";
const MAX_HTG = 75000; // limite documentée par transaction Bazik

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { orderId } = await req.json();
    if (!orderId) return json({ error: "orderId manquant" }, 400);

    const BAZIK_USER_ID = Deno.env.get("BAZIK_USER_ID") || "";
    const BAZIK_SECRET_KEY = Deno.env.get("BAZIK_SECRET_KEY") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!BAZIK_USER_ID || !BAZIK_SECRET_KEY) {
      return json({ error: "Paiement automatique non configuré (BAZIK_USER_ID / BAZIK_SECRET_KEY manquants)." }, 500);
    }

    // 1. Relit la commande en base — on ne fait jamais confiance au montant
    //    envoyé par le client, le total vient de la table orders.
    const orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,total,status,paymentStatus`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const orders = await orderRes.json();
    const order = orders?.[0];
    if (!order) return json({ error: "Commande introuvable" }, 404);
    if (order.paymentStatus === "succeeded") return json({ error: "Cette commande est déjà payée." }, 409);

    const amount = Math.round(Number(order.total));
    if (!amount || amount <= 0) return json({ error: "Montant de commande invalide" }, 400);
    if (amount > MAX_HTG) {
      return json({ error: `Montant supérieur au maximum MonCash (${MAX_HTG} HTG). Choisissez une autre méthode.` }, 400);
    }

    // 2. Token Bazik
    const token = await bazikToken(BAZIK_USER_ID, BAZIK_SECRET_KEY);

    // 3. Création du paiement MonCash — referenceId = id de notre commande
    const payRes = await fetch(`${BAZIK_BASE_URL}/moncash/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        gdes: amount,
        description: `MarketHaiti — commande ${orderId}`,
        referenceId: orderId,
      }),
    });
    const payData = await payRes.json().catch(() => ({}));
    const redirectUrl = payData?.data?.redirectUrl || payData?.redirectUrl;
    const bazikOrderId = payData?.data?.orderId || payData?.orderId;
    if (!payRes.ok || !redirectUrl) {
      return json({ error: payData?.error || payData?.message || "Bazik n'a pas retourné de lien de paiement." }, 502);
    }

    // 4. Mémorise la référence Bazik pour la vérification ultérieure
    await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        paymentProvider: "bazik",
        paymentRef: bazikOrderId || "",
        paymentStatus: "pending",
      }),
    });

    return json({ payment_url: redirectUrl, bazikOrderId });
  } catch (err) {
    return json({ error: (err as Error).message || "Erreur interne" }, 500);
  }
});
