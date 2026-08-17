import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { amount, name, email, mobile, redirectUrl } = await req.json();
    const mayarApiKey = Deno.env.get("MAYAR_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!mayarApiKey) {
      throw new Error("MAYAR_SECRET_KEY belum dikonfigurasi di Supabase environment.");
    }

    if (!amount || Number(amount) < 1000) {
      throw new Error("Minimal nominal traktir adalah Rp1.000");
    }

    const donorName = name || "Donatur Kopi";
    const donorEmail = email || "donatur@smpn99.sch.id";
    const donorMobile = mobile || "081234567890";
    const targetRedirectUrl = redirectUrl || "https://ecosystem99.web.id/#kopi";
    const expirationMs = 15 * 60 * 1000; // 15 minutes
    const expiredAtDate = new Date(Date.now() + expirationMs).toISOString();

    // Call Mayar Headless API to create invoice with 15 minutes limit (900 seconds)
    const response = await fetch("https://api.mayar.id/hl/v1/invoice/create", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${mayarApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: donorName,
        email: donorEmail,
        mobile: donorMobile,
        description: "Dukungan operasional program budaya ramah lingkungan sekolah.",
        redirectUrl: targetRedirectUrl,
        redirectURL: targetRedirectUrl,
        redirect_url: targetRedirectUrl,
        successRedirectUrl: targetRedirectUrl,
        callbackUrl: targetRedirectUrl,
        expiredIn: 900,
        expiredAt: expiredAtDate,
        items: [
          {
            quantity: 1,
            rate: Number(amount),
            description: "Traktir Kopi - School Ecosystem (Batas Waktu 15 Min)"
          }
        ]
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Mayar API error response:", data);
      throw new Error(
        data.messages || 
        data.message || 
        (typeof data.error === "string" ? data.error : JSON.stringify(data.error)) || 
        "Gagal membuat tautan pembayaran di Mayar."
      );
    }

    const linkUrl = data?.data?.link || data?.link || data?.data?.payUrl || data?.payUrl;
    const invoiceId = data?.data?.id || data?.id || data?.data?.invoiceId || data?.invoiceId;

    // Save transaction record to DB if Supabase keys are present
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase.from("traktir_transactions").insert({
          mayar_invoice_id: invoiceId || `MYR-${Date.now()}`,
          donor_name: donorName,
          donor_email: donorEmail,
          donor_mobile: donorMobile,
          amount: Number(amount),
          payment_method: "Mayar PG",
          status: "pending",
          pay_url: linkUrl,
          expired_at: expiredAtDate,
        });
      } catch (dbErr) {
        console.error("Failed to log traktir_transaction to DB:", dbErr);
      }
    }

    return new Response(
      JSON.stringify({
        ...data,
        linkUrl,
        invoiceId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
