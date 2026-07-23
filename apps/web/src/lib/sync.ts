import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  defaultFilters,
  type ContentMode,
  type DiscoveryFilters,
  type Member,
  type MediaItem,
  type ActivityItem,
  type PairEvent,
  type PairEventType,
  type SessionSnapshot,
  type SharedList,
  type Vote,
} from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const cloudConfigured = Boolean(supabaseUrl && supabaseKey);
const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(supabaseUrl!, supabaseKey!)
  : null;

export type CloudIdentity = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
};

function requireCloud() {
  if (!supabase) throw new Error("Shared syncing has not been configured yet.");
  return supabase;
}

function listFromRow(row: Record<string, unknown>): SharedList {
  return {
    id: String(row.id),
    inviteCode: String(row.invite_code),
    name: String(row.name),
    threshold: Number(row.threshold),
    contentMode: row.content_mode as ContentMode,
    filters: {
      ...defaultFilters,
      ...((row.filters as Partial<DiscoveryFilters>) ?? {}),
    },
  };
}

export async function ensureCloudUser(displayName: string): Promise<Member> {
  const client = requireCloud();
  let { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    sessionData = { session: data.session };
  }
  const id = sessionData.session?.user.id;
  if (!id) throw new Error("Could not create your account.");
  const cleanName = displayName.trim().slice(0, 40);
  const { error } = await client
    .from("profiles")
    .upsert({ id, display_name: cleanName });
  if (error) throw error;
  return { id, displayName: cleanName };
}

export async function getCloudIdentity(): Promise<CloudIdentity | null> {
  const client = requireCloud();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    isAnonymous: user.is_anonymous ?? !user.email,
  };
}

export async function restoreCloudAccount(): Promise<SessionSnapshot | null> {
  const client = requireCloud();
  const identity = await getCloudIdentity();
  if (!identity) return null;
  const [
    { data: profile, error: profileError },
    { data: memberships, error: membershipError },
  ] = await Promise.all([
    client
      .from("profiles")
      .select("display_name")
      .eq("id", identity.id)
      .maybeSingle(),
    client
      .from("list_members")
      .select("list_id,joined_at")
      .eq("user_id", identity.id)
      .order("joined_at", { ascending: false })
      .limit(1),
  ]);
  if (profileError) throw profileError;
  if (membershipError) throw membershipError;
  const listId = memberships?.[0]?.list_id;
  if (!profile || !listId) return null;
  const user = { id: identity.id, displayName: String(profile.display_name) };
  return loadCloudSnapshot(user, String(listId));
}

export async function secureCloudAccount(email: string, redirectTo: string) {
  const client = requireCloud();
  const identity = await getCloudIdentity();
  if (!identity?.isAnonymous)
    throw new Error("This account is already secured.");
  const { error } = await client.auth.updateUser(
    { email: email.trim().toLowerCase() },
    { emailRedirectTo: redirectTo },
  );
  if (error) throw error;
}

export async function sendCloudSignInLink(email: string, redirectTo: string) {
  const client = requireCloud();
  const { error } = await client.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });
  if (error) throw error;
}

export async function sendCloudSignUpLink(email: string, redirectTo: string) {
  const client = requireCloud();
  const { error } = await client.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function signOutCloudAccount() {
  const client = requireCloud();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function createCloudList(
  user: Member,
  name: string,
  filters: DiscoveryFilters = defaultFilters,
): Promise<string> {
  const client = requireCloud();
  const id = crypto.randomUUID();
  const inviteCode = crypto.randomUUID();
  const { error: listError } = await client.from("shared_lists").insert({
    id,
    invite_code: inviteCode,
    name: name.trim().slice(0, 60),
    threshold: 2,
    content_mode: "mixed",
    filters,
    owner_id: user.id,
  });
  if (listError) throw listError;
  const { error: memberError } = await client
    .from("list_members")
    .insert({ list_id: id, user_id: user.id });
  if (memberError) throw memberError;
  return id;
}

export async function joinCloudList(inviteCode: string): Promise<string> {
  const client = requireCloud();
  const { data, error } = await client.rpc("join_list_by_invite", {
    code: inviteCode,
  });
  if (error) throw error;
  if (!data) throw new Error("That invite link is no longer valid.");
  return String(data);
}

export async function loadCloudSnapshot(
  user: Member,
  listId: string,
): Promise<SessionSnapshot> {
  const client = requireCloud();
  const [
    { data: listRow, error: listError },
    { data: memberRows, error: memberError },
    { data: voteRows, error: voteError },
    { data: eventRows, error: eventError },
    { data: itemRows, error: itemError },
  ] = await Promise.all([
    client.from("shared_lists").select("*").eq("id", listId).single(),
    client
      .from("list_members")
      .select("user_id, profiles(display_name)")
      .eq("list_id", listId),
    client
      .from("votes")
      .select("user_id,item_id,kind,decision")
      .eq("list_id", listId),
    client
      .from("pair_events")
      .select("id,user_id,event_type,item_id,kind,payload,updated_at")
      .eq("list_id", listId),
    client
      .from("list_items")
      .select("data")
      .eq("list_id", listId),
  ]);
  if (listError) throw listError;
  if (memberError) throw memberError;
  if (voteError) throw voteError;
  if (eventError) throw eventError;
  if (itemError) throw itemError;
  const members: Member[] = (memberRows ?? []).map((row) => {
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;
    return {
      id: String(row.user_id),
      displayName: String(
        (profile as { display_name?: string } | null)?.display_name ?? "Friend",
      ),
    };
  });
  const votes: Vote[] = (voteRows ?? []).map((row) => ({
    userId: String(row.user_id),
    itemId: String(row.item_id),
    kind: row.kind as Vote["kind"],
    decision: row.decision as Vote["decision"],
  }));
  const events: PairEvent[] = (eventRows ?? []).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    type: row.event_type as PairEventType,
    itemId: String(row.item_id),
    kind: row.kind as PairEvent["kind"],
    payload: (row.payload ?? {}) as PairEvent["payload"],
    updatedAt: String(row.updated_at),
  }));
  const savedItems = (itemRows ?? [])
    .map((row) => row.data as MediaItem | ActivityItem)
    .filter((item) => Boolean(item?.id && item?.kind));
  return { user, list: listFromRow(listRow), members, votes, events, savedItems };
}

export async function saveCloudVote(
  listId: string,
  vote: Vote,
  item: MediaItem | ActivityItem,
) {
  const client = requireCloud();
  const { error: itemError } = await client.from("list_items").upsert(
    {
      list_id: listId,
      item_id: item.id,
      kind: item.kind,
      added_by: vote.userId,
      data: item,
    },
    { onConflict: "list_id,item_id,kind" },
  );
  if (itemError) throw itemError;
  const { error } = await client.from("votes").upsert(
    {
      list_id: listId,
      user_id: vote.userId,
      item_id: vote.itemId,
      kind: vote.kind,
      decision: vote.decision,
    },
    { onConflict: "list_id,user_id,item_id,kind" },
  );
  if (error) throw error;
}

export async function saveCloudCustomActivity(
  listId: string,
  userId: string,
  item: ActivityItem,
) {
  const client = requireCloud();
  const { error } = await client.from("list_items").upsert(
    {
      list_id: listId,
      item_id: item.id,
      kind: item.kind,
      added_by: userId,
      data: item,
    },
    { onConflict: "list_id,item_id,kind" },
  );
  if (error) throw error;
}

export async function fetchCloudCatalog(input: {
  page: number;
  filters: DiscoveryFilters;
}): Promise<{ items: MediaItem[]; hasMore: boolean }> {
  const client = requireCloud();
  const { data, error } = await client.functions.invoke("tmdb-catalog", {
    body: input,
  });
  if (error) throw error;
  return data as { items: MediaItem[]; hasMore: boolean };
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export async function enableCloudNotifications(
  listId: string,
  vapidPublicKey: string,
) {
  const client = requireCloud();
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    throw new Error("Push notifications are not supported on this device.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Notifications were not allowed.");
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));
  const { error } = await client.from("push_subscriptions").upsert(
    {
      list_id: listId,
      user_id: (await client.auth.getUser()).data.user?.id,
      endpoint: subscription.endpoint,
      subscription: subscription.toJSON(),
    },
    { onConflict: "user_id,endpoint" },
  );
  if (error) throw error;
}

export async function notifyCloudPartner(input: {
  listId: string;
  type: "vote" | PairEventType;
  itemTitle?: string;
}) {
  const client = requireCloud();
  const { error } = await client.functions.invoke("notify-partner", {
    body: input,
  });
  if (error) console.warn("Partner notification could not be sent", error);
}

export async function updateCloudList(list: SharedList) {
  const client = requireCloud();
  const { error } = await client
    .from("shared_lists")
    .update({
      name: list.name,
      threshold: list.threshold,
      content_mode: list.contentMode,
      filters: list.filters,
    })
    .eq("id", list.id);
  if (error) throw error;
}

export async function saveCloudPairEvent(
  listId: string,
  event: Omit<PairEvent, "id" | "updatedAt">,
) {
  const client = requireCloud();
  const { error } = await client.from("pair_events").upsert(
    {
      list_id: listId,
      user_id: event.userId,
      event_type: event.type,
      item_id: event.itemId,
      kind: event.kind,
      payload: event.payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "list_id,user_id,event_type,item_id,kind" },
  );
  if (error) throw error;
}

export function subscribeToCloudList(
  listId: string,
  onChange: () => void,
): () => void {
  if (!supabase) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 120);
  };
  const channels: RealtimeChannel[] = [
    "shared_lists",
    "list_members",
    "votes",
    "pair_events",
    "list_items",
  ].map((table) =>
    supabase
      .channel(`${table}:${listId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter:
            table === "shared_lists"
              ? `id=eq.${listId}`
              : `list_id=eq.${listId}`,
        },
        refresh,
      )
      .subscribe(),
  );
  return () => {
    if (timer) clearTimeout(timer);
    channels.forEach((channel) => {
      void supabase.removeChannel(channel);
    });
  };
}
