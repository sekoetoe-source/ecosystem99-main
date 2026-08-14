import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { amount, name, email, mobile } = await req.json();
    const mayarApiKey = Deno.env.get("MAYAR_SECRET_KEY");

    if (!mayarApiKey) {
      throw new Error("MAYAR_SECRET_KEY belum dikonfigurasi di Supabase environment.");
    }

    if (!amount || amount < 1000) {
      throw new Error("Minimal nominal traktir adalah Rp1.000");
    }

    // Panggil API Mayar untuk membuat invoice/link pembayaran (Headless API)
    const response = await fetch("https://api.mayar.id/hl/v1/invoice/create", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${mayarApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name || "Donatur Kopi",
        email: email || "donatur@smpn99.sch.id",
        amount: Number(amount),
        mobile: mobile || "081234567890",
        description: "Dukungan operasional program budaya ramah lingkungan sekolah.",
        redirectURL: "https://smpn99.sch.id", // Tautan pengalihan sukses
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Gagal membuat tautan pembayaran di Mayar.");
    }

    return new Response(JSON.stringify(data), {
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
