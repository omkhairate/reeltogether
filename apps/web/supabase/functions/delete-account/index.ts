import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Sign in is required.");
    const body = await request.json().catch(() => ({}));
    if (body.confirmation !== "DELETE") throw new Error("Deletion was not confirmed.");

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) throw new Error("Your session expired. Sign in again before deleting the account.");
    const userId = authData.user.id;

    // Preserve every two-person space: ownership passes to the remaining
    // member before the profile/auth cascade removes this account.
    const { data: owned, error: ownedError } = await admin
      .from("shared_lists")
      .select("id")
      .eq("owner_id", userId);
    if (ownedError) throw ownedError;
    for (const list of owned ?? []) {
      const { data: partner, error: partnerError } = await admin
        .from("list_members")
        .select("user_id")
        .eq("list_id", list.id)
        .neq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (partnerError) throw partnerError;
      if (partner?.user_id) {
        const { error } = await admin
          .from("shared_lists")
          .update({ owner_id: partner.user_id })
          .eq("id", list.id);
        if (error) throw error;
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (reason) {
    return new Response(JSON.stringify({ error: reason instanceof Error ? reason.message : "Could not delete account." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
