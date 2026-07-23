import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { defaultFilters, type ContentMode, type DiscoveryFilters, type Member, type SessionSnapshot, type SharedList, type Vote } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const cloudConfigured = Boolean(supabaseUrl && supabaseKey);
const supabase: SupabaseClient | null = cloudConfigured ? createClient(supabaseUrl!, supabaseKey!) : null;

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
    filters: { ...defaultFilters, ...((row.filters as Partial<DiscoveryFilters>) ?? {}) },
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
  const { error } = await client.from("profiles").upsert({ id, display_name: cleanName });
  if (error) throw error;
  return { id, displayName: cleanName };
}

export async function createCloudList(user: Member, name: string): Promise<string> {
  const client = requireCloud();
  const id = crypto.randomUUID();
  const inviteCode = crypto.randomUUID();
  const { error: listError } = await client.from("shared_lists").insert({
    id,
    invite_code: inviteCode,
    name: name.trim().slice(0, 60),
    threshold: 2,
    content_mode: "mixed",
    filters: defaultFilters,
    owner_id: user.id,
  });
  if (listError) throw listError;
  const { error: memberError } = await client.from("list_members").insert({ list_id: id, user_id: user.id });
  if (memberError) throw memberError;
  return id;
}

export async function joinCloudList(inviteCode: string): Promise<string> {
  const client = requireCloud();
  const { data, error } = await client.rpc("join_list_by_invite", { code: inviteCode });
  if (error) throw error;
  if (!data) throw new Error("That invite link is no longer valid.");
  return String(data);
}

export async function loadCloudSnapshot(user: Member, listId: string): Promise<SessionSnapshot> {
  const client = requireCloud();
  const [{ data: listRow, error: listError }, { data: memberRows, error: memberError }, { data: voteRows, error: voteError }] = await Promise.all([
    client.from("shared_lists").select("*").eq("id", listId).single(),
    client.from("list_members").select("user_id, profiles(display_name)").eq("list_id", listId),
    client.from("votes").select("user_id,item_id,kind,decision").eq("list_id", listId),
  ]);
  if (listError) throw listError;
  if (memberError) throw memberError;
  if (voteError) throw voteError;
  const members: Member[] = (memberRows ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { id: String(row.user_id), displayName: String((profile as { display_name?: string } | null)?.display_name ?? "Friend") };
  });
  const votes: Vote[] = (voteRows ?? []).map((row) => ({
    userId: String(row.user_id),
    itemId: String(row.item_id),
    kind: row.kind as Vote["kind"],
    decision: row.decision as Vote["decision"],
  }));
  return { user, list: listFromRow(listRow), members, votes };
}

export async function saveCloudVote(listId: string, vote: Vote) {
  const client = requireCloud();
  const { error } = await client.from("votes").upsert({
    list_id: listId,
    user_id: vote.userId,
    item_id: vote.itemId,
    kind: vote.kind,
    decision: vote.decision,
  }, { onConflict: "list_id,user_id,item_id,kind" });
  if (error) throw error;
}

export async function updateCloudList(list: SharedList) {
  const client = requireCloud();
  const { error } = await client.from("shared_lists").update({
    name: list.name,
    threshold: list.threshold,
    content_mode: list.contentMode,
    filters: list.filters,
  }).eq("id", list.id);
  if (error) throw error;
}

export function subscribeToCloudList(listId: string, onChange: () => void): () => void {
  if (!supabase) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 120);
  };
  const channels: RealtimeChannel[] = ["shared_lists", "list_members", "votes"].map((table) =>
    supabase.channel(`${table}:${listId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: table === "shared_lists" ? `id=eq.${listId}` : `list_id=eq.${listId}` }, refresh)
      .subscribe()
  );
  return () => {
    if (timer) clearTimeout(timer);
    channels.forEach((channel) => { void supabase.removeChannel(channel); });
  };
}
