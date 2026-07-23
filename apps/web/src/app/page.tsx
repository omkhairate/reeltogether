"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Compass,
  Copy,
  Download,
  Euro,
  Film,
  House,
  Info,
  ListFilter,
  LogOut,
  Mail,
  MapPin,
  MonitorPlay,
  Plus,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  Users,
  X,
} from "lucide-react";
import { activityCatalog, filterOptions, mediaCatalog } from "@/lib/catalog";
import {
  cloudConfigured,
  createCloudList,
  ensureCloudUser,
  getCloudIdentity,
  joinCloudList,
  loadCloudSnapshot,
  restoreCloudAccount,
  saveCloudVote,
  secureCloudAccount,
  sendCloudSignInLink,
  signOutCloudAccount,
  subscribeToCloudList,
  updateCloudList,
  type CloudIdentity,
} from "@/lib/sync";
import { defaultFilters, type ActivityItem, type ContentKind, type DiscoveryFilters, type MediaItem, type SessionSnapshot, type SharedList, type VoteDecision } from "@/lib/types";

type View = "home" | "discover" | "matches" | "lists";
type Deck = "watch" | "activities";
type Item = MediaItem | ActivityItem;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "reeltogether.session.v2";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function createLocalSession(displayName: string, listName: string): SessionSnapshot {
  const user = { id: crypto.randomUUID(), displayName };
  const friend = { id: "demo-friend", displayName: "Maya" };
  return {
    user,
    list: {
      id: crypto.randomUUID(),
      inviteCode: crypto.randomUUID(),
      name: listName,
      threshold: 2,
      contentMode: "mixed",
      filters: defaultFilters,
    },
    members: [user, friend],
    votes: [
      { userId: friend.id, itemId: "bear", kind: "show", decision: "pick" },
      { userId: friend.id, itemId: "pottery", kind: "activity", decision: "pick" },
    ],
  };
}

export default function ReelTogetherApp() {
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [view, setView] = useState<View>("home");
  const [deck, setDeck] = useState<Deck>("watch");
  const [showFilters, setShowFilters] = useState(false);
  const [detail, setDetail] = useState<Item | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [identity, setIdentity] = useState<CloudIdentity | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const refreshCloud = useCallback(async (current: SessionSnapshot) => {
    if (!cloudConfigured) return;
    try {
      setSession(await loadCloudSnapshot(current.user, current.list.id));
    } catch (reason) {
      console.error(reason);
    }
  }, []);

  useEffect(() => {
    async function restore() {
      const saved = localStorage.getItem(STORAGE_KEY);
      let parsed: SessionSnapshot | null = null;
      if (saved) {
        try { parsed = JSON.parse(saved) as SessionSnapshot; }
        catch { localStorage.removeItem(STORAGE_KEY); }
      }
      if (!cloudConfigured) {
        setSession(parsed);
        setLoading(false);
        return;
      }
      try {
        const currentIdentity = await getCloudIdentity();
        setIdentity(currentIdentity);
        if (!currentIdentity) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        if (parsed && parsed.user.id === currentIdentity.id) {
          setSession(await loadCloudSnapshot(parsed.user, parsed.list.id));
        } else {
          const restored = await restoreCloudAccount();
          setSession(restored);
          if (!restored) localStorage.removeItem(STORAGE_KEY);
        }
      } catch (reason) {
        console.error(reason);
        localStorage.removeItem(STORAGE_KEY);
      } finally { setLoading(false); }
    }
    void restore();
  }, []);

  useEffect(() => {
    if (!session) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    if (!cloudConfigured) return;
    return subscribeToCloudList(session.list.id, () => { void refreshCloud(session); });
  }, [session?.list.id, refreshCloud]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`${basePath}/sw.js`);
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIsInstalled(standalone);
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowInstallHelp(false);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  async function installApp() {
    if (isInstalled) {
      notify("ReelTogether is already installed");
      return;
    }
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
      return;
    }
    setShowInstallHelp(true);
  }

  const userVotes = useMemo(() => new Map(session?.votes.filter((vote) => vote.userId === session.user.id).map((vote) => [`${vote.kind}:${vote.itemId}`, vote.decision]) ?? []), [session]);

  const filteredMedia = useMemo(() => {
    if (!session) return [];
    const filters = session.list.filters;
    return mediaCatalog.filter((item) =>
      (!filters.genres.length || filters.genres.some((genre) => item.genres.includes(genre))) &&
      (!filters.languages.length || filters.languages.includes(item.language)) &&
      (!filters.providers.length || filters.providers.some((provider) => item.providers.includes(provider))) &&
      (!filters.mediaKinds.length || filters.mediaKinds.includes(item.kind))
    );
  }, [session]);

  const filteredActivities = useMemo(() => {
    if (!session) return [];
    const filters = session.list.filters;
    return activityCatalog.filter((item) =>
      (!filters.activityCategories.length || filters.activityCategories.includes(item.category)) &&
      (!filters.budgets.length || filters.budgets.includes(item.budget)) &&
      item.distanceKm <= filters.maxDistanceKm
    );
  }, [session]);

  const mediaQueue = filteredMedia.filter((item) => !userVotes.has(`${item.kind}:${item.id}`));
  const activityQueue = filteredActivities.filter((item) => !userVotes.has(`activity:${item.id}`));
  const matches = useMemo(() => {
    if (!session) return [] as Item[];
    return [...mediaCatalog, ...activityCatalog].filter((item) => {
      const picks = new Set(session.votes.filter((vote) => vote.itemId === item.id && vote.kind === item.kind && vote.decision === "pick").map((vote) => vote.userId));
      return picks.size >= session.list.threshold;
    });
  }, [session]);

  async function castVote(item: Item, decision: VoteDecision) {
    if (!session) return;
    const vote = { userId: session.user.id, itemId: item.id, kind: item.kind as ContentKind, decision };
    const beforeMatches = matches.length;
    setSession((current) => current ? { ...current, votes: [...current.votes.filter((existing) => !(existing.userId === vote.userId && existing.itemId === vote.itemId && existing.kind === vote.kind)), vote] } : current);
    if (navigator.vibrate) navigator.vibrate(18);
    notify(decision === "pick" ? "Picked — waiting for your friend" : "Passed for this list");
    if (cloudConfigured) {
      try {
        await saveCloudVote(session.list.id, vote);
        const latest = await loadCloudSnapshot(session.user, session.list.id);
        setSession(latest);
        const nowMatched = [...mediaCatalog, ...activityCatalog].filter((candidate) => new Set(latest.votes.filter((entry) => entry.itemId === candidate.id && entry.kind === candidate.kind && entry.decision === "pick").map((entry) => entry.userId)).size >= latest.list.threshold).length;
        if (nowMatched > beforeMatches) notify(item.kind === "activity" ? "Bucket-list match!" : "You found a match!");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Your vote could not be synced.");
      }
    }
  }

  async function changeList(next: SharedList) {
    if (!session) return;
    setSession({ ...session, list: next });
    if (cloudConfigured) {
      try { await updateCloudList(next); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Shared settings could not be updated."); }
    }
  }

  async function shareInvite() {
    if (!session) return;
    if (!cloudConfigured) {
      notify("Connect Supabase before inviting a friend");
      return;
    }
    const url = new URL(window.location.href);
    url.search = `?join=${session.list.inviteCode}`;
    const shareData = { title: `Join ${session.list.name}`, text: "Swipe films, shows, and things to do with me.", url: url.toString() };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(url.toString()); notify("Invite link copied"); }
    } catch { /* The share sheet was dismissed. */ }
  }

  if (loading) return <LoadingScreen />;
  if (!session) return <><Onboarding onComplete={(next) => { setSession(next); void getCloudIdentity().then(setIdentity); }} onError={setError} onInstall={installApp} onSignIn={() => setShowAccount(true)} isInstalled={isInstalled} />{showInstallHelp && <InstallSheet onClose={() => setShowInstallHelp(false)} />}{showAccount && <AccountSheet mode="signin" identity={identity} onClose={() => setShowAccount(false)} onSignedOut={() => undefined} />}{error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={17} /></button></div>}</>;

  const counts = { watch: mediaQueue.length, activities: activityQueue.length };
  return (
    <main className="app-shell">
      <div className="app-content">
        {view === "home" && <HomeView session={session} matches={matches} remaining={counts.watch + counts.activities} onNavigate={setView} onShare={shareInvite} onInstall={installApp} isInstalled={isInstalled} onDetail={setDetail} cloud={cloudConfigured} />}
        {view === "discover" && <DiscoverView session={session} deck={deck} onDeck={setDeck} mediaQueue={mediaQueue} activityQueue={activityQueue} onVote={castVote} onFilters={() => setShowFilters(true)} onDetail={setDetail} />}
        {view === "matches" && <MatchesView matches={matches} session={session} onDetail={setDetail} />}
        {view === "lists" && <ListsView session={session} identity={identity} cloud={cloudConfigured} onChange={changeList} onShare={shareInvite} onAccount={() => setShowAccount(true)} onInstall={installApp} isInstalled={isInstalled} onReset={() => { const leave = cloudConfigured ? signOutCloudAccount().catch(() => undefined) : Promise.resolve(); void leave.finally(() => { localStorage.removeItem(STORAGE_KEY); setIdentity(null); setSession(null); }); }} />}
      </div>
      <TabBar view={view} matchCount={matches.length} onNavigate={setView} />
      {showFilters && <FiltersSheet filters={session.list.filters} deck={deck} onClose={() => setShowFilters(false)} onSave={(filters) => { void changeList({ ...session.list, filters }); setShowFilters(false); notify("Shared filters updated"); }} />}
      {detail && <DetailSheet item={detail} onClose={() => setDetail(null)} />}
      {showInstallHelp && <InstallSheet onClose={() => setShowInstallHelp(false)} />}
      {showAccount && <AccountSheet mode="manage" identity={identity} onClose={() => setShowAccount(false)} onSignedOut={() => { localStorage.removeItem(STORAGE_KEY); setIdentity(null); setSession(null); setShowAccount(false); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={17} /></button></div>}
    </main>
  );
}

function LoadingScreen() {
  return <main className="loading-screen"><img src={`${basePath}/icons/brand-mark.png`} alt="" /><strong>reeltogether</strong><span className="loader" /></main>;
}

function Onboarding({ onComplete, onError, onInstall, onSignIn, isInstalled }: { onComplete: (session: SessionSnapshot) => void; onError: (message: string) => void; onInstall: () => void; onSignIn: () => void; isInstalled: boolean }) {
  const [name, setName] = useState("");
  const [listName, setListName] = useState("Sunday sofa club");
  const [busy, setBusy] = useState(false);
  const inviteCode = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("join") ?? "";

  async function submit() {
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      if (!cloudConfigured) {
        onComplete(createLocalSession(name.trim(), listName.trim() || "Our shared list"));
        return;
      }
      const user = await ensureCloudUser(name.trim());
      const listId = inviteCode ? await joinCloudList(inviteCode) : await createCloudList(user, listName.trim() || "Our shared list");
      onComplete(await loadCloudSnapshot(user, listId));
      history.replaceState({}, "", window.location.pathname);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not get your shared list ready.");
    } finally { setBusy(false); }
  }

  return (
    <main className="onboarding">
      <section className="onboarding-card">
        <div className="brand"><img src={`${basePath}/icons/brand-mark.png`} alt="" /><strong>reeltogether</strong></div>
        <div className="onboarding-copy">
          <p>{inviteCode ? "YOU’VE BEEN INVITED" : "PICK TOGETHER"}</p>
          <h1>{inviteCode ? "Join your friend’s list." : "Decide what’s next."}</h1>
          <span>Swipe films, shows, and things to do. A pick appears only when your group reaches its threshold.</span>
        </div>
        <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="What should your friend see?" /></label>
        {!inviteCode && <label>List name<input value={listName} onChange={(event) => setListName(event.target.value)} /></label>}
        <button className="primary-button" disabled={busy || name.trim().length < 2} onClick={submit}>{busy ? "Getting things ready…" : inviteCode ? "Join shared list" : "Create shared list"}</button>
        {cloudConfigured && <button className="account-shortcut" onClick={onSignIn}><Mail size={16} /> Already have an account? <strong>Sign in</strong></button>}
        {!isInstalled && <button className="install-shortcut" onClick={onInstall}><Download size={17} /> Install ReelTogether</button>}
        <div className={`mode-note ${cloudConfigured ? "live" : "demo"}`}><span />{cloudConfigured ? "Private syncing is ready" : "Demo mode — connect Supabase before inviting"}</div>
      </section>
    </main>
  );
}

function HomeView({ session, matches, remaining, onNavigate, onShare, onInstall, isInstalled, onDetail, cloud }: { session: SessionSnapshot; matches: Item[]; remaining: number; onNavigate: (view: View) => void; onShare: () => void; onInstall: () => void; isInstalled: boolean; onDetail: (item: Item) => void; cloud: boolean }) {
  const progress = Math.round(((mediaCatalog.length + activityCatalog.length - remaining) / (mediaCatalog.length + activityCatalog.length)) * 100);
  return <div className="page home-page">
    <header className="topbar"><div className="brand compact"><img src={`${basePath}/icons/brand-mark.png`} alt="" /><strong>reeltogether</strong></div><div className="topbar-actions">{!isInstalled && <button className="quick-install" onClick={onInstall}><Download size={15} /> Install</button>}<span className={`sync-status ${cloud ? "live" : ""}`}><i />{cloud ? "Synced" : "Demo"}</span></div></header>
    <section className="greeting"><p>HELLO, {session.user.displayName.toUpperCase()}</p><h1>What should we do next?</h1></section>
    <section className="list-hero"><div className="list-icon"><Compass size={25} /></div><div><span>YOUR ACTIVE LIST</span><h2>{session.list.name}</h2><p><Users size={14} /> {session.members.length} members · {session.list.threshold} picks to match</p></div><button onClick={() => onNavigate("lists")} aria-label="List settings"><ChevronRight size={20} /></button></section>
    <div className="member-strip"><div className="avatars">{session.members.map((member, index) => <span key={member.id} style={{ background: avatarColor(index) }}>{initials(member.displayName)}</span>)}</div><button onClick={onShare}><Send size={15} /> Invite</button></div>
    <section className="progress-card"><div><span>DISCOVERY QUEUE</span><strong>{remaining} ideas waiting</strong></div><div className="progress-ring" style={{ "--progress": `${progress}%` } as React.CSSProperties}><b>{progress}%</b></div></section>
    <SectionHeading eyebrow="YOUR MATCHES" title="Ready for both of you" action="See all" onAction={() => onNavigate("matches")} />
    {matches.length ? <div className="match-row">{matches.slice(0, 4).map((item) => <button key={`${item.kind}-${item.id}`} className="mini-card" onClick={() => onDetail(item)}><img src={item.image} alt="" /><strong>{item.title}</strong><span><CheckCircle2 size={12} /> Matched</span></button>)}</div> : <div className="empty-inline"><Sparkles size={20} /><span>Your first shared pick will appear here.</span></div>}
    <button className="start-discover" onClick={() => onNavigate("discover")}><span><Compass size={21} /></span><div><b>Keep discovering</b><small>Films, shows, and bucket-list ideas</small></div><ChevronRight size={21} /></button>
  </div>;
}

function DiscoverView({ session, deck, onDeck, mediaQueue, activityQueue, onVote, onFilters, onDetail }: { session: SessionSnapshot; deck: Deck; onDeck: (deck: Deck) => void; mediaQueue: MediaItem[]; activityQueue: ActivityItem[]; onVote: (item: Item, decision: VoteDecision) => void; onFilters: () => void; onDetail: (item: Item) => void }) {
  const canSwitch = session.list.contentMode === "mixed";
  const effectiveDeck = session.list.contentMode === "watch" ? "watch" : session.list.contentMode === "activities" ? "activities" : deck;
  const queue: Item[] = effectiveDeck === "watch" ? mediaQueue : activityQueue;
  const item = queue[0];
  return <div className="page discover-page">
    {canSwitch && <div className="deck-switch"><button className={effectiveDeck === "watch" ? "active" : ""} onClick={() => onDeck("watch")}>Watch</button><button className={effectiveDeck === "activities" ? "active" : ""} onClick={() => onDeck("activities")}>Do</button></div>}
    <header className="discover-header"><div><h1>{session.list.name}</h1><p><Users size={13} /> {session.list.threshold} of {session.members.length} picks to match</p></div><button onClick={onFilters} aria-label="Shared filters"><ListFilter size={20} /><i>{activeFilterCount(session.list.filters)}</i></button></header>
    {item ? <SwipeDeck key={`${item.kind}-${item.id}`} item={item} onVote={onVote} onDetail={onDetail} /> : <div className="deck-empty"><CheckCircle2 size={34} /><h2>You’re all caught up</h2><p>Change the shared filters to bring more ideas into the deck.</p><button onClick={onFilters}>Open filters</button></div>}
    <p className="deck-count">{queue.length} {effectiveDeck === "watch" ? "titles" : "activities"} left for you</p>
  </div>;
}

function SwipeDeck({ item, onVote, onDetail }: { item: Item; onVote: (item: Item, decision: VoteDecision) => void; onDetail: (item: Item) => void }) {
  const [drag, setDrag] = useState(0);
  const start = useRef(0);
  function endDrag() {
    if (drag > 90) onVote(item, "pick");
    else if (drag < -90) onVote(item, "pass");
    setDrag(0);
  }
  return <>
    <section className="deck-stage">
      <div className="card-behind" />
      <article className="swipe-card" style={{ transform: `translateX(${drag}px) rotate(${drag / 28}deg)` }} onPointerDown={(event) => { start.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setDrag(event.clientX - start.current); }} onPointerUp={endDrag} onPointerCancel={() => setDrag(0)}>
        <img src={item.image} alt={`${item.title}`} draggable={false} />
        <div className="poster-shade" />
        <span className="kind-pill">{item.kind === "activity" ? item.category : item.kind === "movie" ? "Movie" : "Series"}</span>
        {Math.abs(drag) > 40 && <b className={`vote-stamp ${drag > 0 ? "pick" : "pass"}`}>{drag > 0 ? item.kind === "activity" ? "SAVE" : "PICK" : "PASS"}</b>}
        <div className="card-copy">{item.kind === "activity" ? <ActivityCopy item={item} /> : <MediaCopy item={item} />}</div>
      </article>
    </section>
    <div className="swipe-actions"><button className="pass" onClick={() => onVote(item, "pass")} aria-label="Pass"><X size={29} /></button><button className="information" onClick={() => onDetail(item)} aria-label="More information"><Info size={23} /></button><button className="pick" onClick={() => onVote(item, "pick")} aria-label={item.kind === "activity" ? "Save" : "Pick"}>{item.kind === "activity" ? <Bookmark size={26} fill="currentColor" /> : <ThumbsUp size={26} fill="currentColor" />}</button></div>
  </>;
}

function MediaCopy({ item }: { item: MediaItem }) {
  return <><span className="rating"><Star size={14} fill="currentColor" /> {item.rating}</span><h2>{item.title}</h2><p>{item.year} · {item.runtime} · {item.genres.join(" · ")}</p><span className="provider"><MonitorPlay size={14} /> {item.providers.join(" · ")}</span><small>{item.summary}</small></>;
}

function ActivityCopy({ item }: { item: ActivityItem }) {
  return <><h2>{item.title}</h2><p className="activity-meta"><span><Euro size={14} />{item.budget}</span><span><Clock3 size={14} />{item.duration}</span><span><MapPin size={14} />{item.distanceKm} km</span></p><small>{item.summary}</small><div className="vibes">{item.vibes.map((vibe) => <span key={vibe}>{vibe}</span>)}</div></>;
}

function MatchesView({ matches, session, onDetail }: { matches: Item[]; session: SessionSnapshot; onDetail: (item: Item) => void }) {
  const [area, setArea] = useState<Deck>("watch");
  const visible = matches.filter((item) => area === "activities" ? item.kind === "activity" : item.kind !== "activity");
  return <div className="page matches-page"><header className="page-title"><p>SHARED PICKS</p><h1>Matches</h1></header><div className="deck-switch"><button className={area === "watch" ? "active" : ""} onClick={() => setArea("watch")}>Watch</button><button className={area === "activities" ? "active" : ""} onClick={() => setArea("activities")}>Bucket list</button></div>{visible.length ? <div className="match-list">{visible.map((item) => { const picks = new Set(session.votes.filter((vote) => vote.itemId === item.id && vote.kind === item.kind && vote.decision === "pick").map((vote) => vote.userId)).size; return <button key={`${item.kind}-${item.id}`} onClick={() => onDetail(item)}><img src={item.image} alt="" /><div><span>{item.kind === "activity" ? "BUCKET LIST" : "MATCH"}</span><h2>{item.title}</h2><p><CheckCircle2 size={14} /> {picks} of {session.members.length} picked</p></div><ChevronRight size={19} /></button>; })}</div> : <div className="large-empty"><Sparkles size={30} /><h2>No matches yet</h2><p>Keep swiping. Shared picks appear here when the list reaches its threshold.</p></div>}</div>;
}

function ListsView({ session, identity, cloud, onChange, onShare, onAccount, onInstall, isInstalled, onReset }: { session: SessionSnapshot; identity: CloudIdentity | null; cloud: boolean; onChange: (list: SharedList) => void; onShare: () => void; onAccount: () => void; onInstall: () => void; isInstalled: boolean; onReset: () => void }) {
  return <div className="page lists-page"><header className="page-title"><p>YOUR SPACE</p><h1>{session.list.name}</h1></header>{cloud && <section className={`account-card ${identity && !identity.isAnonymous ? "secured" : ""}`}><span><ShieldCheck size={21} /></span><div><h2>{identity && !identity.isAnonymous ? "Account secured" : "Secure your account"}</h2><p>{identity && !identity.isAnonymous ? identity.email : "Recover your lists and votes on any device."}</p></div><button onClick={onAccount}>{identity && !identity.isAnonymous ? "Manage" : "Add email"}</button></section>}<section className="settings-card"><div className="setting-heading"><span><Users size={20} /></span><div><h2>Members</h2><p>{cloud ? "Changes sync for everyone" : "Demo data stays on this device"}</p></div></div>{session.members.map((member, index) => <div className="member-row" key={member.id}><span style={{ background: avatarColor(index) }}>{initials(member.displayName)}</span><div><b>{member.displayName}</b><small>{member.id === session.user.id ? "You" : "Can vote and change filters"}</small></div></div>)}<button className="outline-button" onClick={onShare}><Share2 size={17} /> Invite a friend</button></section><section className="settings-card"><div className="setting-heading"><span><Check size={20} /></span><div><h2>Match threshold</h2><p>How many picks create a match?</p></div></div><div className="stepper"><button onClick={() => onChange({ ...session.list, threshold: Math.max(1, session.list.threshold - 1) })}>−</button><strong>{session.list.threshold}</strong><span>of {session.members.length}</span><button onClick={() => onChange({ ...session.list, threshold: Math.min(Math.max(1, session.members.length), session.list.threshold + 1) })}>+</button></div></section>{!isInstalled && <section className="install-card"><div className="setting-heading"><span><Download size={20} /></span><div><h2>Use it like an app</h2><p>Put ReelTogether on this device’s Home Screen.</p></div></div><button className="primary-button" onClick={onInstall}><Download size={17} /> Install app</button></section>}<button className="text-button danger" onClick={onReset}>Leave this device session</button></div>;
}

function AccountSheet({ mode, identity, onClose, onSignedOut }: { mode: "signin" | "manage"; identity: CloudIdentity | null; onClose: () => void; onSignedOut: () => void }) {
  const [email, setEmail] = useState(identity?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const securing = mode === "manage" && Boolean(identity?.isAnonymous);

  async function submit() {
    if (!email.includes("@")) return;
    setBusy(true);
    setMessage("");
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      if (securing) await secureCloudAccount(email, redirectTo);
      else await sendCloudSignInLink(email, redirectTo);
      setSent(true);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "We could not send the email.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    try { await signOutCloudAccount(); onSignedOut(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not sign out."); setBusy(false); }
  }

  const permanent = mode === "manage" && Boolean(identity && !identity.isAnonymous);
  return <div className="sheet-backdrop" onMouseDown={onClose}><section className="bottom-sheet account-sheet" onMouseDown={(event) => event.stopPropagation()}><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button>{sent ? <div className="email-sent"><span><Mail size={27} /></span><p>CHECK YOUR EMAIL</p><h2>One tap and you’re set.</h2><small>We sent a secure link to <strong>{email}</strong>. Open it on this device to finish.</small><button className="primary-button" onClick={onClose}>Done</button></div> : permanent ? <div className="account-manage"><span><ShieldCheck size={27} /></span><p>YOUR ACCOUNT</p><h2>You’re safely signed in.</h2><small>Your lists and votes can be restored with <strong>{identity?.email}</strong>.</small><button className="outline-button sign-out" disabled={busy} onClick={signOut}><LogOut size={16} /> Sign out</button>{message && <div className="form-message">{message}</div>}</div> : <div className="account-form"><span><Mail size={27} /></span><p>{securing ? "SAVE YOUR PROGRESS" : "WELCOME BACK"}</p><h2>{securing ? "Secure your account." : "Sign in to ReelTogether."}</h2><small>{securing ? "Link an email without losing this list or any of your votes." : "We’ll email you a secure sign-in link—no password needed."}</small><label>Email address<input type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><button className="primary-button" disabled={busy || !email.includes("@")} onClick={submit}>{busy ? "Sending…" : securing ? "Secure my account" : "Email me a sign-in link"}</button>{message && <div className="form-message">{message}</div>}</div>}</section></div>;
}

function InstallSheet({ onClose }: { onClose: () => void }) {
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  return <div className="sheet-backdrop" onMouseDown={onClose}><section className="bottom-sheet install-sheet" onMouseDown={(event) => event.stopPropagation()}><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button><img src={`${basePath}/icons/apple-touch-icon.png`} alt="ReelTogether app icon" /><p>INSTALL REELTOGETHER</p><h2>{isIOS ? "Add it to your iPhone" : "Add it to your Home Screen"}</h2><div className="install-steps">{isIOS ? <><div><b>1</b><span>Open this page in <strong>Safari</strong></span></div><div><b>2</b><span>Tap <strong>Share <Share2 size={15} /></strong></span></div><div><b>3</b><span>Choose <strong>Add to Home Screen <Plus size={15} /></strong></span></div></> : <><div><b>1</b><span>Open your browser’s menu</span></div><div><b>2</b><span>Choose <strong>Install app <Download size={15} /></strong> or <strong>Add to Home Screen</strong></span></div><div><b>3</b><span>Confirm the installation</span></div></>}</div>{isIOS && <p className="install-note">Apple requires these final taps—the app cannot add itself automatically.</p>}<button className="primary-button" onClick={onClose}>Got it</button></section></div>;
}

function FiltersSheet({ filters, deck, onClose, onSave }: { filters: DiscoveryFilters; deck: Deck; onClose: () => void; onSave: (filters: DiscoveryFilters) => void }) {
  const [draft, setDraft] = useState(filters);
  const toggle = (key: keyof DiscoveryFilters, value: string) => setDraft((current) => { const list = current[key] as string[]; return { ...current, [key]: list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value] }; });
  return <div className="sheet-backdrop" onMouseDown={onClose}><section className="bottom-sheet filters-sheet" onMouseDown={(event) => event.stopPropagation()}><header><div><p>SHARED FOR EVERYONE</p><h2>Discovery filters</h2></div><button onClick={onClose}><X size={20} /></button></header>{deck === "watch" ? <><FilterGroup title="Type" values={["movie", "show"]} selected={draft.mediaKinds} onToggle={(value) => toggle("mediaKinds", value)} labels={{ movie: "Movies", show: "Shows" }} /><FilterGroup title="Genre" values={filterOptions.genres} selected={draft.genres} onToggle={(value) => toggle("genres", value)} /><FilterGroup title="Language" values={filterOptions.languages} selected={draft.languages} onToggle={(value) => toggle("languages", value)} /><FilterGroup title="Streaming on" values={filterOptions.providers} selected={draft.providers} onToggle={(value) => toggle("providers", value)} /></> : <><FilterGroup title="Category" values={filterOptions.activityCategories} selected={draft.activityCategories} onToggle={(value) => toggle("activityCategories", value)} /><FilterGroup title="Budget" values={filterOptions.budgets} selected={draft.budgets} onToggle={(value) => toggle("budgets", value)} /><label className="range-control"><span>Maximum distance <b>{draft.maxDistanceKm} km</b></span><input type="range" min="3" max="50" step="1" value={draft.maxDistanceKm} onChange={(event) => setDraft({ ...draft, maxDistanceKm: Number(event.target.value) })} /></label></>}<div className="sheet-actions"><button onClick={() => setDraft(defaultFilters)}>Reset</button><button className="primary-button" onClick={() => onSave(draft)}>Apply for everyone</button></div></section></div>;
}

function FilterGroup({ title, values, selected, onToggle, labels = {} }: { title: string; values: readonly string[]; selected: readonly string[]; onToggle: (value: string) => void; labels?: Record<string, string> }) {
  return <div className="filter-group"><h3>{title}</h3><div>{values.map((value) => <button className={selected.includes(value) ? "selected" : ""} key={value} onClick={() => onToggle(value)}>{selected.includes(value) && <Check size={13} />}{labels[value] ?? value}</button>)}</div></div>;
}

function DetailSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  return <div className="sheet-backdrop" onMouseDown={onClose}><section className="bottom-sheet detail-sheet" onMouseDown={(event) => event.stopPropagation()}><button className="sheet-close" onClick={onClose}><X size={20} /></button><img src={item.image} alt="" /><div><span>{item.kind === "activity" ? item.category : item.kind === "movie" ? "MOVIE" : "SERIES"}</span><h2>{item.title}</h2><p>{item.summary}</p>{item.kind === "activity" ? <ul><li><Euro size={16} />{item.budget}</li><li><Clock3 size={16} />{item.duration}</li><li><MapPin size={16} />{item.location} · {item.distanceKm} km</li></ul> : <ul><li><Star size={16} />{item.rating} · {item.year}</li><li><Film size={16} />{item.genres.join(" · ")}</li><li><MonitorPlay size={16} />Available on {item.providers.join(" · ")}</li></ul>}</div></section></div>;
}

function TabBar({ view, matchCount, onNavigate }: { view: View; matchCount: number; onNavigate: (view: View) => void }) {
  const tabs: Array<{ id: View; label: string; icon: React.ReactNode }> = [{ id: "home", label: "Home", icon: <House /> }, { id: "discover", label: "Discover", icon: <Compass /> }, { id: "matches", label: "Matches", icon: <Sparkles /> }, { id: "lists", label: "Lists", icon: <CircleUserRound /> }];
  return <nav className="tabbar">{tabs.map((tab) => <button className={view === tab.id ? "active" : ""} key={tab.id} onClick={() => onNavigate(tab.id)}>{tab.icon}<span>{tab.label}</span>{tab.id === "matches" && matchCount > 0 && <b>{matchCount}</b>}</button>)}</nav>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action: string; onAction: () => void }) { return <div className="section-heading"><div><p>{eyebrow}</p><h2>{title}</h2></div><button onClick={onAction}>{action}</button></div>; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function avatarColor(index: number) { return ["#6b50c6", "#38a7a3", "#e79439", "#ec7c72"][index % 4]; }
function activeFilterCount(filters: DiscoveryFilters) { return filters.genres.length + filters.languages.length + filters.providers.length + filters.mediaKinds.length + filters.activityCategories.length + filters.budgets.length + (filters.maxDistanceKm < 25 ? 1 : 0); }
