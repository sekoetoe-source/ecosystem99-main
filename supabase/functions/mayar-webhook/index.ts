import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Received Mayar Webhook Event:", payload);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase environment variables missing.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const eventType = payload?.event || payload?.type || "payment.received";
    const data = payload?.data || payload;

    const invoiceId = data?.id || data?.invoiceId || data?.invoice_id || data?.paymentId;
    const amount = Number(data?.amount || data?.totalAmount || data?.netAmount || 0);
    const donorName = data?.name || data?.customerName || data?.customer?.name || "Donatur Kopi";
    const donorEmail = data?.email || data?.customerEmail || data?.customer?.email || null;
    const donorMobile = data?.mobile || data?.customerMobile || data?.customer?.mobile || null;
    const paymentMethod = data?.paymentMethod || data?.channel || "Mayar PG";
    const rawStatus = (data?.status || "success").toLowerCase();
    const status = rawStatus === "paid" || rawStatus === "success" ? "success" : "pending";

    if (invoiceId && amount >= 1000) {
      const { error } = await supabase
        .from("traktir_transactions")
        .upsert(
          {
            mayar_invoice_id: invoiceId,
            donor_name: donorName,
            donor_email: donorEmail,
            donor_mobile: donorMobile,
            amount: amount,
            payment_method: paymentMethod,
            status: status,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "mayar_invoice_id" }
        );

      if (error) {
        console.error("Webhook database upsert error:", error);
      }
    }

    return new Response(JSON.stringify({ success: true, event: eventType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
