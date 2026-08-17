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
    const { invoiceId, status } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase environment variables look missing.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const updateStatus = status === "success" || status === "paid" ? "success" : "failed";

    if (invoiceId) {
      const { data, error } = await supabase
        .from("traktir_transactions")
        .update({ status: updateStatus, updated_at: new Date().toISOString() })
        .eq("mayar_invoice_id", invoiceId)
        .select()
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error updating transaction status:", error);
      }

      return new Response(JSON.stringify({ success: true, transaction: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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
