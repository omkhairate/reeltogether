"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Compass,
  Download,
  Dices,
  Euro,
  EyeOff,
  Film,
  Globe2,
  House,
  Info,
  ListFilter,
  LogOut,
  Mail,
  MapPin,
  MonitorPlay,
  Plus,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  Trophy,
  Users,
  Zap,
  X,
} from "lucide-react";
import { activityCatalog, filterOptions, mediaCatalog } from "@/lib/catalog";
import {
  cloudConfigured,
  createCloudList,
  enableCloudNotifications,
  ensureCloudUser,
  fetchCloudCatalog,
  getCloudIdentity,
  joinCloudList,
  loadCloudSnapshot,
  restoreCloudAccount,
  saveCloudCustomActivity,
  saveCloudPairEvent,
  saveCloudVote,
  secureCloudAccount,
  sendCloudSignInLink,
  sendCloudSignUpLink,
  signOutCloudAccount,
  subscribeToCloudList,
  notifyCloudPartner,
  updateCloudList,
  type CloudIdentity,
} from "@/lib/sync";
import {
  defaultFilters,
  type ActivityItem,
  type ContentKind,
  type DiscoveryFilters,
  type MediaItem,
  type PairEvent,
  type PairEventType,
  type SessionSnapshot,
  type SharedList,
  type VoteDecision,
} from "@/lib/types";

type View = "home" | "discover" | "matches" | "lists";
type Deck = "watch" | "activities";
type Item = MediaItem | ActivityItem;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "reeltogether.session.v2";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
function imageFallback(event: React.SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  image.onerror = null;
  image.src = `${basePath}/poster-placeholder.svg`;
}
function deviceRegion() {
  if (typeof navigator === "undefined") return "US";
  try {
    return new Intl.Locale(navigator.language).region ?? "US";
  } catch {
    return "US";
  }
}
function deviceFilters(): DiscoveryFilters {
  return { ...defaultFilters, region: deviceRegion() };
}

function createLocalSession(
  displayName: string,
  listName: string,
): SessionSnapshot {
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
      filters: deviceFilters(),
    },
    members: [user, friend],
    votes: [
      { userId: friend.id, itemId: "bear", kind: "show", decision: "pick" },
      {
        userId: friend.id,
        itemId: "pottery",
        kind: "activity",
        decision: "pick",
      },
    ],
    events: [],
    savedItems: [],
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
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [accountMode, setAccountMode] = useState<"signup" | "signin" | "manage">("signin");
  const [isInstalled, setIsInstalled] = useState(false);
  const [identity, setIdentity] = useState<CloudIdentity | null>(null);
  const [showTonight, setShowTonight] = useState(false);
  const [showRoulette, setShowRoulette] = useState(false);
  const [planItem, setPlanItem] = useState<Item | null>(null);
  const [rateItem, setRateItem] = useState<Item | null>(null);
  const [celebration, setCelebration] = useState<Item | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<MediaItem[]>([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogHasMore, setCatalogHasMore] = useState(true);
  const [catalogNotice, setCatalogNotice] = useState("");
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

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
        try {
          parsed = JSON.parse(saved) as SessionSnapshot;
          if (!parsed.events) parsed.events = [];
          if (!parsed.savedItems) parsed.savedItems = [];
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
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
      } finally {
        setLoading(false);
      }
    }
    void restore();
  }, []);

  const catalogQuery = JSON.stringify(session?.list.filters ?? defaultFilters);
  useEffect(() => {
    if (!session || !cloudConfigured) return;
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogNotice("");
    void fetchCloudCatalog({ page: 1, filters: session.list.filters })
      .then(({ items, hasMore }) => {
        if (cancelled) return;
        setRemoteMedia(items);
        setCatalogPage(1);
        setCatalogHasMore(hasMore);
      })
      .catch((reason) => {
        if (cancelled) return;
        console.error(reason);
        setCatalogNotice("Live catalogue needs its TMDB connection. Showing starter picks for now.");
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => { cancelled = true; };
  }, [session?.list.id, catalogQuery]);

  async function loadMoreCatalog() {
    if (!session || catalogLoading || !catalogHasMore) return;
    setCatalogLoading(true);
    try {
      const nextPage = catalogPage + 1;
      const result = await fetchCloudCatalog({ page: nextPage, filters: session.list.filters });
      setRemoteMedia((current) => dedupeItems([...current, ...result.items]));
      setCatalogPage(nextPage);
      setCatalogHasMore(result.hasMore);
    } catch (reason) {
      setCatalogNotice(reason instanceof Error ? reason.message : "Could not load more titles.");
    } finally {
      setCatalogLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    if (!cloudConfigured) return;
    return subscribeToCloudList(session.list.id, () => {
      void refreshCloud(session);
    });
  }, [session?.list.id, refreshCloud]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`${basePath}/sw.js`);
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIsInstalled(standalone);
    setNotificationsEnabled(typeof Notification !== "undefined" && Notification.permission === "granted");
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

  async function enableNotifications() {
    if (!session) return;
    if (!vapidPublicKey) {
      setError("Notifications need their final server key before they can be enabled.");
      return;
    }
    try {
      await enableCloudNotifications(session.list.id, vapidPublicKey);
      setNotificationsEnabled(true);
      notify("Partner notifications are on");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not enable notifications.");
    }
  }

  async function addCustomActivity(item: ActivityItem) {
    if (!session) return;
    try {
      if (cloudConfigured) await saveCloudCustomActivity(session.list.id, session.user.id, item);
      setSession((current) => current ? { ...current, savedItems: dedupeItems([...current.savedItems, item]) } : current);
      setShowAddActivity(false);
      notify("Activity added for both of you");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add the activity.");
    }
  }

  const userVotes = useMemo(
    () =>
      new Map(
        session?.votes
          .filter((vote) => vote.userId === session.user.id)
          .map((vote) => [`${vote.kind}:${vote.itemId}`, vote.decision]) ?? [],
      ),
    [session],
  );

  const mediaItems = useMemo(
    () => {
      const saved = session?.savedItems.filter((item): item is MediaItem => item.kind !== "activity") ?? [];
      const legacyReferenced = mediaCatalog.filter((item) =>
        session?.votes.some((vote) => vote.itemId === item.id && vote.kind === item.kind) ||
        session?.events.some((event) => event.itemId === item.id && event.kind === item.kind),
      );
      return dedupeItems(remoteMedia.length
        ? [...remoteMedia, ...saved, ...legacyReferenced]
        : [...mediaCatalog, ...saved]);
    },
    [remoteMedia, session?.savedItems, session?.votes, session?.events],
  );
  const activityItems = useMemo(
    () => dedupeItems([
      ...activityCatalog,
      ...(session?.savedItems.filter((item): item is ActivityItem => item.kind === "activity") ?? []),
    ]),
    [session?.savedItems],
  );
  const allItems: Item[] = useMemo(
    () => [...mediaItems, ...activityItems],
    [mediaItems, activityItems],
  );
  const completedKeys = useMemo(
    () => new Set(session?.events.filter((event) => event.type === "complete").map((event) => `${event.kind}:${event.itemId}`) ?? []),
    [session?.events],
  );

  const filteredMedia = useMemo(() => {
    if (!session) return [];
    const filters = session.list.filters;
    return mediaItems.filter(
      (item) =>
        (!filters.genres.length ||
          filters.genres.some((genre) => item.genres.includes(genre))) &&
        (!filters.languages.length ||
          filters.languages.includes(item.language)) &&
        (!filters.providers.length ||
          filters.providers.some((provider) =>
            item.providers.includes(provider),
          )) &&
        (!filters.mediaKinds.length || filters.mediaKinds.includes(item.kind)),
    );
  }, [session, mediaItems]);

  const filteredActivities = useMemo(() => {
    if (!session) return [];
    const filters = session.list.filters;
    return activityItems.filter(
      (item) =>
        (!filters.activityCategories.length ||
          filters.activityCategories.includes(item.category)) &&
        (!filters.budgets.length || filters.budgets.includes(item.budget)) &&
        item.distanceKm <= filters.maxDistanceKm,
    );
  }, [session, activityItems]);

  const mediaQueue = filteredMedia.filter(
    (item) => !userVotes.has(`${item.kind}:${item.id}`) && (!session?.list.filters.hideCompleted || !completedKeys.has(`${item.kind}:${item.id}`)),
  );
  const activityQueue = filteredActivities.filter(
    (item) => !userVotes.has(`activity:${item.id}`) && (!session?.list.filters.hideCompleted || !completedKeys.has(`activity:${item.id}`)),
  );
  useEffect(() => {
    if (view === "discover" && deck === "watch" && mediaQueue.length < 5 && catalogHasMore && !catalogLoading)
      void loadMoreCatalog();
  }, [view, deck, mediaQueue.length, catalogHasMore, catalogLoading]);
  const matches = useMemo(() => {
    if (!session) return [] as Item[];
    return allItems.filter((item) => {
      const picks = new Set(
        session.votes
          .filter(
            (vote) =>
              vote.itemId === item.id &&
              vote.kind === item.kind &&
              vote.decision === "pick",
          )
          .map((vote) => vote.userId),
      );
      const wildcard = session.events.some(
        (event) =>
          event.type === "wildcard" &&
          event.itemId === item.id &&
          event.kind === item.kind,
      );
      return picks.size >= 2 || wildcard;
    });
  }, [session, allItems]);

  async function castVote(item: Item, decision: VoteDecision) {
    if (!session) return;
    const vote = {
      userId: session.user.id,
      itemId: item.id,
      kind: item.kind as ContentKind,
      decision,
    };
    const beforeMatches = matches.length;
    const instantMatch = decision === "pick" && session.votes.some((entry) => entry.userId !== session.user.id && entry.itemId === item.id && entry.kind === item.kind && entry.decision === "pick");
    setSession((current) =>
      current
        ? {
            ...current,
            votes: [
              ...current.votes.filter(
                (existing) =>
                  !(
                    existing.userId === vote.userId &&
                    existing.itemId === vote.itemId &&
                    existing.kind === vote.kind
                  ),
              ),
              vote,
            ],
          }
        : current,
    );
    if (navigator.vibrate) navigator.vibrate(18);
    const partnerName =
      session.members.find((member) => member.id !== session.user.id)
        ?.displayName ?? "your person";
    notify(
      decision === "pick"
        ? `Picked — waiting for ${partnerName}`
        : "Passed for now",
    );
    if (instantMatch) {
      setCelebration(item);
      if (navigator.vibrate) navigator.vibrate([35, 35, 70]);
    }
    if (cloudConfigured) {
      try {
        await saveCloudVote(session.list.id, vote, item);
        if (decision === "pick") void notifyCloudPartner({ listId: session.list.id, type: "vote", itemTitle: item.title });
        const latest = await loadCloudSnapshot(session.user, session.list.id);
        setSession(latest);
        const nowMatched = allItems.filter(
          (candidate) =>
            new Set(
              latest.votes
                .filter(
                  (entry) =>
                    entry.itemId === candidate.id &&
                    entry.kind === candidate.kind &&
                    entry.decision === "pick",
                )
                .map((entry) => entry.userId),
            ).size >= 2 ||
            latest.events.some(
              (event) =>
                event.type === "wildcard" &&
                event.itemId === candidate.id &&
                event.kind === candidate.kind,
            ),
        ).length;
        if (nowMatched > beforeMatches) {
          setCelebration(item);
          if (navigator.vibrate) navigator.vibrate([35, 35, 70]);
        }
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Your vote could not be synced.",
        );
      }
    }
  }

  async function addPairEvent(
    type: PairEventType,
    item: Item | null,
    payload: PairEvent["payload"] = {},
  ) {
    if (!session) return;
    const event = {
      userId: session.user.id,
      type,
      itemId: item?.id ?? "",
      kind: (item?.kind ?? "") as PairEvent["kind"],
      payload,
    };
    const optimistic: PairEvent = {
      ...event,
      id: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    setSession((current) =>
      current
        ? {
            ...current,
            events: [
              ...current.events.filter(
                (entry) =>
                  !(
                    entry.userId === event.userId &&
                    entry.type === event.type &&
                    entry.itemId === event.itemId &&
                    entry.kind === event.kind
                  ),
              ),
              optimistic,
            ],
          }
        : current,
    );
    if (cloudConfigured) {
      try {
        await saveCloudPairEvent(session.list.id, event);
        void notifyCloudPartner({ listId: session.list.id, type, ...(item ? { itemTitle: item.title } : {}) });
        await refreshCloud(session);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not sync this moment.",
        );
      }
    }
  }

  async function changeList(next: SharedList) {
    if (!session) return;
    setSession({ ...session, list: next });
    if (cloudConfigured) {
      try {
        await updateCloudList(next);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Shared settings could not be updated.",
        );
      }
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
    const shareData = {
      title: `Join ${session.list.name}`,
      text: "Swipe films, shows, and things to do with me.",
      url: url.toString(),
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(url.toString());
        notify("Invite link copied");
      }
    } catch {
      /* The share sheet was dismissed. */
    }
  }

  if (loading) return <LoadingScreen />;
  if (!session)
    return (
      <>
        <Onboarding
          onComplete={(next) => {
            setSession(next);
            if (cloudConfigured) void getCloudIdentity().then(setIdentity);
          }}
          onError={setError}
          onInstall={installApp}
          onSignIn={() => { setAccountMode("signin"); setShowAccount(true); }}
          onCreateAccount={() => { setAccountMode("signup"); setShowAccount(true); }}
          isInstalled={isInstalled}
        />
        {showInstallHelp && (
          <InstallSheet onClose={() => setShowInstallHelp(false)} />
        )}
        {showAccount && (
          <AccountSheet
            mode={accountMode}
            identity={identity}
            onClose={() => setShowAccount(false)}
            onSignedOut={() => undefined}
          />
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss">
              <X size={17} />
            </button>
          </div>
        )}
      </>
    );

  const counts = { watch: mediaQueue.length, activities: activityQueue.length };
  return (
    <main className="app-shell">
      <div className="app-content">
        {view === "home" && (
          <HomeView
            session={session}
            matches={matches}
            catalog={allItems}
            total={allItems.length}
            remaining={counts.watch + counts.activities}
            onNavigate={setView}
            onShare={shareInvite}
            onTonight={() => setShowTonight(true)}
            onRoulette={() => setShowRoulette(true)}
            onInstall={installApp}
            isInstalled={isInstalled}
            onDetail={setDetail}
            cloud={cloudConfigured}
          />
        )}
        {view === "discover" && (
          <DiscoverView
            session={session}
            deck={deck}
            onDeck={setDeck}
            mediaQueue={mediaQueue}
            activityQueue={activityQueue}
            onVote={castVote}
            onFilters={() => setShowFilters(true)}
            onDetail={setDetail}
            onLoadMore={() => void loadMoreCatalog()}
            loadingMore={catalogLoading}
            hasMore={catalogHasMore}
            catalogNotice={catalogNotice}
            onAddActivity={() => setShowAddActivity(true)}
          />
        )}
        {view === "matches" && (
          <MatchesView
            matches={matches}
            session={session}
            onDetail={setDetail}
            onRoulette={() => setShowRoulette(true)}
            onPlan={setPlanItem}
            onRate={setRateItem}
            onEvent={addPairEvent}
            onVote={castVote}
            catalog={allItems}
          />
        )}
        {view === "lists" && (
          <ListsView
            session={session}
            identity={identity}
            cloud={cloudConfigured}
            onShare={shareInvite}
            onAccount={() => { setAccountMode("manage"); setShowAccount(true); }}
            onInstall={installApp}
            isInstalled={isInstalled}
            onReset={() => {
              const leave = cloudConfigured
                ? signOutCloudAccount().catch(() => undefined)
                : Promise.resolve();
              void leave.finally(() => {
                localStorage.removeItem(STORAGE_KEY);
                setIdentity(null);
                setSession(null);
              });
            }}
            notificationsEnabled={notificationsEnabled}
            onEnableNotifications={() => void enableNotifications()}
          />
        )}
      </div>
      <TabBar view={view} matchCount={matches.length} onNavigate={setView} />
      {showFilters && (
        <FiltersSheet
          filters={session.list.filters}
          deck={deck}
          mediaItems={mediaItems}
          activityItems={activityItems}
          onClose={() => setShowFilters(false)}
          onSave={(filters) => {
            void changeList({ ...session.list, filters });
            setShowFilters(false);
            notify("Shared filters updated");
          }}
        />
      )}
      {detail && (
        <DetailSheet
          item={detail}
          isMatch={matches.some(
            (item) => item.id === detail.id && item.kind === detail.kind,
          )}
          onPlan={() => {
            setPlanItem(detail);
            setDetail(null);
          }}
          onRate={() => {
            setRateItem(detail);
            setDetail(null);
          }}
          onClose={() => setDetail(null)}
        />
      )}
      {showInstallHelp && (
        <InstallSheet onClose={() => setShowInstallHelp(false)} />
      )}
      {showAccount && (
        <AccountSheet
          mode={accountMode}
          identity={identity}
          onClose={() => setShowAccount(false)}
          onSignedOut={() => {
            localStorage.removeItem(STORAGE_KEY);
            setIdentity(null);
            setSession(null);
            setShowAccount(false);
          }}
        />
      )}
      {showTonight && (
        <TonightSheet
          session={session}
          onSave={(payload) => {
            void addPairEvent("tonight", null, payload);
            setShowTonight(false);
            notify("Your vibe is in");
          }}
          onClose={() => setShowTonight(false)}
        />
      )}
      {showRoulette && (
        <RouletteSheet
          matches={matches}
          onClose={() => setShowRoulette(false)}
          onPlan={(item) => {
            setShowRoulette(false);
            setPlanItem(item);
          }}
        />
      )}
      {planItem && (
        <PlanSheet
          item={planItem}
          onSave={(payload) => {
            void addPairEvent("plan", planItem, payload);
            setPlanItem(null);
            notify("Plan sent for confirmation");
          }}
          onClose={() => setPlanItem(null)}
        />
      )}
      {rateItem && (
        <RatingSheet
          item={rateItem}
          onSave={(rating) => {
            void addPairEvent("complete", rateItem, {});
            void addPairEvent("rating", rateItem, { rating });
            setRateItem(null);
            notify("Saved to your history");
          }}
          onClose={() => setRateItem(null)}
        />
      )}
      {celebration && (
        <MatchCelebration
          item={celebration}
          session={session}
          onPlan={() => {
            setPlanItem(celebration);
            setCelebration(null);
          }}
          onClose={() => setCelebration(null)}
        />
      )}
      {showAddActivity && (
        <AddActivitySheet
          onSave={(item) => void addCustomActivity(item)}
          onClose={() => setShowAddActivity(false)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss">
            <X size={17} />
          </button>
        </div>
      )}
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <img src={`${basePath}/icons/brand-mark.png`} alt="" />
      <strong>reeltogether</strong>
      <span className="loader" />
    </main>
  );
}

function Onboarding({
  onComplete,
  onError,
  onInstall,
  onSignIn,
  onCreateAccount,
  isInstalled,
}: {
  onComplete: (session: SessionSnapshot) => void;
  onError: (message: string) => void;
  onInstall: () => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
  isInstalled: boolean;
}) {
  const [name, setName] = useState("");
  const [listName, setListName] = useState("Sunday sofa club");
  const [busy, setBusy] = useState(false);
  const inviteCode =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("join") ?? "");

  async function submit() {
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      if (!cloudConfigured) {
        onComplete(
          createLocalSession(name.trim(), listName.trim() || "Our shared list"),
        );
        return;
      }
      const user = await ensureCloudUser(name.trim());
      const listId = inviteCode
        ? await joinCloudList(inviteCode)
        : await createCloudList(user, listName.trim() || "Our shared list", deviceFilters());
      onComplete(await loadCloudSnapshot(user, listId));
      history.replaceState({}, "", window.location.pathname);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "Could not get your shared list ready.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding">
      <section className="onboarding-card">
        <div className="brand">
          <img src={`${basePath}/icons/brand-mark.png`} alt="" />
          <strong>reeltogether</strong>
        </div>
        <div className="onboarding-copy">
          <p>{inviteCode ? "YOU’VE BEEN INVITED" : "PICK TOGETHER"}</p>
          <h1>
            {inviteCode ? "Join your friend’s list." : "Decide what’s next."}
          </h1>
          <span>
            Swipe films, shows, and things to do privately. When you both choose
            the same idea, it becomes a match.
          </span>
        </div>
        <label>
          Your name
          <input
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="What should your friend see?"
          />
        </label>
        {!inviteCode && (
          <label>
            List name
            <input
              value={listName}
              onChange={(event) => setListName(event.target.value)}
            />
          </label>
        )}
        <button
          className="primary-button"
          disabled={busy || name.trim().length < 2}
          onClick={submit}
        >
          {busy
            ? "Getting things ready…"
            : inviteCode
              ? "Join shared list"
              : "Create shared list"}
        </button>
        {cloudConfigured && (
          <div className="account-choices">
            <button className="account-create" onClick={onCreateAccount}>
              <CircleUserRound size={17} /> Create an account
            </button>
            <button className="account-shortcut" onClick={onSignIn}>
              Already have one? <strong>Sign in</strong>
            </button>
          </div>
        )}
        {!isInstalled && (
          <button className="install-shortcut" onClick={onInstall}>
            <Download size={17} /> Install ReelTogether
          </button>
        )}
        <div className={`mode-note ${cloudConfigured ? "live" : "demo"}`}>
          <span />
          {cloudConfigured
            ? "Private syncing is ready"
            : "Demo mode — connect Supabase before inviting"}
        </div>
      </section>
    </main>
  );
}

function HomeView({
  session,
  matches,
  catalog,
  total,
  remaining,
  onNavigate,
  onShare,
  onTonight,
  onRoulette,
  onInstall,
  isInstalled,
  onDetail,
  cloud,
}: {
  session: SessionSnapshot;
  matches: Item[];
  catalog: Item[];
  total: number;
  remaining: number;
  onNavigate: (view: View) => void;
  onShare: () => void;
  onTonight: () => void;
  onRoulette: () => void;
  onInstall: () => void;
  isInstalled: boolean;
  onDetail: (item: Item) => void;
  cloud: boolean;
}) {
  const progress = Math.round(
    ((total - remaining) /
      Math.max(1, total)) *
      100,
  );
  const partner = session.members.find(
    (member) => member.id !== session.user.id,
  );
  const myVotes = session.votes.filter(
    (vote) => vote.userId === session.user.id,
  ).length;
  const theirVotes = session.votes.filter(
    (vote) => vote.userId === partner?.id,
  ).length;
  const turnCopy = !partner
    ? "Invite your person to begin"
    : myVotes < theirVotes
      ? `${theirVotes - myVotes} ideas are waiting for you`
      : myVotes > theirVotes
        ? `Waiting for ${partner.displayName}`
        : "You’re perfectly in sync";
  const myTonight = latestEvent(session.events, "tonight", session.user.id);
  const theirTonight = partner
    ? latestEvent(session.events, "tonight", partner.id)
    : undefined;
  const completed = uniqueItemsForEvents(
    session.events.filter((event) => event.type === "complete"),
    catalog,
  );
  const mediaMatches = matches.filter(
    (item): item is MediaItem => item.kind !== "activity",
  );
  const favoriteGenre = mostCommon(mediaMatches.flatMap((item) => item.genres));
  const tonightCopy = myTonight && theirTonight
    ? `${myTonight.payload.mood === theirTonight.payload.mood ? `Both ${myTonight.payload.mood}` : `${myTonight.payload.mood} ↔ ${theirTonight.payload.mood}`} · ${myTonight.payload.time === theirTonight.payload.time ? myTonight.payload.time : "meet in the middle"}`
    : myTonight ? `Waiting for ${partner?.displayName ?? "your person"}` : theirTonight ? `${partner?.displayName} is ready—add your vibe` : "Find your overlap in 20 seconds";
  return (
    <div className="page home-page">
      <header className="topbar">
        <div className="brand compact">
          <img src={`${basePath}/icons/brand-mark.png`} alt="" />
          <strong>reeltogether</strong>
        </div>
        <div className="topbar-actions">
          {!isInstalled && (
            <button className="quick-install" onClick={onInstall}>
              <Download size={15} /> Install
            </button>
          )}
          <span className={`sync-status ${cloud ? "live" : ""}`}>
            <i />
            {cloud ? "Synced" : "Demo"}
          </span>
        </div>
      </header>
      <section className="greeting">
        <p>
          {partner
            ? `${session.user.displayName.toUpperCase()} + ${partner.displayName.toUpperCase()}`
            : `HELLO, ${session.user.displayName.toUpperCase()}`}
        </p>
        <h1>What’s next for the two of you?</h1>
      </section>
      <section className="duo-hero">
        <div className="duo-avatars">
          <span style={{ background: avatarColor(0) }}>
            {initials(session.user.displayName)}
          </span>
          {partner ? (
            <span style={{ background: avatarColor(1) }}>
              {initials(partner.displayName)}
            </span>
          ) : (
            <button onClick={onShare}>
              <Plus size={18} />
            </button>
          )}
          <i />
        </div>
        <div>
          <span>YOUR SHARED SPACE</span>
          <h2>{session.list.name}</h2>
          <p>
            <Zap size={13} /> {turnCopy}
          </p>
        </div>
        <button onClick={() => onNavigate("lists")} aria-label="Pair settings">
          <ChevronRight size={20} />
        </button>
      </section>
      <div className="member-strip">
        <div className="avatars">
          {session.members.map((member, index) => (
            <span key={member.id} style={{ background: avatarColor(index) }}>
              {initials(member.displayName)}
            </span>
          ))}
        </div>
        <button onClick={onShare}>
          <Send size={15} /> Invite
        </button>
      </div>
      <button className="tonight-card" onClick={onTonight}>
        <span>
          <CalendarDays size={23} />
        </span>
        <div>
          <small>TONIGHT MODE</small>
          <strong>
              {tonightCopy}
          </strong>
        </div>
        <ChevronRight size={19} />
      </button>
      <div className="duo-tools">
        <button onClick={onRoulette}>
          <Dices size={20} />
          <span>
            <b>Pick for us</b>
            <small>Match roulette</small>
          </span>
        </button>
        <button onClick={() => onNavigate("matches")}>
          <Trophy size={20} />
          <span>
            <b>{completed.length} done</b>
            <small>Your history</small>
          </span>
        </button>
      </div>
      <section className="progress-card duo-progress">
        <div>
          <span>YOUR TURN</span>
          <strong>{turnCopy}</strong>
          <small>{remaining} fresh ideas left for you</small>
        </div>
        <div
          className="progress-ring"
          style={{ "--progress": `${progress}%` } as React.CSSProperties}
        >
          <b>{progress}%</b>
        </div>
      </section>
      <SectionHeading
        eyebrow="YOUR MATCHES"
        title="Ready for both of you"
        action="See all"
        onAction={() => onNavigate("matches")}
      />
      {matches.length ? (
        <div className="match-row">
          {matches.slice(0, 4).map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              className="mini-card"
              onClick={() => onDetail(item)}
            >
              <img src={item.image} alt="" onError={imageFallback} />
              <strong>{item.title}</strong>
              <span>
                <CheckCircle2 size={12} /> Matched
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-inline">
          <Sparkles size={20} />
          <span>Your first shared pick will appear here.</span>
        </div>
      )}
      <button className="start-discover" onClick={() => onNavigate("discover")}>
        <span>
          <Compass size={21} />
        </span>
        <div>
          <b>Keep discovering</b>
          <small>Films, shows, and bucket-list ideas</small>
        </div>
        <ChevronRight size={21} />
      </button>
      <section className="pair-insight">
        <BarChart3 size={19} />
        <div>
          <span>YOUR DUO SO FAR</span>
          <strong>
            {favoriteGenre
              ? `${favoriteGenre} is your strongest overlap`
              : "Your shared taste is taking shape"}
          </strong>
          <small>
            {matches.length} matches · {completed.length} memories made
          </small>
        </div>
      </section>
    </div>
  );
}

function DiscoverView({
  session,
  deck,
  onDeck,
  mediaQueue,
  activityQueue,
  onVote,
  onFilters,
  onDetail,
  onLoadMore,
  loadingMore,
  hasMore,
  catalogNotice,
  onAddActivity,
}: {
  session: SessionSnapshot;
  deck: Deck;
  onDeck: (deck: Deck) => void;
  mediaQueue: MediaItem[];
  activityQueue: ActivityItem[];
  onVote: (item: Item, decision: VoteDecision) => void;
  onFilters: () => void;
  onDetail: (item: Item) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
  hasMore: boolean;
  catalogNotice: string;
  onAddActivity: () => void;
}) {
  const canSwitch = session.list.contentMode === "mixed";
  const effectiveDeck =
    session.list.contentMode === "watch"
      ? "watch"
      : session.list.contentMode === "activities"
        ? "activities"
        : deck;
  const queue: Item[] = effectiveDeck === "watch" ? mediaQueue : activityQueue;
  const item = queue[0];
  return (
    <div className="page discover-page">
      {canSwitch && (
        <div className="deck-switch">
          <button
            className={effectiveDeck === "watch" ? "active" : ""}
            onClick={() => onDeck("watch")}
          >
            Watch
          </button>
          <button
            className={effectiveDeck === "activities" ? "active" : ""}
            onClick={() => onDeck("activities")}
          >
            Do
          </button>
        </div>
      )}
      <header className="discover-header">
        <div>
          <h1>{session.list.name}</h1>
          <p>
            <Users size={13} /> A match stays secret until you both pick it
          </p>
        </div>
        <div className="discover-actions">
          {effectiveDeck === "activities" && (
            <button onClick={onAddActivity} aria-label="Add an activity"><Plus size={20} /></button>
          )}
          <button onClick={onFilters} aria-label="Shared filters">
            <ListFilter size={20} />
            <i>{activeFilterCount(session.list.filters)}</i>
          </button>
        </div>
      </header>
      {item ? (
        <SwipeDeck
          key={`${item.kind}-${item.id}`}
          item={item}
          onVote={onVote}
          onDetail={onDetail}
        />
      ) : (
        <div className="deck-empty">
          <CheckCircle2 size={34} />
          <h2>You’re all caught up</h2>
          <p>Change the shared filters to bring more ideas into the deck.</p>
          <button onClick={onFilters}>Open filters</button>
        </div>
      )}
      <p className="deck-count">
        {queue.length} {effectiveDeck === "watch" ? "titles" : "activities"}{" "}
        left for you
      </p>
      {catalogNotice && effectiveDeck === "watch" && <p className="catalog-notice">{catalogNotice}</p>}
      {effectiveDeck === "watch" && hasMore && (
        <button className="load-more" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? "Finding more…" : "Load more from TMDB"}
        </button>
      )}
    </div>
  );
}

function SwipeDeck({
  item,
  onVote,
  onDetail,
}: {
  item: Item;
  onVote: (item: Item, decision: VoteDecision) => void;
  onDetail: (item: Item) => void;
}) {
  const [drag, setDrag] = useState(0);
  const start = useRef(0);
  function endDrag() {
    if (drag > 90) onVote(item, "pick");
    else if (drag < -90) onVote(item, "pass");
    setDrag(0);
  }
  return (
    <>
      <section className="deck-stage">
        <div className="card-behind" />
        <article
          className="swipe-card"
          style={{ transform: `translateX(${drag}px) rotate(${drag / 28}deg)` }}
          onPointerDown={(event) => {
            start.current = event.clientX;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              setDrag(event.clientX - start.current);
          }}
          onPointerUp={endDrag}
          onPointerCancel={() => setDrag(0)}
        >
          <img src={item.image} alt={`${item.title}`} draggable={false} onError={imageFallback} />
          <div className="poster-shade" />
          <span className="kind-pill">
            {item.kind === "activity"
              ? item.category
              : item.kind === "movie"
                ? "Movie"
                : "Series"}
          </span>
          {Math.abs(drag) > 40 && (
            <b className={`vote-stamp ${drag > 0 ? "pick" : "pass"}`}>
              {drag > 0 ? (item.kind === "activity" ? "SAVE" : "PICK") : "PASS"}
            </b>
          )}
          <div className="card-copy">
            {item.kind === "activity" ? (
              <ActivityCopy item={item} />
            ) : (
              <MediaCopy item={item} />
            )}
          </div>
        </article>
      </section>
      <div className="swipe-actions">
        <button
          className="pass"
          onClick={() => onVote(item, "pass")}
          aria-label="Pass"
        >
          <X size={29} />
        </button>
        <button
          className="information"
          onClick={() => onDetail(item)}
          aria-label="More information"
        >
          <Info size={23} />
        </button>
        <button
          className="pick"
          onClick={() => onVote(item, "pick")}
          aria-label={item.kind === "activity" ? "Save" : "Pick"}
        >
          {item.kind === "activity" ? (
            <Bookmark size={26} fill="currentColor" />
          ) : (
            <ThumbsUp size={26} fill="currentColor" />
          )}
        </button>
      </div>
    </>
  );
}

function MediaCopy({ item }: { item: MediaItem }) {
  return (
    <>
      <span className="rating">
        <Star size={14} fill="currentColor" /> {item.rating}
      </span>
      <h2>{item.title}</h2>
      <p>
        {item.year} · {item.runtime} · {item.genres.join(" · ")}
      </p>
      <span className="provider provider-badges">
        <MonitorPlay size={14} />
        {item.providers.length ? item.providers.slice(0, 3).map((provider) => (
          <span key={provider}>
            {item.providerLogos?.[provider] && <img src={item.providerLogos[provider]} alt="" />}
            {provider}
          </span>
        )) : <span>Availability varies by region</span>}
      </span>
      <small>{item.summary}</small>
    </>
  );
}

function ActivityCopy({ item }: { item: ActivityItem }) {
  return (
    <>
      <h2>{item.title}</h2>
      <p className="activity-meta">
        <span>
          <Euro size={14} />
          {item.budget}
        </span>
        <span>
          <Clock3 size={14} />
          {item.duration}
        </span>
        <span>
          <MapPin size={14} />
          {item.distanceKm} km
        </span>
      </p>
      <small>{item.summary}</small>
      <div className="vibes">
        {item.vibes.map((vibe) => (
          <span key={vibe}>{vibe}</span>
        ))}
      </div>
    </>
  );
}

function MatchesView({
  matches,
  session,
  onDetail,
  onRoulette,
  onPlan,
  onRate,
  onEvent,
  onVote,
  catalog,
}: {
  matches: Item[];
  session: SessionSnapshot;
  onDetail: (item: Item) => void;
  onRoulette: () => void;
  onPlan: (item: Item) => void;
  onRate: (item: Item) => void;
  onEvent: (
    type: PairEventType,
    item: Item | null,
    payload?: PairEvent["payload"],
  ) => void;
  onVote: (item: Item, decision: VoteDecision) => void;
  catalog: Item[];
}) {
  const [area, setArea] = useState<Deck>("watch");
  const visible = matches.filter((item) =>
    area === "activities" ? item.kind === "activity" : item.kind !== "activity",
  );
  const partner = session.members.find(
    (member) => member.id !== session.user.id,
  );
  const almost = partner
    ? catalog.filter(
        (item) =>
          session.votes.some(
            (vote) =>
              vote.userId === session.user.id &&
              vote.itemId === item.id &&
              vote.kind === item.kind &&
              vote.decision === "pick",
          ) &&
          session.votes.some(
            (vote) =>
              vote.userId === partner.id &&
              vote.itemId === item.id &&
              vote.kind === item.kind &&
              vote.decision === "pass",
          ),
      )
    : [];
  const incomingNudges = session.events.filter((event) => event.type === "nudge" && event.userId !== session.user.id).map((event) => ({ event, item: findItem(event.itemId, event.kind, catalog) })).filter((entry): entry is { event: PairEvent; item: Item } => Boolean(entry.item) && session.votes.some((vote) => vote.userId === session.user.id && vote.itemId === entry.item?.id && vote.kind === entry.item?.kind && vote.decision === "pass"));
  const wildcardUsed = session.events.some(
    (event) => event.type === "wildcard" && event.userId === session.user.id,
  );
  const plans = dedupeEvents(
    session.events.filter((event) => event.type === "plan"),
  );
  const completedItems = uniqueItemsForEvents(
    session.events.filter((event) => event.type === "complete"),
    catalog,
  );
  const watchMatch = matches.find((item) => item.kind !== "activity");
  const activityMatch = matches.find((item) => item.kind === "activity");
  return (
    <div className="page matches-page">
      <header className="page-title match-title">
        <div>
          <p>JUST THE TWO OF YOU</p>
          <h1>Your picks</h1>
        </div>
        <button onClick={onRoulette}>
          <Dices size={18} /> Decide
        </button>
      </header>
      <div className="deck-switch">
        <button
          className={area === "watch" ? "active" : ""}
          onClick={() => setArea("watch")}
        >
          Watch together
        </button>
        <button
          className={area === "activities" ? "active" : ""}
          onClick={() => setArea("activities")}
        >
          Do together
        </button>
      </div>
      {visible.length ? (
        <div className="match-list">
          {visible.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              onClick={() => onDetail(item)}
            >
              <img src={item.image} alt="" onError={imageFallback} />
              <div>
                <span>
                  {session.events.some(
                    (event) =>
                      event.type === "wildcard" &&
                      event.itemId === item.id &&
                      event.kind === item.kind,
                  )
                    ? "WILDCARD"
                    : item.kind === "activity"
                      ? "BUCKET LIST MATCH"
                      : "YOU BOTH PICKED IT"}
                </span>
                <h2>{item.title}</h2>
                <p>
                  <CheckCircle2 size={14} /> Ready when you are
                </p>
              </div>
              <ChevronRight size={19} />
            </button>
          ))}
        </div>
      ) : (
        <div className="large-empty compact-empty">
          <Sparkles size={30} />
          <h2>No shared picks yet</h2>
          <p>Your choices stay private until you both choose the same thing.</p>
        </div>
      )}
      {watchMatch && activityMatch && (
        <section className="bundle-card">
          <p>PAIR BUNDLE</p>
          <h2>
            {watchMatch.title} + {activityMatch.title}
          </h2>
          <span>
            One complete plan, made from two things you already agree on.
          </span>
          <button onClick={() => onPlan(watchMatch)}>Plan this pairing</button>
        </section>
      )}
      {incomingNudges.length > 0 && <><SectionHeading eyebrow={`${partner?.displayName?.toUpperCase()} SAYS`} title="Give it one more look?" action="" onAction={() => undefined} /><div className="incoming-nudges">{incomingNudges.map(({ event, item }) => <div key={event.id}><img src={item.image} alt="" onError={imageFallback} /><div><b>{item.title}</b><small>“{String(event.payload.message)}”</small></div><button onClick={() => onVote(item, "pick")}><RotateCcw size={13} /> Reconsider</button></div>)}</div></>}
      {plans.length > 0 && (
        <>
          <SectionHeading
            eyebrow="ON THE CALENDAR"
            title="Plans together"
            action=""
            onAction={() => undefined}
          />
          <div className="plan-list">
            {plans.map((event) => {
              const item = findItem(event.itemId, event.kind, catalog);
              if (!item) return null;
              const confirmed = session.events.some(
                (entry) =>
                  entry.type === "confirm" &&
                  entry.itemId === item.id &&
                  entry.kind === item.kind,
              );
              return (
                <div key={event.id}>
                  <img src={item.image} alt="" onError={imageFallback} />
                  <div>
                    <b>{item.title}</b>
                    <small>
                      <CalendarDays size={12} />{" "}
                      {String(event.payload.when || "Someday")}
                    </small>
                  </div>
                  {confirmed ? (
                    <button onClick={() => onRate(item)}>Mark done</button>
                  ) : event.userId === session.user.id ? (
                    <span>Waiting for {partner?.displayName}</span>
                  ) : (
                    <button
                      onClick={() =>
                        onEvent("confirm", item, { planId: event.id })
                      }
                    >
                      Confirm
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {almost.length > 0 && (
        <>
          <SectionHeading
            eyebrow="SECOND CHANCES"
            title="Worth another look?"
            action=""
            onAction={() => undefined}
          />
          <div className="almost-list">
            {almost.slice(0, 3).map((item) => {
              const nudged = session.events.some(
                (event) =>
                  event.type === "nudge" &&
                  event.userId === session.user.id &&
                  event.itemId === item.id &&
                  event.kind === item.kind,
              );
              return (
                <div key={`${item.kind}-${item.id}`}>
                  <img src={item.image} alt="" onError={imageFallback} />
                  <div>
                    <b>{item.title}</b>
                    <small>
                      {partner?.displayName} passed—send one gentle nudge.
                    </small>
                  </div>
                  <button
                    disabled={nudged}
                    onClick={() =>
                      onEvent("nudge", item, {
                        message:
                          "I think we’d genuinely enjoy this—one more look?",
                      })
                    }
                  >
                    {nudged ? "Sent" : "Convince"}
                  </button>
                  {!wildcardUsed && (
                    <button
                      className="wildcard"
                      onClick={() => onEvent("wildcard", item, {})}
                    >
                      <Zap size={13} /> Wildcard
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {completedItems.length > 0 && (
        <>
          <SectionHeading
            eyebrow="YOUR HISTORY"
            title="Memories made"
            action=""
            onAction={() => undefined}
          />
          <div className="history-row">
            {completedItems.map((item) => {
              const ratings = session.events.filter(
                (event) =>
                  event.type === "rating" &&
                  event.itemId === item.id &&
                  event.kind === item.kind,
              );
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => onDetail(item)}
                >
                  <img src={item.image} alt="" onError={imageFallback} />
                  <b>{item.title}</b>
                  <small>
                    {ratings.length >= 2
                      ? `★ ${averageRating(ratings)} together`
                      : "Rating stays private until both finish"}
                  </small>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ListsView({
  session,
  identity,
  cloud,
  onShare,
  onAccount,
  onInstall,
  isInstalled,
  onReset,
  notificationsEnabled,
  onEnableNotifications,
}: {
  session: SessionSnapshot;
  identity: CloudIdentity | null;
  cloud: boolean;
  onShare: () => void;
  onAccount: () => void;
  onInstall: () => void;
  isInstalled: boolean;
  onReset: () => void;
  notificationsEnabled: boolean;
  onEnableNotifications: () => void;
}) {
  return (
    <div className="page lists-page">
      <header className="page-title">
        <p>YOUR SPACE</p>
        <h1>{session.list.name}</h1>
      </header>
      {cloud && (
        <section
          className={`account-card ${identity && !identity.isAnonymous ? "secured" : ""}`}
        >
          <span>
            <ShieldCheck size={21} />
          </span>
          <div>
            <h2>
              {identity && !identity.isAnonymous
                ? "Account secured"
                : "Secure your account"}
            </h2>
            <p>
              {identity && !identity.isAnonymous
                ? identity.email
                : "Recover your lists and votes on any device."}
            </p>
          </div>
          <button onClick={onAccount}>
            {identity && !identity.isAnonymous ? "Manage" : "Add email"}
          </button>
        </section>
      )}
      <section className="settings-card">
        <div className="setting-heading">
          <span>
            <Users size={20} />
          </span>
          <div>
            <h2>The two of you</h2>
            <p>
              {cloud
                ? "Everything here syncs privately"
                : "Demo data stays on this device"}
            </p>
          </div>
        </div>
        {session.members.map((member, index) => (
          <div className="member-row" key={member.id}>
            <span style={{ background: avatarColor(index) }}>
              {initials(member.displayName)}
            </span>
            <div>
              <b>{member.displayName}</b>
              <small>
                {member.id === session.user.id
                  ? "You"
                  : "Your other half of the decision"}
              </small>
            </div>
          </div>
        ))}
        {session.members.length < 2 && (
          <button className="outline-button" onClick={onShare}>
            <Share2 size={17} /> Invite your person
          </button>
        )}
      </section>
      <section className="settings-card pair-rule">
        <div className="setting-heading">
          <span>
            <Check size={20} />
          </span>
          <div>
            <h2>How matching works</h2>
            <p>
              Your picks stay private. A match appears only when you both choose
              it.
            </p>
          </div>
        </div>
        <div>
          <span style={{ background: avatarColor(0) }}>
            {initials(session.user.displayName)}
          </span>
          <i>+</i>
          <span style={{ background: avatarColor(1) }}>
            {session.members[1]
              ? initials(session.members[1].displayName)
              : "?"}
          </span>
          <b>= Match</b>
        </div>
      </section>
      {!isInstalled && (
        <section className="install-card">
          <div className="setting-heading">
            <span>
              <Download size={20} />
            </span>
            <div>
              <h2>Use it like an app</h2>
              <p>Put ReelTogether on this device’s Home Screen.</p>
            </div>
          </div>
          <button className="primary-button" onClick={onInstall}>
            <Download size={17} /> Install app
          </button>
        </section>
      )}
      <section className="settings-card notification-card">
        <div className="setting-heading">
          <span><Bell size={20} /></span>
          <div>
            <h2>Partner notifications</h2>
            <p>Get a quiet heads-up for turns, plans, and shared moments.</p>
          </div>
        </div>
        <button className="outline-button" disabled={notificationsEnabled} onClick={onEnableNotifications}>
          <Bell size={16} /> {notificationsEnabled ? "Notifications on" : "Enable notifications"}
        </button>
      </section>
      <div className="data-credit">
        <img src={`${basePath}/tmdb-logo.svg`} alt="TMDB" />
        <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
        <small>Streaming availability provided by JustWatch.</small>
      </div>
      <button className="text-button danger" onClick={onReset}>
        Leave this device session
      </button>
    </div>
  );
}

function TonightSheet({
  session,
  onSave,
  onClose,
}: {
  session: SessionSnapshot;
  onSave: (payload: PairEvent["payload"]) => void;
  onClose: () => void;
}) {
  const existing = latestEvent(session.events, "tonight", session.user.id);
  const [mood, setMood] = useState(String(existing?.payload.mood ?? "Cozy"));
  const [time, setTime] = useState(String(existing?.payload.time ?? "2 hours"));
  const [energy, setEnergy] = useState(
    String(existing?.payload.energy ?? "Low-key"),
  );
  const [budget, setBudget] = useState(String(existing?.payload.budget ?? "€"));
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="bottom-sheet tonight-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p>JUST FOR TONIGHT</p>
            <h2>What feels right?</h2>
          </div>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <p className="privacy-note">
          Your choices are revealed only after both of you answer.
        </p>
        <ChoiceRow
          title="Mood"
          options={["Cozy", "Funny", "Thrilling", "Curious"]}
          value={mood}
          onChange={setMood}
        />
        <ChoiceRow
          title="Time"
          options={["45 min", "2 hours", "All evening"]}
          value={time}
          onChange={setTime}
        />
        <ChoiceRow
          title="Energy"
          options={["Low-key", "Up for anything", "Get us outside"]}
          value={energy}
          onChange={setEnergy}
        />
        <ChoiceRow
          title="Budget"
          options={["Free", "€", "€€", "€€€"]}
          value={budget}
          onChange={setBudget}
        />
        <button
          className="primary-button"
          onClick={() => onSave({ mood, time, energy, budget })}
        >
          Add my vibe
        </button>
      </section>
    </div>
  );
}

function ChoiceRow({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="choice-row">
      <h3>{title}</h3>
      <div>
        {options.map((option) => (
          <button
            className={value === option ? "selected" : ""}
            key={option}
            onClick={() => onChange(option)}
          >
            {value === option && <Check size={12} />}
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function RouletteSheet({
  matches,
  onClose,
  onPlan,
}: {
  matches: Item[];
  onClose: () => void;
  onPlan: (item: Item) => void;
}) {
  const [index, setIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const chosen = matches[index % Math.max(1, matches.length)];
  function spin() {
    if (!matches.length || spinning) return;
    setSpinning(true);
    let ticks = 0;
    const timer = window.setInterval(
      () => {
        setIndex((current) => (current + 1) % matches.length);
        ticks += 1;
        if (ticks >= 14) {
          clearInterval(timer);
          setSpinning(false);
        }
      },
      90 + ticks * 8,
    );
  }
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="bottom-sheet roulette-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="sheet-close" onClick={onClose} aria-label="Close roulette">
          <X size={20} />
        </button>
        <p>THE WHEEL OF INDECISION</p>
        <h2>Let your matches choose.</h2>
        {chosen ? (
          <div
            className={spinning ? "roulette-pick spinning" : "roulette-pick"}
          >
            <img src={chosen.image} alt="" onError={imageFallback} />
            <span>{chosen.kind === "activity" ? "DO" : "WATCH"}</span>
            <strong>{chosen.title}</strong>
          </div>
        ) : (
          <div className="roulette-empty">Match on a few ideas first.</div>
        )}
        <button
          className="primary-button"
          disabled={!matches.length || spinning}
          onClick={spin}
        >
          <Dices size={18} /> {spinning ? "Choosing…" : "Spin again"}
        </button>
        {chosen && !spinning && (
          <button className="outline-button" onClick={() => onPlan(chosen)}>
            That’s the one—plan it
          </button>
        )}
      </section>
    </div>
  );
}

function PlanSheet({
  item,
  onSave,
  onClose,
}: {
  item: Item;
  onSave: (payload: PairEvent["payload"]) => void;
  onClose: () => void;
}) {
  const [when, setWhen] = useState("");
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="bottom-sheet plan-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="sheet-close" onClick={onClose} aria-label="Close planner">
          <X size={20} />
        </button>
        <img src={item.image} alt="" onError={imageFallback} />
        <p>MAKE IT REAL</p>
        <h2>When should you do {item.title}?</h2>
        <label>
          Date and time
          <input
            type="text"
            placeholder="Tonight, Friday at 8, someday…"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
        </label>
        <div className="quick-dates">
          <button onClick={() => setWhen("Tonight")}>Tonight</button>
          <button onClick={() => setWhen("Friday")}>Friday</button>
          <button onClick={() => setWhen("This weekend")}>This weekend</button>
          <button onClick={() => setWhen("Someday")}>Someday</button>
        </div>
        <button
          className="primary-button"
          disabled={!when}
          onClick={() => onSave({ when })}
        >
          Send to your person
        </button>
      </section>
    </div>
  );
}

function RatingSheet({
  item,
  onSave,
  onClose,
}: {
  item: Item;
  onSave: (rating: number) => void;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(0);
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="bottom-sheet rating-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="sheet-close" onClick={onClose} aria-label="Close rating">
          <X size={20} />
        </button>
        <p>MEMORY MADE</p>
        <h2>How was {item.title}?</h2>
        <small>Your rating stays private until both of you finish.</small>
        <div className="star-picker">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              onClick={() => setRating(value)}
              aria-label={`${value} stars`}
            >
              <Star fill={value <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
        <button
          className="primary-button"
          disabled={!rating}
          onClick={() => onSave(rating)}
        >
          Save our memory
        </button>
      </section>
    </div>
  );
}

function MatchCelebration({
  item,
  session,
  onPlan,
  onClose,
}: {
  item: Item;
  session: SessionSnapshot;
  onPlan: () => void;
  onClose: () => void;
}) {
  const partner = session.members.find(
    (member) => member.id !== session.user.id,
  );
  return (
    <div className="celebration">
      <div className="confetti" aria-hidden="true">
        ✦ · ✧ · ✦ · ✧
      </div>
      <section>
        <button className="sheet-close" onClick={onClose} aria-label="Close celebration">
          <X size={20} />
        </button>
        <div className="celebration-avatars">
          <span style={{ background: avatarColor(0) }}>
            {initials(session.user.displayName)}
          </span>
          <i>
            <Check size={18} />
          </i>
          <span style={{ background: avatarColor(1) }}>
            {partner ? initials(partner.displayName) : "?"}
          </span>
        </div>
        <p>YOU BOTH PICKED IT</p>
        <h1>It’s a match.</h1>
        <div className="celebration-poster"><span>{item.kind === "activity" ? <Compass size={42} /> : <Film size={42} />}</span><img src={item.image} alt="" onError={imageFallback} /></div>
        <h2>{item.title}</h2>
        <button className="primary-button" onClick={onPlan}>
          <CalendarDays size={17} /> Plan it together
        </button>
        <button className="text-button" onClick={onClose}>
          Keep swiping
        </button>
      </section>
    </div>
  );
}

function AccountSheet({
  mode,
  identity,
  onClose,
  onSignedOut,
}: {
  mode: "signup" | "signin" | "manage";
  identity: CloudIdentity | null;
  onClose: () => void;
  onSignedOut: () => void;
}) {
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
      else if (mode === "signup") await sendCloudSignUpLink(email, redirectTo);
      else await sendCloudSignInLink(email, redirectTo);
      setSent(true);
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "We could not send the email.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await signOutCloudAccount();
      onSignedOut();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Could not sign out.",
      );
      setBusy(false);
    }
  }

  const permanent =
    mode === "manage" && Boolean(identity && !identity.isAnonymous);
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="bottom-sheet account-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="sheet-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        {sent ? (
          <div className="email-sent">
            <span>
              <Mail size={27} />
            </span>
            <p>CHECK YOUR EMAIL</p>
            <h2>One tap and you’re set.</h2>
            <small>
              We sent a secure link to <strong>{email}</strong>. Open it on this
              device to finish.
            </small>
            <button className="primary-button" onClick={onClose}>
              Done
            </button>
          </div>
        ) : permanent ? (
          <div className="account-manage">
            <span>
              <ShieldCheck size={27} />
            </span>
            <p>YOUR ACCOUNT</p>
            <h2>You’re safely signed in.</h2>
            <small>
              Your lists and votes can be restored with{" "}
              <strong>{identity?.email}</strong>.
            </small>
            <button
              className="outline-button sign-out"
              disabled={busy}
              onClick={signOut}
            >
              <LogOut size={16} /> Sign out
            </button>
            {message && <div className="form-message">{message}</div>}
          </div>
        ) : (
          <div className="account-form">
            <span>
              <Mail size={27} />
            </span>
            <p>{securing ? "SAVE YOUR PROGRESS" : mode === "signup" ? "CREATE YOUR ACCOUNT" : "WELCOME BACK"}</p>
            <h2>
              {securing ? "Secure your account." : mode === "signup" ? "Start with your email." : "Sign in to ReelTogether."}
            </h2>
            <small>
              {securing
                ? "Link an email without losing this list or any of your votes."
                : mode === "signup"
                  ? "We’ll create your account with a secure email link—no password needed."
                  : "We’ll email you a secure sign-in link—no password needed."}
            </small>
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <button
              className="primary-button"
              disabled={busy || !email.includes("@")}
              onClick={submit}
            >
              {busy
                ? "Sending…"
                : securing
                  ? "Secure my account"
                  : mode === "signup"
                    ? "Create my account"
                    : "Email me a sign-in link"}
            </button>
            {message && <div className="form-message">{message}</div>}
          </div>
        )}
      </section>
    </div>
  );
}

function AddActivitySheet({
  onSave,
  onClose,
}: {
  onSave: (item: ActivityItem) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("Something ours");
  const [budget, setBudget] = useState<ActivityItem["budget"]>("€");
  const [duration, setDuration] = useState("2h");
  const [location, setLocation] = useState("To decide together");
  function submit() {
    if (title.trim().length < 2) return;
    const image = activityCatalog[Math.abs(title.length) % activityCatalog.length]?.image ?? "";
    onSave({
      id: `custom-${crypto.randomUUID()}`,
      kind: "activity",
      title: title.trim().slice(0, 70),
      category: category.trim().slice(0, 32) || "Something ours",
      budget,
      duration: duration.trim().slice(0, 20) || "Flexible",
      distanceKm: 0,
      location: location.trim().slice(0, 60) || "To decide together",
      vibes: ["Made by you"],
      image,
      summary: summary.trim().slice(0, 240) || "A custom idea for the two of you.",
      custom: true,
    });
  }
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section className="bottom-sheet custom-activity-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <span className="sheet-icon"><Plus size={25} /></span>
        <p>ADD FOR BOTH OF YOU</p>
        <h2>Create an activity idea.</h2>
        <label>What should you do?<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Midnight dessert crawl" /></label>
        <label>Why it sounds good<textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Three places, one dessert at each…" /></label>
        <div className="form-grid">
          <label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} /></label>
          <label>Duration<input value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
        </div>
        <label>Place<input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
        <FilterGroup title="Budget" values={filterOptions.budgets} selected={[budget]} onToggle={(value) => setBudget(value as ActivityItem["budget"])} />
        <button className="primary-button" disabled={title.trim().length < 2} onClick={submit}>Add to your shared deck</button>
      </section>
    </div>
  );
}

function InstallSheet({ onClose }: { onClose: () => void }) {
  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="bottom-sheet install-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="sheet-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <img
          src={`${basePath}/icons/apple-touch-icon.png`}
          alt="ReelTogether app icon"
        />
        <p>INSTALL REELTOGETHER</p>
        <h2>
          {isIOS ? "Add it to your iPhone" : "Add it to your Home Screen"}
        </h2>
        <div className="install-steps">
          {isIOS ? (
            <>
              <div>
                <b>1</b>
                <span>
                  Open this page in <strong>Safari</strong>
                </span>
              </div>
              <div>
                <b>2</b>
                <span>
                  Tap{" "}
                  <strong>
                    Share <Share2 size={15} />
                  </strong>
                </span>
              </div>
              <div>
                <b>3</b>
                <span>
                  Choose{" "}
                  <strong>
                    Add to Home Screen <Plus size={15} />
                  </strong>
                </span>
              </div>
            </>
          ) : (
            <>
              <div>
                <b>1</b>
                <span>Open your browser’s menu</span>
              </div>
              <div>
                <b>2</b>
                <span>
                  Choose{" "}
                  <strong>
                    Install app <Download size={15} />
                  </strong>{" "}
                  or <strong>Add to Home Screen</strong>
                </span>
              </div>
              <div>
                <b>3</b>
                <span>Confirm the installation</span>
              </div>
            </>
          )}
        </div>
        {isIOS && (
          <p className="install-note">
            Apple requires these final taps—the app cannot add itself
            automatically.
          </p>
        )}
        <button className="primary-button" onClick={onClose}>
          Got it
        </button>
      </section>
    </div>
  );
}

function FiltersSheet({
  filters,
  deck,
  mediaItems,
  activityItems,
  onClose,
  onSave,
}: {
  filters: DiscoveryFilters;
  deck: Deck;
  mediaItems: MediaItem[];
  activityItems: ActivityItem[];
  onClose: () => void;
  onSave: (filters: DiscoveryFilters) => void;
}) {
  const [draft, setDraft] = useState({ ...filters, region: filters.region || deviceRegion() });
  const mediaOptions = {
    genres: [...new Set([...filterOptions.genres, ...mediaItems.flatMap((item) => item.genres)])].sort(),
    languages: [...new Set([...filterOptions.languages, ...mediaItems.map((item) => item.language)])].sort(),
    providers: [...new Set([...filterOptions.providers, ...mediaItems.flatMap((item) => item.providers)])].sort(),
  };
  const activityCategories = [...new Set([...filterOptions.activityCategories, ...activityItems.map((item) => item.category)])].sort();
  const toggle = (key: keyof DiscoveryFilters, value: string) =>
    setDraft((current) => {
      const list = current[key] as string[];
      return {
        ...current,
        [key]: list.includes(value)
          ? list.filter((entry) => entry !== value)
          : [...list, value],
      };
    });
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="bottom-sheet filters-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p>SHARED FOR EVERYONE</p>
            <h2>Discovery filters</h2>
          </div>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {deck === "watch" ? (
          <>
            <FilterGroup
              title="Country for streaming"
              values={[...new Set([draft.region, "US", "GB", "IN", "CA", "AU", "DE", "FR", "ES", "IT", "NL", "SE", "NO", "DK", "BR", "MX", "JP", "KR", "SG", "NZ"])]}
              selected={[draft.region]}
              onToggle={(value) => setDraft({ ...draft, region: value })}
              labels={Object.fromEntries([...new Set([draft.region, "US", "GB", "IN", "CA", "AU", "DE", "FR", "ES", "IT", "NL", "SE", "NO", "DK", "BR", "MX", "JP", "KR", "SG", "NZ"])].map((region) => [region, regionName(region)]))}
            />
            <FilterGroup
              title="Type"
              values={["movie", "show"]}
              selected={draft.mediaKinds}
              onToggle={(value) => toggle("mediaKinds", value)}
              labels={{ movie: "Movies", show: "Shows" }}
            />
            <FilterGroup
              title="Genre"
              values={mediaOptions.genres}
              selected={draft.genres}
              onToggle={(value) => toggle("genres", value)}
            />
            <FilterGroup
              title="Language"
              values={mediaOptions.languages}
              selected={draft.languages}
              onToggle={(value) => toggle("languages", value)}
            />
            <FilterGroup
              title="Streaming on"
              values={mediaOptions.providers}
              selected={draft.providers}
              onToggle={(value) => toggle("providers", value)}
            />
          </>
        ) : (
          <>
            <FilterGroup
              title="Category"
              values={activityCategories}
              selected={draft.activityCategories}
              onToggle={(value) => toggle("activityCategories", value)}
            />
            <FilterGroup
              title="Budget"
              values={filterOptions.budgets}
              selected={draft.budgets}
              onToggle={(value) => toggle("budgets", value)}
            />
            <label className="range-control">
              <span>
                Maximum distance <b>{draft.maxDistanceKm} km</b>
              </span>
              <input
                type="range"
                min="3"
                max="50"
                step="1"
                value={draft.maxDistanceKm}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    maxDistanceKm: Number(event.target.value),
                  })
                }
              />
            </label>
          </>
        )}
        <button
          className={`hide-completed-toggle ${draft.hideCompleted ? "selected" : ""}`}
          onClick={() => setDraft({ ...draft, hideCompleted: !draft.hideCompleted })}
        >
          <EyeOff size={17} />
          <span><b>Hide watched and done</b><small>Applies to both people</small></span>
          <i>{draft.hideCompleted ? <Check size={13} /> : null}</i>
        </button>
        <div className="sheet-actions">
          <button onClick={() => setDraft(deviceFilters())}>Reset</button>
          <button className="primary-button" onClick={() => onSave(draft)}>
            Apply for everyone
          </button>
        </div>
      </section>
    </div>
  );
}

function FilterGroup({
  title,
  values,
  selected,
  onToggle,
  labels = {},
}: {
  title: string;
  values: readonly string[];
  selected: readonly string[];
  onToggle: (value: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <div className="filter-group">
      <h3>{title}</h3>
      <div>
        {values.map((value) => (
          <button
            className={selected.includes(value) ? "selected" : ""}
            key={value}
            onClick={() => onToggle(value)}
          >
            {selected.includes(value) && <Check size={13} />}
            {labels[value] ?? value}
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailSheet({
  item,
  isMatch,
  onPlan,
  onRate,
  onClose,
}: {
  item: Item;
  isMatch: boolean;
  onPlan: () => void;
  onRate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="bottom-sheet detail-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="sheet-close" onClick={onClose} aria-label="Close details">
          <X size={20} />
        </button>
        <img src={item.image} alt="" onError={imageFallback} />
        <div>
          <span>
            {item.kind === "activity"
              ? item.category
              : item.kind === "movie"
                ? "MOVIE"
                : "SERIES"}
          </span>
          <h2>{item.title}</h2>
          <p>{item.summary}</p>
          {item.kind === "activity" ? (
            <ul>
              <li>
                <Euro size={16} />
                {item.budget}
              </li>
              <li>
                <Clock3 size={16} />
                {item.duration}
              </li>
              <li>
                <MapPin size={16} />
                {item.location} · {item.distanceKm} km
              </li>
            </ul>
          ) : (
            <ul>
              <li>
                <Star size={16} />
                {item.rating} · {item.year}
              </li>
              <li>
                <Film size={16} />
                {item.genres.join(" · ")}
              </li>
              <li>
                <MonitorPlay size={16} />
                {item.providers.length ? `Available on ${item.providers.join(" · ")}` : "Check regional availability"}
              </li>
            </ul>
          )}
          {item.kind !== "activity" && item.watchLink && (
            <a className="watch-link" href={item.watchLink} target="_blank" rel="noreferrer">
              <Globe2 size={16} /> See where to watch
            </a>
          )}
          {isMatch && (
            <div className="detail-actions">
              <button className="primary-button" onClick={onPlan}>
                <CalendarDays size={16} /> Plan together
              </button>
              <button className="outline-button" onClick={onRate}>
                <Trophy size={16} /> We did this
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function TabBar({
  view,
  matchCount,
  onNavigate,
}: {
  view: View;
  matchCount: number;
  onNavigate: (view: View) => void;
}) {
  const tabs: Array<{ id: View; label: string; icon: React.ReactNode }> = [
    { id: "home", label: "Home", icon: <House /> },
    { id: "discover", label: "Discover", icon: <Compass /> },
    { id: "matches", label: "Matches", icon: <Sparkles /> },
    { id: "lists", label: "Lists", icon: <CircleUserRound /> },
  ];
  return (
    <nav className="tabbar">
      {tabs.map((tab) => (
        <button
          className={view === tab.id ? "active" : ""}
          key={tab.id}
          onClick={() => onNavigate(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
          {tab.id === "matches" && matchCount > 0 && <b>{matchCount}</b>}
        </button>
      ))}
    </nav>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="section-heading">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
  );
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function avatarColor(index: number) {
  return ["#6b50c6", "#38a7a3", "#e79439", "#ec7c72"][index % 4];
}
function activeFilterCount(filters: DiscoveryFilters) {
  return (
    filters.genres.length +
    filters.languages.length +
    filters.providers.length +
    filters.mediaKinds.length +
    filters.activityCategories.length +
    filters.budgets.length +
    (filters.maxDistanceKm < 25 ? 1 : 0) +
    (filters.hideCompleted ? 1 : 0)
  );
}
function regionName(region: string) {
  try {
    return new Intl.DisplayNames([navigator.language], { type: "region" }).of(region) ?? region;
  } catch {
    return region;
  }
}
function latestEvent(events: PairEvent[], type: PairEventType, userId: string) {
  return events
    .filter((event) => event.type === type && event.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}
function findItem(itemId: string, kind: PairEvent["kind"], catalog: Item[]): Item | undefined {
  return catalog.find(
    (item) => item.id === itemId && item.kind === kind,
  );
}
function dedupeEvents(events: PairEvent[]) {
  const seen = new Set<string>();
  return [...events]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((event) => {
      const key = `${event.kind}:${event.itemId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
function uniqueItemsForEvents(events: PairEvent[], catalog: Item[]) {
  return dedupeEvents(events)
    .map((event) => findItem(event.itemId, event.kind, catalog))
    .filter((item): item is Item => Boolean(item));
}
function dedupeItems<T extends Item>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function averageRating(events: PairEvent[]) {
  const ratings = events.map((event) => Number(event.payload.rating)).filter(Number.isFinite);
  return ratings.length ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1) : "—";
}
