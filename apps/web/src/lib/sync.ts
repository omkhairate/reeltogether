import {
  createClient,
  type AuthChangeEvent,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  defaultFilters,
  type ContentMode,
  type CustomCollection,
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

export type CloudListSummary = {
  id: string;
  name: string;
  joinedAt: string;
};

function identityFromUser(user: {
  id: string;
  email?: string;
  is_anonymous?: boolean;
}): CloudIdentity {
  return {
    id: user.id,
    email: user.email ?? null,
    isAnonymous: user.is_anonymous ?? !user.email,
  };
}

function requireCloud() {
  if (!supabase) throw new Error("Shared syncing has not been configured yet.");
  return supabase;
}

function listFromRow(row: Record<string, unknown>): SharedList {
  const stored = (row.filters as Partial<DiscoveryFilters> & {
    collections?: CustomCollection[];
  }) ?? {};
  return {
    id: String(row.id),
    inviteCode: String(row.invite_code),
    name: String(row.name),
    threshold: Number(row.threshold),
    contentMode: row.content_mode as ContentMode,
    filters: {
      ...defaultFilters,
      ...stored,
    },
    collections: Array.isArray(stored.collections)
      ? stored.collections.filter(
          (collection) =>
            Boolean(collection?.id && collection?.name) &&
            Array.isArray(collection.itemKeys),
        )
      : [],
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
  const { data, error } = await client.auth.getUser();
  if (error) {
    if (
      !data.user &&
      (error.name === "AuthSessionMissingError" ||
        error.message.toLowerCase().includes("session missing"))
    )
      return null;
    throw error;
  }
  const user = data.user;
  if (!user) return null;
  return identityFromUser(user);
}

export function subscribeToCloudAuth(
  onChange: (event: AuthChangeEvent, identity: CloudIdentity | null) => void,
) {
  const client = requireCloud();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    // Supabase recommends keeping this callback synchronous. Moving our React
    // update to a microtask also avoids auth-lock deadlocks during token refresh.
    queueMicrotask(() =>
      onChange(event, session?.user ? identityFromUser(session.user) : null),
    );
  });
  return () => data.subscription.unsubscribe();
}

export async function verifyCloudOtp(
  email: string,
  token: string,
  type: "email" | "email_change",
): Promise<CloudIdentity> {
  const client = requireCloud();
  const { data, error } = await client.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.replace(/\s/g, ""),
    type,
  });
  if (error) throw error;
  if (!data.user) throw new Error("That code could not be verified.");
  return identityFromUser(data.user);
}

export async function resendCloudEmailChange(email: string, redirectTo: string) {
  const client = requireCloud();
  const { error } = await client.auth.resend({
    type: "email_change",
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function restoreCloudList(listId: string): Promise<SessionSnapshot | null> {
  const client = requireCloud();
  const identity = await getCloudIdentity();
  if (!identity) return null;
  const { data: profile, error } = await client
    .from("profiles")
    .select("display_name")
    .eq("id", identity.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;
  return loadCloudSnapshot(
    { id: identity.id, displayName: String(profile.display_name) },
    listId,
  );
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

export async function listCloudAccounts(): Promise<CloudListSummary[]> {
  const client = requireCloud();
  const identity = await getCloudIdentity();
  if (!identity) return [];
  const { data: memberships, error: membershipError } = await client
    .from("list_members")
    .select("list_id,joined_at")
    .eq("user_id", identity.id)
    .order("joined_at", { ascending: false });
  if (membershipError) throw membershipError;
  const ids = (memberships ?? []).map((row) => String(row.list_id));
  if (!ids.length) return [];
  const { data: lists, error: listError } = await client
    .from("shared_lists")
    .select("id,name")
    .in("id", ids);
  if (listError) throw listError;
  const byId = new Map((lists ?? []).map((row) => [String(row.id), String(row.name)]));
  return (memberships ?? [])
    .filter((row) => byId.has(String(row.list_id)))
    .map((row) => ({
      id: String(row.list_id),
      name: byId.get(String(row.list_id))!,
      joinedAt: String(row.joined_at),
    }));
}

export async function updateCloudDisplayName(displayName: string) {
  const client = requireCloud();
  const identity = await getCloudIdentity();
  if (!identity) throw new Error("Please sign in again first.");
  const cleanName = displayName.trim().slice(0, 40);
  if (cleanName.length < 2) throw new Error("Use at least two characters.");
  const { error } = await client
    .from("profiles")
    .update({ display_name: cleanName })
    .eq("id", identity.id);
  if (error) throw error;
}

export async function prepareCloudAccountTransfer(listId: string): Promise<string> {
  const client = requireCloud();
  const { data, error } = await client.rpc("prepare_account_transfer", {
    target_list: listId,
  });
  if (error) throw error;
  if (!data) throw new Error("Could not create a safe recovery handoff.");
  return String(data);
}

export async function claimCloudAccountTransfer(token: string): Promise<string> {
  const client = requireCloud();
  const { data, error } = await client.rpc("claim_account_transfer", {
    transfer_token: token,
  });
  if (error) throw error;
  if (!data) throw new Error("That recovery handoff expired. Your original session is still safe.");
  return String(data);
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

export async function deleteCloudAccount() {
  const client = requireCloud();
  const { error } = await client.functions.invoke("delete-account", {
    body: { confirmation: "DELETE" },
  });
  if (error) throw error;
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
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
    { data: extraRows, error: extraError },
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
      .from("pair_extras")
      .select("id,user_id,extra_type,item_id,kind,payload,updated_at")
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
  // pair_extras is an additive launch table. During a rolling deployment an
  // older project can still restore every existing list without it.
  if (extraError && extraError.code !== "42P01") throw extraError;
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
  events.push(...(extraRows ?? []).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    type: row.extra_type as PairEventType,
    itemId: String(row.item_id),
    kind: row.kind as PairEvent["kind"],
    payload: (row.payload ?? {}) as PairEvent["payload"],
    updatedAt: String(row.updated_at),
  })));
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
      filters: { ...list.filters, collections: list.collections },
    })
    .eq("id", list.id);
  if (error) throw error;
}

export async function saveCloudPairEvent(
  listId: string,
  event: Omit<PairEvent, "id" | "updatedAt">,
) {
  const client = requireCloud();
  const legacyTypes: PairEventType[] = [
    "tonight", "nudge", "wildcard", "plan", "confirm", "complete", "rating",
  ];
  const isLegacy = legacyTypes.includes(event.type);
  const table = isLegacy ? "pair_events" : "pair_extras";
  const conflictColumns = isLegacy
    ? "list_id,user_id,event_type,item_id,kind"
    : "list_id,user_id,extra_type,item_id,kind";
  const { error } = await client.from(table).upsert(
    {
      list_id: listId,
      user_id: event.userId,
      ...(isLegacy ? { event_type: event.type } : { extra_type: event.type }),
      item_id: event.itemId,
      kind: event.kind,
      payload: event.payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: conflictColumns },
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
    "pair_extras",
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
