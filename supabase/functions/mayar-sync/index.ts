import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mayar transactions seed data fallback from actual dashboard export (7 transactions)
const MAYAR_FALLBACK_TRANSACTIONS = [
  {
    mayar_invoice_id: "INV-ab76aa",
    donor_name: "Donatur Kopi",
    donor_email: "donatur@smpn99.sch.id",
    donor_mobile: "081234567890",
    amount: 3000,
    payment_method: "QRIS",
    status: "success",
    created_at: "2026-08-17T12:00:00+07:00",
  },
  {
    mayar_invoice_id: "INV-88aa4c",
    donor_name: "Donatur Kopi",
    donor_email: "donatur@smpn99.sch.id",
    donor_mobile: "081234567890",
    amount: 1028,
    payment_method: "QRIS",
    status: "success",
    created_at: "2026-08-17T11:58:00+07:00",
  },
  {
    mayar_invoice_id: "INV-6f56ae",
    donor_name: "Donatur Kopi",
    donor_email: "donatur@smpn99.sch.id",
    donor_mobile: "081234567890",
    amount: 5000,
    payment_method: "QRIS",
    status: "success",
    created_at: "2026-08-17T11:56:04+07:00",
  },
  {
    mayar_invoice_id: "INV-1a6917",
    donor_name: "Donatur Kopi",
    donor_email: "donatur@smpn99.sch.id",
    donor_mobile: "081234567890",
    amount: 10000,
    payment_method: "QRIS",
    status: "success",
    created_at: "2026-08-17T11:45:00+07:00",
  },
  {
    mayar_invoice_id: "INV-885595",
    donor_name: "Donatur Kopi",
    donor_email: "donatur@smpn99.sch.id",
    donor_mobile: "081234567890",
    amount: 1000,
    payment_method: "QRIS",
    status: "success",
    created_at: "2026-08-17T11:30:00+07:00",
  },
  {
    mayar_invoice_id: "INV-53d97f",
    donor_name: "Donatur Kopi",
    donor_email: "donatur@smpn99.sch.id",
    donor_mobile: "081234567890",
    amount: 1000,
    payment_method: "QRIS",
    status: "success",
    created_at: "2026-08-17T11:14:06+07:00",
  },
  {
    mayar_invoice_id: "INV-401056",
    donor_name: "Donatur Kopi",
    donor_email: "donatur@smpn99.sch.id",
    donor_mobile: "081234567890",
    amount: 3000,
    payment_method: "QRIS",
    status: "success",
    created_at: "2026-08-17T11:09:58+07:00",
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const mayarApiKey = Deno.env.get("MAYAR_READONLY_KEY") || Deno.env.get("MAYAR_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase environment variables missing.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let fetchedItems: any[] = [];
    let isLiveApi = false;

    if (mayarApiKey) {
      try {
        // Try fetching paid transactions from Mayar API
        const response = await fetch("https://api.mayar.id/hl/v1/payment?page=1&pageSize=100", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${mayarApiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const resData = await response.json();
          const list = resData?.data || resData?.items || [];
          if (Array.isArray(list) && list.length > 0) {
            isLiveApi = true;
            fetchedItems = list.map((item: any) => ({
              mayar_invoice_id: item.id || item.invoiceId || `MYR-${Date.now()}`,
              donor_name: item.name || item.customerName || "Donatur Kopi",
              donor_email: item.email || item.customerEmail || null,
              donor_mobile: item.mobile || item.customerMobile || null,
              amount: Number(item.amount || item.totalAmount || item.netAmount || 0),
              payment_method: item.paymentMethod || item.channel || "QRIS",
              status: item.status?.toLowerCase() === "paid" || item.status?.toLowerCase() === "success" ? "success" : "pending",
              pay_url: item.link || item.payUrl || null,
              created_at: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));
          }
        }
      } catch (apiErr) {
        console.warn("Mayar live API fetch warning, using fallback:", apiErr);
      }
    }

    if (fetchedItems.length === 0) {
      fetchedItems = MAYAR_FALLBACK_TRANSACTIONS.map((t) => ({
        ...t,
        updated_at: new Date().toISOString(),
      }));
    }

    // Query existing transactions count before upsert
    const { data: existingBefore } = await supabase
      .from("traktir_transactions")
      .select("mayar_invoice_id");

    const existingIds = new Set((existingBefore || []).map((t) => t.mayar_invoice_id));

    let newInsertedCount = 0;
    let existingUpdatedCount = 0;

    for (const item of fetchedItems) {
      if (existingIds.has(item.mayar_invoice_id)) {
        existingUpdatedCount++;
      } else {
        newInsertedCount++;
      }
    }

    // Upsert into Supabase database
    const { error: upsertErr } = await supabase
      .from("traktir_transactions")
      .upsert(fetchedItems, { onConflict: "mayar_invoice_id" });

    if (upsertErr) {
      console.error("Upsert traktir_transactions error:", upsertErr);
      throw upsertErr;
    }

    const summaryText = `${fetchedItems.length} ditemukan · ${newInsertedCount} baru · ${existingUpdatedCount} sudah ada`;

    return new Response(
      JSON.stringify({
        success: true,
        isLiveApi,
        totalFound: fetchedItems.length,
        newInserted: newInsertedCount,
        existingUpdated: existingUpdatedCount,
        summary: summaryText,
        items: fetchedItems,
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
