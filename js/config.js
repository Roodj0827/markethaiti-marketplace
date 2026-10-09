// =========================================================================
// MarketHaiti — Configuration partagée (boutique + admin)
// Les clés sensibles Bazik (userID / secretKey) ne vivent PAS ici :
// elles sont stockées comme secrets Supabase et utilisées uniquement par
// les Edge Functions dans supabase/functions/ (jamais côté client).
// =========================================================================
(function () {
  "use strict";

  window.MH = {
    SUPABASE_URL: "https://ishbmvzuwdygepwhduug.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzaGJtdnp1d2R5Z2Vwd2hkdXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDc1MzQsImV4cCI6MjA5NjcyMzUzNH0.VRmc4tJei93sO2cD7OFYCSaPRjMS8lt3hL5vXp145EY",
  };

  // Paiement automatisé via Bazik (MonCash / NatCash) — Edge Functions Supabase.
  MH.PAYMENT_CREATE_URL = MH.SUPABASE_URL + "/functions/v1/bazik-create-payment";
  MH.PAYMENT_VERIFY_URL = MH.SUPABASE_URL + "/functions/v1/bazik-verify-payment";
})();
