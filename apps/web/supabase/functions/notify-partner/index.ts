import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);
    const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    const { listId, type, itemTitle = "your shared list" } = await request.json();
    const { data: membership } = await admin.from("list_members").select("list_id").eq("list_id", listId).eq("user_id", user.id).maybeSingle();
    if (!membership) return Response.json({ error: "Not a list member" }, { status: 403, headers: corsHeaders });
    const { data: sender } = await admin.from("profiles").select("display_name").eq("id", user.id).single();
    const { data: members } = await admin.from("list_members").select("user_id").eq("list_id", listId).neq("user_id", user.id);
    const partnerIds = (members ?? []).map((member) => member.user_id);
    const { data: subscriptions } = partnerIds.length
      ? await admin.from("push_subscriptions").select("id,subscription").eq("list_id", listId).in("user_id", partnerIds)
      : { data: [] };
    const copy: Record<string, [string, string]> = {
      vote: ["Your turn", `${sender?.display_name ?? "Your person"} made a pick. A match might be waiting.`],
      tonight: ["Tonight mode", `${sender?.display_name ?? "Your person"} added their vibe.`],
      nudge: ["One more look?", `${sender?.display_name ?? "Your person"} wants to reconsider ${itemTitle}.`],
      plan: ["A plan is waiting", `${sender?.display_name ?? "Your person"} suggested a time for ${itemTitle}.`],
      confirm: ["Plan confirmed", `${sender?.display_name ?? "Your person"} confirmed ${itemTitle}.`],
      complete: ["Memory made", `${itemTitle} was marked complete.`],
      rating: ["Rate it together", `${sender?.display_name ?? "Your person"} left a private rating.`],
      wildcard: ["Wildcard used", `${sender?.display_name ?? "Your person"} chose ${itemTitle}.`],
      reaction: ["A pick is waiting", `${sender?.display_name ?? "Your person"} reacted to ${itemTitle}.`],
      memory: ["A memory was added", `${sender?.display_name ?? "Your person"} saved a moment from ${itemTitle}.`],
      challenge: ["New pair challenge", `${sender?.display_name ?? "Your person"} started something new for both of you.`],
      nomination: ["A secret choice is in", `${sender?.display_name ?? "Your person"} locked in their nomination.`],
    };
    const [title, body] = copy[type] ?? ["ReelTogether", `${sender?.display_name ?? "Your person"} updated your shared list.`];
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@reeltogether.app",
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );
    await Promise.all((subscriptions ?? []).map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, JSON.stringify({ title, body, url: "/reeltogether/" }));
      } catch (error) {
        if ([404, 410].includes((error as { statusCode?: number }).statusCode ?? 0))
          await admin.from("push_subscriptions").delete().eq("id", row.id);
      }
    }));
    return Response.json({ sent: subscriptions?.length ?? 0 }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Notification failed" }, { status: 500, headers: corsHeaders });
  }
});
