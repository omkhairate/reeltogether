"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
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
  Gift,
  Globe2,
  House,
  Heart,
  Info,
  ListFilter,
  Link2,
  LogOut,
  Mail,
  MapPin,
  MonitorPlay,
  Palette,
  Plus,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  Trophy,
  Crown,
  Trash2,
  Users,
  Zap,
  X,
} from "lucide-react";
import { activityCatalog, filterOptions, mediaCatalog } from "@/lib/catalog";
import { classifyAuthIssue, normalizeOtp, resendSeconds } from "@/lib/auth-flow";
import {
  cloudConfigured,
  createCloudList,
  deleteCloudAccount,
  enableCloudNotifications,
  ensureCloudUser,
  fetchCloudCatalog,
  getCloudIdentity,
  joinCloudList,
  loadCloudSnapshot,
  listCloudAccounts,
  claimCloudAccountTransfer,
  prepareCloudAccountTransfer,
  restoreCloudAccount,
  restoreCloudList,
  saveCloudCustomActivity,
  saveCloudPairEvent,
  saveCloudVote,
  secureCloudAccount,
  resendCloudEmailChange,
  sendCloudSignInLink,
  sendCloudSignUpLink,
  signOutCloudAccount,
  subscribeToCloudAuth,
  subscribeToCloudList,
  notifyCloudPartner,
  updateCloudList,
  updateCloudDisplayName,
  verifyCloudOtp,
  type CloudIdentity,
  type CloudListSummary,
} from "@/lib/sync";
import {
  defaultFilters,
  type ActivityItem,
  type ContentKind,
  type CustomCollection,
  type DiscoveryFilters,
  type MediaItem,
  type PairEvent,
  type PairEventType,
  type ReactionType,
  type SessionSnapshot,
  type SharedList,
  type VoteDecision,
} from "@/lib/types";

type View = "home" | "discover" | "matches" | "lists";
type Deck = "watch" | "activities";
type Item = MediaItem | ActivityItem;
type PendingSetup = { name: string; listName: string; inviteCode: string };
type AuthIntent = {
  mode: "signup" | "signin" | "secure";
  email: string;
  sentAt: number;
  setup?: PendingSetup;
  listId?: string;
  listName?: string;
  transferToken?: string;
};
type CollectionSelection =
  | { type: "smart"; kind: ContentKind }
  | { type: "custom"; id: string };

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "reeltogether.session.v2";
const PENDING_SETUP_KEY = "reeltogether.pending-setup.v1";
const AUTH_INTENT_KEY = "reeltogether.auth-intent.v1";
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
function inviteErrorMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : "";
  const normalized = message.toLowerCase();
  if (normalized.includes("pair is already complete"))
    return "This shared space already has its two people. Ask your friend for a new invite if this doesn’t look right.";
  if (normalized.includes("invalid") || normalized.includes("uuid"))
    return "This invite link doesn’t look valid. Ask your friend to share it again from ReelTogether.";
  return message || "We couldn’t join the shared space. Please try the invite again.";
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
      collections: [],
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
  const [pendingSetup, setPendingSetup] = useState<PendingSetup | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [identity, setIdentity] = useState<CloudIdentity | null>(null);
  const [cloudLists, setCloudLists] = useState<CloudListSummary[]>([]);
  const [authStatus, setAuthStatus] = useState<"ready" | "restoring" | "joining" | "error">("ready");
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
  const [showAddIdea, setShowAddIdea] = useState(false);
  const [showTaste, setShowTaste] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [showPersonalize, setShowPersonalize] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showPairWelcome, setShowPairWelcome] = useState(false);
  const [accountReturn, setAccountReturn] = useState<{ listId: string; listName: string } | null>(null);
  const [collectionSelection, setCollectionSelection] = useState<CollectionSelection | null>(null);
  const [collectionEditor, setCollectionEditor] = useState<CustomCollection | "new" | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const finishVerifiedAuth = useCallback(async (intent: AuthIntent) => {
    setAuthStatus(intent.setup?.inviteCode ? "joining" : "restoring");
    setError("");
    try {
      const currentIdentity = await getCloudIdentity();
      if (!currentIdentity) throw new Error("Verification finished, but no session was returned. Please try signing in once more.");
      setIdentity(currentIdentity);

      let exactListId = intent.listId;
      if (intent.transferToken) {
        exactListId = await claimCloudAccountTransfer(intent.transferToken);
      }

      let next: SessionSnapshot | null = exactListId
        ? await restoreCloudList(exactListId)
        : null;
      if (!next && intent.setup) {
        const user = await ensureCloudUser(intent.setup.name);
        if (intent.setup.inviteCode) {
          const listId = await joinCloudList(intent.setup.inviteCode);
          next = await loadCloudSnapshot(user, listId);
          setShowPairWelcome(true);
        } else {
          // A repeated verification can never create duplicate lists: always
          // restore an existing membership before creating the first one.
          next = await restoreCloudAccount();
          if (!next) {
            const listId = await createCloudList(
              user,
              intent.setup.listName || "Our shared list",
              deviceFilters(),
            );
            next = await loadCloudSnapshot(user, listId);
          }
        }
      }
      if (!next) next = await restoreCloudAccount();
      if (!next) throw new Error("Your account is ready, but it does not have a shared list yet.");

      setSession(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      localStorage.removeItem(PENDING_SETUP_KEY);
      localStorage.removeItem(AUTH_INTENT_KEY);
      history.replaceState({}, "", window.location.pathname);
      setShowAccount(false);
      setAccountReturn(null);
      notify(intent.mode === "secure" ? "Account secured — everything stayed together" : "Welcome back");
      setAuthStatus("ready");
    } catch (reason) {
      console.error(reason);
      setAuthStatus("error");
      throw reason;
    }
  }, [notify]);

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
      const urlParams = new URLSearchParams(window.location.search);
      const setupFromUrl = urlParams.get("setup");
      const securedReturn = urlParams.get("secured") === "1";
      const returnListId = urlParams.get("returnList") ?? "";
      const returnListName = urlParams.get("returnName") ?? "your shared list";
      const setupValue = setupFromUrl ?? localStorage.getItem(PENDING_SETUP_KEY);
      let pending: PendingSetup | null = null;
      if (setupValue) {
        try {
          const candidate = JSON.parse(setupValue) as PendingSetup;
          if (candidate.name?.trim().length >= 2) pending = candidate;
        } catch {
          localStorage.removeItem(PENDING_SETUP_KEY);
        }
      }
      let parsed: SessionSnapshot | null = null;
      if (saved) {
        try {
          parsed = JSON.parse(saved) as SessionSnapshot;
          if (!parsed.events) parsed.events = [];
          if (!parsed.savedItems) parsed.savedItems = [];
          if (!parsed.list.collections) parsed.list.collections = [];
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
          if (parsed) {
            // A temporary auth/network failure must never erase the last local
            // copy of a guest or secured shared space. Cloud writes will resume
            // when Supabase restores its persisted session.
            setSession(parsed);
            setError("We couldn’t verify syncing just now. Your shared space is still safely visible on this device.");
          } else if (securedReturn) {
            setAccountReturn({ listId: returnListId, listName: returnListName });
          }
          return;
        }
        if (securedReturn && returnListId) {
          try {
            const restoredList = await restoreCloudList(returnListId);
            if (!restoredList) throw new Error("The shared list could not be restored.");
            setSession(restoredList);
            setAccountReturn(null);
            localStorage.removeItem(PENDING_SETUP_KEY);
            localStorage.removeItem(AUTH_INTENT_KEY);
            history.replaceState({}, "", window.location.pathname);
            notify("Account secured — your shared list is safe");
          } catch (reason) {
            console.error(reason);
            setSession(null);
            localStorage.removeItem(STORAGE_KEY);
            setAccountReturn({ listId: returnListId, listName: returnListName });
          }
        } else if (pending?.inviteCode) {
          const user = await ensureCloudUser(pending.name);
          const listId = await joinCloudList(pending.inviteCode);
          setSession(await loadCloudSnapshot(user, listId));
          setShowPairWelcome(true);
          localStorage.removeItem(PENDING_SETUP_KEY);
          localStorage.removeItem(AUTH_INTENT_KEY);
          history.replaceState({}, "", window.location.pathname);
        } else if (parsed && parsed.user.id === currentIdentity.id) {
          setSession(await loadCloudSnapshot(parsed.user, parsed.list.id));
          localStorage.removeItem(PENDING_SETUP_KEY);
          localStorage.removeItem(AUTH_INTENT_KEY);
        } else {
          const restored = await restoreCloudAccount();
          if (restored) {
            setSession(restored);
            localStorage.removeItem(PENDING_SETUP_KEY);
            localStorage.removeItem(AUTH_INTENT_KEY);
          } else if (pending) {
            const user = await ensureCloudUser(pending.name);
            const listId = await createCloudList(user, pending.listName || "Our shared list", deviceFilters());
            setSession(await loadCloudSnapshot(user, listId));
            localStorage.removeItem(PENDING_SETUP_KEY);
            localStorage.removeItem(AUTH_INTENT_KEY);
            history.replaceState({}, "", window.location.pathname);
          } else {
            setSession(null);
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch (reason) {
        console.error(reason);
        if (parsed) {
          setSession(parsed);
          setError("Syncing is temporarily unavailable. Nothing was removed; we’ll reconnect on your next refresh.");
        } else if (pending?.inviteCode) setError(inviteErrorMessage(reason));
      } finally {
        setLoading(false);
      }
    }
    void restore();
  }, [notify]);

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
    if (!cloudConfigured) return;
    return subscribeToCloudAuth((event, nextIdentity) => {
      setIdentity(nextIdentity);
      if (event === "SIGNED_OUT") {
        localStorage.removeItem(STORAGE_KEY);
        setCloudLists([]);
        setSession(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!cloudConfigured || !identity || !session) {
      if (!identity) setCloudLists([]);
      return;
    }
    let cancelled = false;
    void listCloudAccounts()
      .then((lists) => {
        if (!cancelled) setCloudLists(lists);
      })
      .catch((reason) => console.error(reason));
    return () => { cancelled = true; };
  }, [identity?.id, session?.list.id]);

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
      setShowAddIdea(false);
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
  const sharedServices = useMemo(() => {
    if (!session) return [] as string[];
    const profiles = session.members
      .map((member) => latestEvent(session.events, "services", member.id))
      .filter((event): event is PairEvent => Boolean(event))
      .map((event) => String(event.payload.providers ?? "").split("|").filter(Boolean));
    if (profiles.length < 2) return [];
    const first = profiles[0];
    if (!first) return [];
    return first.filter((provider) => profiles.every((set) => set.includes(provider)));
  }, [session]);

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
        (!filters.mediaKinds.length || filters.mediaKinds.includes(item.kind)) &&
        (!sharedServices.length || sharedServices.some((provider) => item.providers.includes(provider))),
    );
  }, [session, mediaItems, sharedServices]);

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

  async function castVote(
    item: Item,
    decision: VoteDecision,
    beforeSnapshot?: Promise<unknown>,
  ) {
    if (!session) return;
    const vote = {
      userId: session.user.id,
      itemId: item.id,
      kind: item.kind as ContentKind,
      decision,
    };
    const wasMatched = matches.some(
      (match) => itemKey(match) === itemKey(item),
    );
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
        // Reactions and their underlying vote are one user gesture. Wait for
        // the reaction write before taking the authoritative snapshot so the
        // optimistic UI cannot be rolled back by a racing refresh.
        if (beforeSnapshot) await beforeSnapshot;
        const latest = await loadCloudSnapshot(session.user, session.list.id);
        setSession(latest);
        const currentItemMatched = isItemMatched(item, latest);
        if (!instantMatch && !wasMatched && currentItemMatched) {
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

  async function reactToItem(item: Item, reaction: ReactionType) {
    if (!session) return;
    if (reaction === "golden") {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const used = session.events.some(
        (event) =>
          event.type === "reaction" &&
          event.userId === session.user.id &&
          event.payload.reaction === "golden" &&
          new Date(event.updatedAt).getTime() > weekAgo,
      );
      if (used) {
        notify("Your next Golden Pick unlocks seven days after the last one");
        return;
      }
    }
    const eventWrites: Promise<unknown>[] = [
      addPairEvent("reaction", item, { reaction }),
    ];
    if (reaction === "already") {
      eventWrites.push(addPairEvent("complete", item, { source: "already" }));
      await castVote(item, "pass", Promise.all(eventWrites));
      notify("Added to your shared history");
      return;
    }
    await castVote(
      item,
      reaction === "not-tonight" ? "pass" : "pick",
      Promise.all(eventWrites),
    );
    const copy: Record<ReactionType, string> = {
      absolutely: "Absolutely — that one felt right",
      maybe: "Saved as maybe-with-you",
      "not-tonight": "Not tonight — passed for this list",
      already: "Added to history",
      golden: "Golden Pick used — excellent commitment",
    };
    notify(copy[reaction]);
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
    const url = new URL(`${window.location.origin}${window.location.pathname}`);
    url.searchParams.set("join", session.list.inviteCode);
    url.searchParams.set("from", session.user.displayName);
    url.searchParams.set("list", session.list.name);
    const shareData = {
      title: `Join ${session.list.name}`,
      text: `${session.user.displayName} saved you a seat in ${session.list.name} — your private place to find things you’ll both love.`,
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
        {accountReturn ? (
          <AccountReturnScreen
            listName={accountReturn.listName}
            onSignIn={() => {
              setPendingSetup(null);
              setAccountMode("signin");
              setShowAccount(true);
            }}
          />
        ) : <Onboarding
          identity={identity}
          onComplete={(next, joined) => {
            setSession(next);
            setShowPairWelcome(joined);
            if (cloudConfigured) void getCloudIdentity().then(setIdentity);
          }}
          onError={setError}
          onInstall={installApp}
          onSignIn={(setup) => {
            setPendingSetup(setup ?? null);
            setAccountMode("signin");
            setShowAccount(true);
          }}
          onCreateAccount={(setup) => {
            setPendingSetup(setup);
            setAccountMode("signup");
            setShowAccount(true);
          }}
          isInstalled={isInstalled}
        />}
        {showInstallHelp && (
          <InstallSheet onClose={() => setShowInstallHelp(false)} />
        )}
        {showAccount && (
          <AccountSheet
            mode={accountMode}
            identity={identity}
            pendingSetup={pendingSetup}
            activeListId={accountReturn?.listId}
            activeListName={accountReturn?.listName}
            authStatus={authStatus}
            onVerified={finishVerifiedAuth}
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
  const activeTheme = [...session.events]
    .filter((event) => event.type === "theme")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.payload.theme ?? "violet";
  return (
    <main className={`app-shell theme-${String(activeTheme)}`}>
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
            onTaste={() => setShowTaste(true)}
            onChallenge={() => setShowChallenge(true)}
            onIdea={() => setShowAddIdea(true)}
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
            onAddIdea={() => setShowAddIdea(true)}
            onReact={reactToItem}
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
            matches={matches}
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
            onOpenCollection={setCollectionSelection}
            onNewCollection={() => setCollectionEditor("new")}
            availableLists={cloudLists}
            onSwitchList={(listId) => {
              if (listId === session.list.id) return;
              setAuthStatus("restoring");
              void restoreCloudList(listId)
                .then((next) => {
                  if (!next) throw new Error("That shared space could not be opened.");
                  setSession(next);
                  setView("home");
                  notify(`Opened ${next.list.name}`);
                  setAuthStatus("ready");
                })
                .catch((reason) => {
                  setAuthStatus("error");
                  setError(reason instanceof Error ? reason.message : "Could not switch lists.");
                });
            }}
            onPersonalize={() => setShowPersonalize(true)}
          />
        )}
      </div>
      <TabBar view={view} matchCount={matches.length} onNavigate={setView} />
      {showPairWelcome && (
        <PairWelcome
          session={session}
          secured={Boolean(identity && !identity.isAnonymous)}
          onStart={() => {
            setShowPairWelcome(false);
            setView("discover");
          }}
          onSecure={() => {
            void getCloudIdentity().then((current) => {
              setIdentity(current);
              setShowPairWelcome(false);
              setAccountMode("manage");
              setShowAccount(true);
            });
          }}
        />
      )}
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
          activeListId={session.list.id}
          activeListName={session.list.name}
          displayName={session.user.displayName}
          authStatus={authStatus}
          onVerified={finishVerifiedAuth}
          onProfileUpdated={(name) => {
            setSession((current) => current ? {
              ...current,
              user: { ...current.user, displayName: name },
              members: current.members.map((member) =>
                member.id === current.user.id ? { ...member, displayName: name } : member,
              ),
            } : current);
          }}
          onClose={() => setShowAccount(false)}
          onSignedOut={() => {
            localStorage.removeItem(STORAGE_KEY);
            setIdentity(null);
            setSession(null);
            setShowAccount(false);
          }}
        />
      )}
      {collectionSelection && (
        <CollectionDetailSheet
          selection={collectionSelection}
          collections={session.list.collections}
          matches={matches}
          events={session.events}
          onClose={() => setCollectionSelection(null)}
          onEdit={(collection) => {
            setCollectionSelection(null);
            setCollectionEditor(collection);
          }}
          onDetail={(item) => {
            setCollectionSelection(null);
            setDetail(item);
          }}
        />
      )}
      {collectionEditor && (
        <CollectionEditorSheet
          initial={collectionEditor === "new" ? null : collectionEditor}
          matches={matches}
          onClose={() => setCollectionEditor(null)}
          onSave={(draft) => {
            const next: CustomCollection = {
              id: draft.id || crypto.randomUUID(),
              name: draft.name.trim().slice(0, 50),
              deadline: draft.deadline,
              itemKeys: draft.itemKeys,
              createdBy: draft.createdBy || session.user.id,
            };
            const collections = session.list.collections.some((collection) => collection.id === next.id)
              ? session.list.collections.map((collection) => collection.id === next.id ? next : collection)
              : [...session.list.collections, next];
            void changeList({ ...session.list, collections });
            setCollectionEditor(null);
            notify(collectionEditor === "new" ? "Shared sublist created" : "Shared sublist updated");
          }}
          onDelete={collectionEditor === "new" ? undefined : () => {
            void changeList({
              ...session.list,
              collections: session.list.collections.filter((collection) => collection.id !== collectionEditor.id),
            });
            setCollectionEditor(null);
            notify("Sublist removed");
          }}
        />
      )}
      {showTaste && (
        <TasteProfileSheet
          session={session}
          matches={matches}
          onClose={() => setShowTaste(false)}
        />
      )}
      {showChallenge && (
        <ChallengeSheet
          session={session}
          onSave={(payload) => {
            void addPairEvent("challenge", null, payload);
            setShowChallenge(false);
            notify("Challenge added to your shared space");
          }}
          onClose={() => setShowChallenge(false)}
        />
      )}
      {showPersonalize && (
        <PersonalizeSheet
          session={session}
          onSave={(theme, providers) => {
            void addPairEvent("theme", null, { theme });
            void addPairEvent("services", null, { providers: providers.join("|") });
            setShowPersonalize(false);
            notify("Your shared space feels more like you now");
          }}
          onClose={() => setShowPersonalize(false)}
        />
      )}
      {showAddIdea && (
        <AddIdeaSheet
          onSave={(item) => void addCustomActivity(item)}
          onClose={() => setShowAddIdea(false)}
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
          session={session}
          onClose={() => setShowRoulette(false)}
          onNominate={(item) => {
            void addPairEvent("nomination", item, { nominated: true });
            notify("Your secret nomination is in");
          }}
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
          onSave={(payload) => {
            void addPairEvent("complete", rateItem, { happenedAt: String(payload.happenedAt ?? "") });
            void addPairEvent("rating", rateItem, { rating: Number(payload.rating ?? 0) });
            void addPairEvent("memory", rateItem, payload);
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

function AccountReturnScreen({
  listName,
  onSignIn,
}: {
  listName: string;
  onSignIn: () => void;
}) {
  return (
    <main className="onboarding account-return-screen">
      <section className="onboarding-card account-return-card">
        <div className="brand">
          <img src={`${basePath}/icons/brand-mark.png`} alt="" />
          <strong>reeltogether</strong>
        </div>
        <div className="account-return-icon"><ShieldCheck size={30} /></div>
        <div className="onboarding-copy">
          <p>EMAIL CONFIRMED</p>
          <h1>Your shared space is still here.</h1>
          <span>
            Your email is ready. Sign in once to reopen <strong>{listName}</strong> with the same person, picks, and matches.
          </span>
        </div>
        <button className="primary-button" onClick={onSignIn}>
          <Mail size={17} /> Sign in and restore my list
        </button>
        <div className="account-ready-note"><ShieldCheck size={16} /> We won’t create a new list</div>
      </section>
    </main>
  );
}

function Onboarding({
  identity,
  onComplete,
  onError,
  onInstall,
  onSignIn,
  onCreateAccount,
  isInstalled,
}: {
  identity: CloudIdentity | null;
  onComplete: (session: SessionSnapshot, joined: boolean) => void;
  onError: (message: string) => void;
  onInstall: () => void;
  onSignIn: (setup?: PendingSetup) => void;
  onCreateAccount: (setup: PendingSetup) => void;
  isInstalled: boolean;
}) {
  const [name, setName] = useState("");
  const [listName, setListName] = useState("Sunday sofa club");
  const [busy, setBusy] = useState(false);
  const inviteCode =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("join") ?? "");
  const inviteFrom =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("from") ?? "").trim().slice(0, 40);
  const inviteList =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("list") ?? "").trim().slice(0, 60);
  const accountReady = Boolean(identity && !identity.isAnonymous);

  async function submit() {
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      if (!cloudConfigured) {
        onComplete(
          createLocalSession(name.trim(), listName.trim() || "Our shared list"),
          false,
        );
        return;
      }
      const user = await ensureCloudUser(name.trim());
      let next: SessionSnapshot | null = null;
      if (inviteCode) {
        const listId = await joinCloudList(inviteCode);
        next = await loadCloudSnapshot(user, listId);
      } else {
        next = await restoreCloudAccount();
        if (!next) {
          const listId = await createCloudList(user, listName.trim() || "Our shared list", deviceFilters());
          next = await loadCloudSnapshot(user, listId);
        }
      }
      onComplete(next, Boolean(inviteCode));
      localStorage.removeItem(PENDING_SETUP_KEY);
      history.replaceState({}, "", window.location.pathname);
    } catch (reason) {
      onError(
        inviteCode
          ? inviteErrorMessage(reason)
          : reason instanceof Error
            ? reason.message
            : "Could not get your shared list ready.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding">
      <section className={`onboarding-card ${inviteCode ? "invite-onboarding-card" : ""}`}>
        <div className="brand">
          <img src={`${basePath}/icons/brand-mark.png`} alt="" />
          <strong>reeltogether</strong>
        </div>
        {inviteCode ? (
          <div className="invite-welcome">
            <div className="invite-pair" aria-hidden="true">
              <span>{initials(inviteFrom || "Your person")}</span>
              <i><Sparkles size={17} /></i>
              <span>YOU</span>
            </div>
            <p>A PRIVATE INVITE</p>
            <h1>{inviteFrom ? `${inviteFrom} saved you a seat.` : "Someone saved you a seat."}</h1>
            <span>
              Join <strong>{inviteList || "your shared list"}</strong>—a small space for the two of you to find what to watch and do next.
            </span>
            <div className="invite-promises">
              <span><EyeOff size={15} /> Your picks stay private</span>
              <span><Sparkles size={15} /> Shared picks become matches</span>
            </div>
          </div>
        ) : (
          <div className="onboarding-copy">
            <p>{accountReady ? "ACCOUNT READY" : "PICK TOGETHER"}</p>
            <h1>{accountReady ? "Finish your setup." : "Decide what’s next."}</h1>
            <span>
              {accountReady
                ? `You’re signed in as ${identity?.email}. Add your name and create the first shared list.`
                : "Swipe films, shows, and things to do privately. When you both choose the same idea, it becomes a match."}
            </span>
          </div>
        )}
        <label>
          {inviteCode && inviteFrom ? `What should ${inviteFrom} call you?` : "Your name"}
          <input
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={inviteCode ? "Your nickname" : "What should your friend see?"}
            autoFocus={Boolean(inviteCode)}
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
              ? `Join ${inviteFrom || "your person"}`
              : accountReady
                ? "Finish setup"
                : "Continue as guest"}
        </button>
        {cloudConfigured && !accountReady && (
          <small className="guest-explainer">
            {inviteCode
              ? "Join instantly; add your email later without leaving this list."
              : "Start instantly on this device, or use email below for recovery across devices."}
          </small>
        )}
        {accountReady && (
          <div className="account-ready-note"><ShieldCheck size={16} /> Account created successfully</div>
        )}
        {cloudConfigured && !accountReady && (
          <div className={`account-choices ${inviteCode ? "invite-account-choices" : ""}`}>
            <button className="account-create" onClick={() => {
              if (name.trim().length < 2) {
                onError("Add your name first so we can finish your account after the email code.");
                return;
              }
              onCreateAccount({
                name: name.trim(),
                listName: inviteCode
                  ? inviteList || "Our shared list"
                  : listName.trim() || "Our shared list",
                inviteCode,
              });
            }}>
              <CircleUserRound size={17} /> Use email instead
            </button>
            <button className="account-shortcut" onClick={() => {
              if (inviteCode && name.trim().length < 2) {
                onError(`Add the name ${inviteFrom || "your friend"} should see first.`);
                return;
              }
              onSignIn(inviteCode ? {
                name: name.trim(),
                listName: inviteList || "Our shared list",
                inviteCode,
              } : undefined);
            }}>
              {inviteCode ? "Already have ReelTogether?" : "Already have one?"} <strong>Sign in</strong>
            </button>
          </div>
        )}
        {!isInstalled && !inviteCode && (
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

function PairWelcome({
  session,
  secured,
  onStart,
  onSecure,
}: {
  session: SessionSnapshot;
  secured: boolean;
  onStart: () => void;
  onSecure: () => void;
}) {
  const friend = session.members.find((member) => member.id !== session.user.id);
  return (
    <div className="pair-welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="pair-welcome-title">
      <section className="pair-welcome-card">
        <div className="welcome-sparkles" aria-hidden="true">
          <Sparkles size={18} />
          <Sparkles size={12} />
          <Sparkles size={15} />
        </div>
        <div className="connected-pair" aria-hidden="true">
          <span>{initials(friend?.displayName || "Friend")}</span>
          <i><Check size={18} /></i>
          <span>{initials(session.user.displayName)}</span>
        </div>
        <p>YOU’RE IN</p>
        <h2 id="pair-welcome-title">
          {friend ? `${friend.displayName} + ${session.user.displayName}` : "Your shared space is ready"}
        </h2>
        <strong>Welcome to {session.list.name}.</strong>
        <span>
          Pick honestly—your choices stay hidden until you both choose the same thing. Then it’s a match.
        </span>
        <div className="welcome-actions">
          <button className="primary-button" onClick={onStart}>
            <Sparkles size={17} /> Start picking together
          </button>
          {!secured && (
            <button className="secure-later-button" onClick={onSecure}>
              <ShieldCheck size={16} /> Keep my spot safe with email
            </button>
          )}
        </div>
      </section>
    </div>
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
  onTaste,
  onChallenge,
  onIdea,
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
  onTaste: () => void;
  onChallenge: () => void;
  onIdea: () => void;
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
  const activeChallenge = [...session.events]
    .filter((event) => event.type === "challenge")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const bothVoted = catalog.filter((item) =>
    session.members.every((member) => session.votes.some((vote) => vote.userId === member.id && vote.itemId === item.id && vote.kind === item.kind)),
  );
  const alignedVotes = bothVoted.filter((item) => {
    const decisions = session.votes.filter((vote) => vote.itemId === item.id && vote.kind === item.kind).map((vote) => vote.decision);
    return new Set(decisions).size === 1;
  }).length;
  const tasteScore = bothVoted.length ? Math.round((alignedVotes / bothVoted.length) * 100) : 0;
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthMemories = session.events.filter((event) => event.type === "complete" && event.updatedAt.startsWith(monthKey)).length;
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
      <div className="experience-grid">
        <button className="taste-tile" onClick={onTaste}>
          <BarChart3 size={19} />
          <span><b>Pair Taste</b><small>{tasteScore ? `${tasteScore}% in sync` : "Still taking shape"}</small></span>
          <ChevronRight size={16} />
        </button>
        <button className="challenge-tile" onClick={onChallenge}>
          <Gift size={19} />
          <span><b>{activeChallenge ? String(activeChallenge.payload.title) : "Pair challenge"}</b><small>{activeChallenge ? "Your current adventure" : "Try something new"}</small></span>
          <ChevronRight size={16} />
        </button>
        <button className="idea-tile" onClick={onIdea}>
          <Link2 size={19} />
          <span><b>Drop an idea</b><small>Link, place, or passing thought</small></span>
          <Plus size={16} />
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
      <section className="monthly-recap">
        <div><Sparkles size={18} /><span><small>THIS MONTH TOGETHER</small><b>{monthMemories ? `${monthMemories} memories made` : "Your next memory starts with one pick"}</b></span></div>
        <p>{matches.length} shared choices · {favoriteGenre ? `${favoriteGenre} is winning` : "taste still unfolding"} · {tasteScore || 0}% decision alignment</p>
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
  onAddIdea,
  onReact,
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
  onAddIdea: () => void;
  onReact: (item: Item, reaction: ReactionType) => void;
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
          <button onClick={onAddIdea} aria-label="Drop an idea"><Link2 size={19} /></button>
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
          onReact={onReact}
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
  onReact,
  onDetail,
}: {
  item: Item;
  onVote: (item: Item, decision: VoteDecision) => void;
  onReact: (item: Item, reaction: ReactionType) => void;
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
      <div className="reaction-strip" aria-label="More ways to react">
        <button onClick={() => onReact(item, "absolutely")}><Heart size={14} /> Absolutely</button>
        <button onClick={() => onReact(item, "maybe")}><Sparkles size={14} /> Maybe with you</button>
        <button onClick={() => onReact(item, "not-tonight")}><Clock3 size={14} /> Not tonight</button>
        <button onClick={() => onReact(item, "already")}><CheckCircle2 size={14} /> Already {item.kind === "activity" ? "done" : "watched"}</button>
        <button className="golden" onClick={() => onReact(item, "golden")}><Crown size={14} /> Golden Pick</button>
      </div>
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
                  <button
                    className="calendar-export"
                    onClick={() => downloadCalendar(item, String(event.payload.when ?? ""), String(event.payload.location ?? ""))}
                    aria-label={`Add ${item.title} to calendar`}
                  >
                    <CalendarDays size={13} /> Calendar
                  </button>
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
              const memory = session.events.find(
                (event) => event.type === "memory" && event.itemId === item.id && event.kind === item.kind,
              );
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => onDetail(item)}
                >
                  <img src={String(memory?.payload.photo || item.image)} alt="" onError={imageFallback} />
                  <b>{item.title}</b>
                  <small>
                    {memory?.payload.note
                      ? `“${String(memory.payload.note)}”`
                      : ratings.length >= 2
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
  matches,
  identity,
  cloud,
  onShare,
  onAccount,
  onInstall,
  isInstalled,
  onReset,
  notificationsEnabled,
  onEnableNotifications,
  onOpenCollection,
  onNewCollection,
  availableLists,
  onSwitchList,
  onPersonalize,
}: {
  session: SessionSnapshot;
  matches: Item[];
  identity: CloudIdentity | null;
  cloud: boolean;
  onShare: () => void;
  onAccount: () => void;
  onInstall: () => void;
  isInstalled: boolean;
  onReset: () => void;
  notificationsEnabled: boolean;
  onEnableNotifications: () => void;
  onOpenCollection: (selection: CollectionSelection) => void;
  onNewCollection: () => void;
  availableLists: CloudListSummary[];
  onSwitchList: (listId: string) => void;
  onPersonalize: () => void;
}) {
  const smartCollections: Array<{
    kind: ContentKind;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    { kind: "movie", title: "Movies", subtitle: "Films you both picked", icon: <Film size={20} /> },
    { kind: "show", title: "TV Shows", subtitle: "Series to start together", icon: <MonitorPlay size={20} /> },
    { kind: "activity", title: "Activities", subtitle: "Things to go and do", icon: <Compass size={20} /> },
  ];
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
      {cloud && availableLists.length > 1 && (
        <section className="space-switcher" aria-label="Your shared spaces">
          <div className="collection-heading">
            <div><p>YOUR SPACES</p><h2>Switch shared list</h2></div>
          </div>
          <div className="space-switcher-list">
            {availableLists.map((list) => (
              <button
                key={list.id}
                className={list.id === session.list.id ? "active" : ""}
                onClick={() => onSwitchList(list.id)}
              >
                <span><Users size={17} /></span>
                <b>{list.name}</b>
                {list.id === session.list.id ? <Check size={17} /> : <ChevronRight size={17} />}
              </button>
            ))}
          </div>
        </section>
      )}
      <button className="personalize-card" onClick={onPersonalize}>
        <span><Palette size={20} /></span>
        <div><b>Make this space yours</b><small>Theme, streaming services, and pair personality</small></div>
        <ChevronRight size={18} />
      </button>
      <section className="collection-section">
        <div className="collection-heading">
          <div>
            <p>SHARED SUBLISTS</p>
            <h2>Keep the good ideas organized</h2>
          </div>
          <button onClick={onNewCollection}><Plus size={16} /> New</button>
        </div>
        <div className="smart-collection-grid">
          {smartCollections.map((collection) => {
            const count = matches.filter((item) => item.kind === collection.kind).length;
            return (
              <button
                key={collection.kind}
                className={`smart-collection ${collection.kind}`}
                onClick={() => onOpenCollection({ type: "smart", kind: collection.kind })}
              >
                <span>{collection.icon}</span>
                <div><b>{collection.title}</b><small>{collection.subtitle}</small></div>
                <strong>{count}</strong>
                <ChevronRight size={16} />
              </button>
            );
          })}
        </div>
        {session.list.collections.length > 0 ? (
          <div className="custom-collection-list">
            {session.list.collections.map((collection) => {
              const items = matches.filter((item) => collection.itemKeys.includes(itemKey(item)));
              const completed = items.filter((item) => isCompletedItem(item, session.events)).length;
              return (
                <button key={collection.id} onClick={() => onOpenCollection({ type: "custom", id: collection.id })}>
                  <span><Bookmark size={18} /></span>
                  <div>
                    <b>{collection.name}</b>
                    <small>{collection.deadline ? `By ${formatDeadline(collection.deadline)}` : "No deadline"} · {completed}/{items.length} done</small>
                  </div>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </div>
        ) : (
          <button className="collection-empty" onClick={onNewCollection}>
            <Sparkles size={18} />
            <span><b>Make a list for a shared goal</b><small>“Before December”, “Rainy weekends”, or anything that feels like you two.</small></span>
            <ChevronRight size={17} />
          </button>
        )}
      </section>
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

function TasteProfileSheet({
  session,
  matches,
  onClose,
}: {
  session: SessionSnapshot;
  matches: Item[];
  onClose: () => void;
}) {
  const partner = session.members.find((member) => member.id !== session.user.id);
  const comparable = new Map<string, VoteDecision[]>();
  session.votes.forEach((vote) => {
    const key = `${vote.kind}:${vote.itemId}`;
    comparable.set(key, [...(comparable.get(key) ?? []), vote.decision]);
  });
  const compared = [...comparable.values()].filter((values) => values.length >= 2);
  const alignment = compared.length
    ? Math.round((compared.filter((values) => new Set(values).size === 1).length / compared.length) * 100)
    : 0;
  const media = matches.filter((item): item is MediaItem => item.kind !== "activity");
  const activities = matches.filter((item): item is ActivityItem => item.kind === "activity");
  const genres = topCounts(media.flatMap((item) => item.genres), 3);
  const vibes = topCounts(activities.flatMap((item) => item.vibes), 3);
  const adventurous = Math.min(100, 35 + activities.length * 8 + new Set(media.map((item) => item.language)).size * 7);
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section className="bottom-sheet taste-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose}><X size={20} /></button>
        <p>YOUR PAIR TASTE</p>
        <h2>{session.user.displayName} + {partner?.displayName ?? "your person"}</h2>
        <div className="taste-score"><strong>{alignment || "—"}{alignment ? "%" : ""}</strong><span><b>decision alignment</b><small>Agreement is lovely; surprising differences make the queue interesting.</small></span></div>
        <div className="taste-spectrum"><span>Comfort</span><i><b style={{ width: `${adventurous}%` }} /></i><span>Adventure</span></div>
        <div className="taste-columns">
          <div><small>STRONGEST OVERLAPS</small>{genres.length ? genres.map(([label, count]) => <span key={label}><b>{label}</b><i>{count}</i></span>) : <p>Keep swiping to reveal your shared genres.</p>}</div>
          <div><small>ACTIVITY ENERGY</small>{vibes.length ? vibes.map(([label, count]) => <span key={label}><b>{label}</b><i>{count}</i></span>) : <p>Your first activity match will shape this.</p>}</div>
        </div>
        <div className="taste-insight"><Sparkles size={18} /><span><b>{media[0] ? `Try more ${genres[0]?.[0] ?? "unexpected"} picks` : "Your taste map is just beginning"}</b><small>Recommendations become more personal as both of you react honestly.</small></span></div>
      </section>
    </div>
  );
}

function ChallengeSheet({ session, onSave, onClose }: {
  session: SessionSnapshot;
  onSave: (payload: PairEvent["payload"]) => void;
  onClose: () => void;
}) {
  const challenges = [
    ["world-tour", "Three countries, three stories", "Match with films from three different countries.", 3],
    ["new-thing", "One new thing this month", "Complete an activity neither of you has tried.", 1],
    ["twenty-euro", "The €20 adventure", "Plan something memorable together for €20 or less.", 1],
    ["mini-series", "Finish a mini-series", "Choose, schedule, and complete one short series.", 1],
    ["your-turn", "Let your person choose", "Use a Golden Pick and commit without negotiation.", 1],
  ] as const;
  const current = [...session.events].filter((event) => event.type === "challenge").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section className="bottom-sheet challenge-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose}><X size={20} /></button>
        <p>A LITTLE SHARED QUEST</p><h2>Choose your next challenge.</h2>
        {current && <div className="current-challenge"><Trophy size={20} /><span><b>{String(current.payload.title)}</b><small>Currently active · {String(current.payload.progress ?? 0)}/{String(current.payload.goal ?? 1)} complete</small></span></div>}
        <div className="challenge-list">{challenges.map(([id, title, description, goal]) => (
          <button key={id} onClick={() => onSave({ id, title, description, goal, progress: 0, startedAt: new Date().toISOString() })}>
            <span><Gift size={18} /></span><div><b>{title}</b><small>{description}</small></div><ChevronRight size={17} />
          </button>
        ))}</div>
      </section>
    </div>
  );
}

function PersonalizeSheet({ session, onSave, onClose }: {
  session: SessionSnapshot;
  onSave: (theme: string, providers: string[]) => void;
  onClose: () => void;
}) {
  const currentTheme = String([...session.events].filter((event) => event.type === "theme").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.payload.theme ?? "violet");
  const myServices = latestEvent(session.events, "services", session.user.id);
  const [theme, setTheme] = useState(currentTheme);
  const [providers, setProviders] = useState(String(myServices?.payload.providers ?? "").split("|").filter(Boolean));
  const options = ["Netflix", "Amazon Prime Video", "Disney Plus", "Apple TV Plus", "Max", "JioHotstar", "MUBI"];
  const toggle = (provider: string) => setProviders((current) => current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider]);
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section className="bottom-sheet personalize-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose}><X size={20} /></button>
        <p>MAKE IT YOURS</p><h2>Your shared-space personality.</h2>
        <h3>Colour mood</h3><div className="theme-picker">{([['violet', 'Violet'], ['ocean', 'Ocean'], ['sunset', 'Sunset'], ['forest', 'Forest']] as const).map(([id,label]) => <button key={id} className={`${id} ${theme === id ? "selected" : ""}`} onClick={() => setTheme(id)}><i />{label}{theme === id && <Check size={13} />}</button>)}</div>
        <h3>Your streaming services</h3><small>When both people add theirs, discovery quietly prioritizes services you share.</small>
        <div className="service-picker">{options.map((provider) => <button key={provider} className={providers.includes(provider) ? "selected" : ""} onClick={() => toggle(provider)}>{providers.includes(provider) && <Check size={12} />}{provider}</button>)}</div>
        <button className="primary-button" onClick={() => onSave(theme, providers)}>Save my side</button>
      </section>
    </div>
  );
}

function AddIdeaSheet({ onSave, onClose }: { onSave: (item: ActivityItem) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("Something ours");
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section className="bottom-sheet idea-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose}><X size={20} /></button>
        <p>SHARED IDEA INBOX</p><h2>Drop it here before you forget.</h2>
        <small>A place, reel, restaurant, screenshot link, or plain passing thought becomes a card for both of you.</small>
        <label>Idea<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Try the tiny ramen place…" maxLength={70} /></label>
        <label><Link2 size={14} /> Optional link<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
        <label>What caught your eye?<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="The sunset view looked unreal" maxLength={220} /></label>
        <label>Kind<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Something ours</option><option>Food & drink</option><option>Outdoors</option><option>Culture</option><option>At home</option><option>Trip idea</option></select></label>
        <button className="primary-button" disabled={title.trim().length < 2} onClick={() => {
          const image = activityCatalog[Math.abs(title.length * 7) % activityCatalog.length]?.image ?? "";
          onSave({ id: `idea-${crypto.randomUUID()}`, kind: "activity", title: title.trim(), category, budget: "€", duration: "To decide", distanceKm: 0, location: "Shared idea inbox", vibes: ["From your person"], image, summary: note.trim() || "Something one of you wanted to remember.", custom: true, ...(url.trim() ? { sourceUrl: url.trim() } : {}) });
        }}><Plus size={17} /> Add for both of us</button>
      </section>
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
  const [weather, setWeather] = useState(String(existing?.payload.weather ?? "Anything"));
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
        <ChoiceRow title="Weather outside" options={["Anything", "Clear", "Rainy", "Too hot", "Too cold"]} value={weather} onChange={setWeather} />
        <button
          className="primary-button"
          onClick={() => onSave({ mood, time, energy, budget, weather })}
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
  session,
  onClose,
  onPlan,
  onNominate,
}: {
  matches: Item[];
  session: SessionSnapshot;
  onClose: () => void;
  onPlan: (item: Item) => void;
  onNominate: (item: Item) => void;
}) {
  const [mode, setMode] = useState<"roulette" | "quick" | "tournament" | "nominate">("roulette");
  const [index, setIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [tournament, setTournament] = useState<Item[]>(() => matches.slice(0, 8));
  const chosen = matches[index % Math.max(1, matches.length)];
  const nominations = session.events.filter((event) => event.type === "nomination");
  const partnerNomination = nominations.find((event) => event.userId !== session.user.id);
  const myNomination = nominations.find((event) => event.userId === session.user.id);
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
  function quickPick() {
    if (!matches.length) return;
    setSpinning(true);
    window.setTimeout(() => {
      setIndex(Math.floor(Math.random() * Math.min(5, matches.length)));
      setSpinning(false);
    }, 650);
  }
  function advanceTournament(winner: Item) {
    const next = [winner, ...tournament.slice(2)];
    setTournament(next);
    if (next.length === 1) setIndex(Math.max(0, matches.findIndex((item) => itemKey(item) === itemKey(winner))));
  }
  const tournamentWinner = tournament[0];
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
        <h2>Choose how you decide.</h2>
        <div className="decision-tabs">
          <button className={mode === "roulette" ? "selected" : ""} onClick={() => setMode("roulette")}>Surprise</button>
          <button className={mode === "quick" ? "selected" : ""} onClick={() => setMode("quick")}>Quick 5</button>
          <button className={mode === "tournament" ? "selected" : ""} onClick={() => setMode("tournament")}>Tournament</button>
          <button className={mode === "nominate" ? "selected" : ""} onClick={() => setMode("nominate")}>One each</button>
        </div>
        {mode === "tournament" && tournament.length > 1 ? (
          <div className="tournament-pair">
            <small>Pick the one that survives this round</small>
            <div>{tournament.slice(0, 2).map((item) => (
              <button key={itemKey(item)} onClick={() => advanceTournament(item)}>
                <img src={item.image} alt="" onError={imageFallback} /><b>{item.title}</b>
              </button>
            ))}</div>
            <span>{tournament.length} contenders left</span>
          </div>
        ) : mode === "nominate" ? (
          <div className="nomination-mode">
            {myNomination ? <><Crown size={26} /><b>Your nomination is locked in.</b><small>{partnerNomination ? "Both choices are ready—reveal them together." : "Waiting for your person. They cannot see yours yet."}</small></> : <><Heart size={25} /><b>Secretly nominate one match</b><small>Your person chooses one too. No awkward persuasion required.</small></>}
            {!myNomination && chosen && <button className="outline-button" onClick={() => onNominate(chosen)}>Nominate {chosen.title}</button>}
            {myNomination && partnerNomination && <div className="nomination-reveal">Two nominations are in. Use Surprise to break the tie.</div>}
          </div>
        ) : chosen ? (
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
          disabled={!matches.length || spinning || mode === "tournament" || mode === "nominate"}
          onClick={mode === "quick" ? quickPick : spin}
        >
          <Dices size={18} /> {spinning ? "Choosing…" : mode === "quick" ? "Pick from five" : "Spin again"}
        </button>
        {chosen && !spinning && mode !== "tournament" && mode !== "nominate" && (
          <button className="outline-button" onClick={() => onPlan(chosen)}>
            That’s the one—plan it
          </button>
        )}
        {mode === "tournament" && tournamentWinner && (
          <button className="outline-button" onClick={() => onPlan(tournamentWinner)}>
            Winner: {tournamentWinner.title} — plan it
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
  const [location, setLocation] = useState(item.kind === "activity" ? item.location : "At home");
  const [owner, setOwner] = useState("Decide together");
  const [note, setNote] = useState("");
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
        <label>
          Where
          <input placeholder="At home, the cinema, a place…" value={location} onChange={(event) => setLocation(event.target.value)} />
        </label>
        <label>
          Who takes the lead?
          <select value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option>Decide together</option>
            <option>I’ll arrange it</option>
            <option>My person arranges it</option>
          </select>
        </label>
        <label>
          Tiny note
          <input placeholder="Snacks, tickets, what to bring…" value={note} onChange={(event) => setNote(event.target.value)} />
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
          onClick={() => onSave({ when, location, owner, note })}
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
  onSave: (payload: PairEvent["payload"]) => void;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [happenedAt, setHappenedAt] = useState(new Date().toISOString().slice(0, 10));
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
        <label>Date<input type="date" value={happenedAt} onChange={(event) => setHappenedAt(event.target.value)} /></label>
        <label>Your little memory<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="An inside joke, favourite moment…" maxLength={220} /></label>
        <label><Camera size={14} /> Optional photo link<input type="url" value={photo} onChange={(event) => setPhoto(event.target.value)} placeholder="Paste a shared photo link" /></label>
        <button
          className="primary-button"
          disabled={!rating}
          onClick={() => onSave({ rating, note, photo, happenedAt })}
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

function CollectionDetailSheet({
  selection,
  collections,
  matches,
  events,
  onClose,
  onEdit,
  onDetail,
}: {
  selection: CollectionSelection;
  collections: CustomCollection[];
  matches: Item[];
  events: PairEvent[];
  onClose: () => void;
  onEdit: (collection: CustomCollection) => void;
  onDetail: (item: Item) => void;
}) {
  const custom = selection.type === "custom"
    ? collections.find((collection) => collection.id === selection.id)
    : undefined;
  const title = custom?.name ?? (selection.type === "smart"
    ? selection.kind === "movie" ? "Movies" : selection.kind === "show" ? "TV Shows" : "Activities"
    : "Shared sublist");
  const items = custom
    ? matches.filter((item) => custom.itemKeys.includes(itemKey(item)))
    : selection.type === "smart"
      ? matches.filter((item) => item.kind === selection.kind)
      : [];
  const completed = items.filter((item) => isCompletedItem(item, events)).length;
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section className="bottom-sheet collection-detail-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <div className="collection-sheet-icon"><Bookmark size={22} /></div>
        <p>{custom ? "CUSTOM SUBLIST" : "AUTOMATIC SUBLIST"}</p>
        <h2>{title}</h2>
        <div className="collection-summary">
          <span>{items.length} saved</span><i />
          <span>{completed} done</span>
          {custom?.deadline && <><i /><span><CalendarDays size={12} /> {formatDeadline(custom.deadline)}</span></>}
        </div>
        {items.length ? (
          <div className="collection-items">
            {items.map((item) => (
              <button key={itemKey(item)} onClick={() => onDetail(item)}>
                <img src={item.image} alt="" onError={imageFallback} />
                <div><b>{item.title}</b><small>{item.kind === "activity" ? `${item.category} · ${item.budget}` : item.kind === "movie" ? "Movie" : "TV Show"}</small></div>
                {isCompletedItem(item, events) ? <CheckCircle2 size={18} className="done" /> : <ChevronRight size={18} />}
              </button>
            ))}
          </div>
        ) : (
          <div className="collection-detail-empty"><Sparkles size={23} /><b>Nothing here yet</b><span>{custom ? "Edit this sublist to add some of your matches." : "Your shared matches will sort themselves here automatically."}</span></div>
        )}
        {custom && <button className="outline-button collection-edit" onClick={() => onEdit(custom)}><ListFilter size={16} /> Edit sublist</button>}
      </section>
    </div>
  );
}

function CollectionEditorSheet({
  initial,
  matches,
  onClose,
  onSave,
  onDelete,
}: {
  initial: CustomCollection | null;
  matches: Item[];
  onClose: () => void;
  onSave: (collection: CustomCollection) => void;
  onDelete?: (() => void) | undefined;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [deadline, setDeadline] = useState(initial?.deadline ?? "");
  const [itemKeys, setItemKeys] = useState<string[]>(initial?.itemKeys ?? []);
  function toggle(item: Item) {
    const key = itemKey(item);
    setItemKeys((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  }
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section className="bottom-sheet collection-editor-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <p>{initial ? "EDIT SHARED SUBLIST" : "NEW SHARED SUBLIST"}</p>
        <h2>{initial ? "Shape this list together." : "Give an idea a little home."}</h2>
        <label>List name<input value={name} maxLength={50} onChange={(event) => setName(event.target.value)} placeholder="Before December" autoFocus /></label>
        <label>Optional deadline<input type="date" value={deadline} onInput={(event) => setDeadline(event.currentTarget.value)} /></label>
        <div className="collection-picker-heading"><div><b>Add your matches</b><small>Both of you will see these changes.</small></div><span>{itemKeys.length} selected</span></div>
        {matches.length ? (
          <div className="collection-picker">
            {matches.map((item) => {
              const selected = itemKeys.includes(itemKey(item));
              return (
                <button key={itemKey(item)} className={selected ? "selected" : ""} onClick={() => toggle(item)}>
                  <img src={item.image} alt="" onError={imageFallback} />
                  <div><b>{item.title}</b><small>{item.kind === "activity" ? "Activity" : item.kind === "movie" ? "Movie" : "TV Show"}</small></div>
                  <i>{selected && <Check size={14} />}</i>
                </button>
              );
            })}
          </div>
        ) : <div className="collection-picker-empty">Your first shared match can be added here.</div>}
        <button className="primary-button" disabled={name.trim().length < 2} onClick={() => onSave({
          id: initial?.id ?? "",
          name,
          deadline,
          itemKeys,
          createdBy: initial?.createdBy ?? "",
        })}>{initial ? "Save changes" : "Create shared sublist"}</button>
        {onDelete && <button className="text-button danger collection-delete" onClick={onDelete}><Trash2 size={14} /> Delete sublist</button>}
      </section>
    </div>
  );
}

function AccountSheet({
  mode,
  identity,
  pendingSetup,
  activeListId,
  activeListName,
  displayName,
  authStatus,
  onVerified,
  onProfileUpdated,
  onClose,
  onSignedOut,
}: {
  mode: "signup" | "signin" | "manage";
  identity: CloudIdentity | null;
  pendingSetup?: PendingSetup | null;
  activeListId?: string | undefined;
  activeListName?: string | undefined;
  displayName?: string;
  authStatus: "ready" | "restoring" | "joining" | "error";
  onVerified: (intent: AuthIntent) => Promise<void>;
  onProfileUpdated?: (name: string) => void;
  onClose: () => void;
  onSignedOut: () => void;
}) {
  const [email, setEmail] = useState(identity?.email ?? "");
  const [profileName, setProfileName] = useState(displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<AuthIntent | null>(() => {
    try {
      const value = localStorage.getItem(AUTH_INTENT_KEY);
      return value ? JSON.parse(value) as AuthIntent : null;
    } catch {
      return null;
    }
  });
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState("");
  const securing = mode === "manage" && Boolean(identity?.isAnonymous);

  useEffect(() => {
    if (!intent) return;
    const tick = () => setSecondsLeft(resendSeconds(intent.sentAt));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [intent?.sentAt]);

  function redirectFor(nextIntent: Pick<AuthIntent, "setup" | "listId" | "listName">) {
    const redirect = new URL(`${window.location.origin}${window.location.pathname}`);
    if (nextIntent.setup) redirect.searchParams.set("setup", JSON.stringify(nextIntent.setup));
    if (nextIntent.listId) {
      redirect.searchParams.set("secured", "1");
      redirect.searchParams.set("returnList", nextIntent.listId);
      redirect.searchParams.set("returnName", nextIntent.listName || "your shared list");
    }
    return redirect.toString();
  }

  function remember(nextIntent: AuthIntent) {
    setIntent(nextIntent);
    setEmail(nextIntent.email);
    localStorage.setItem(AUTH_INTENT_KEY, JSON.stringify(nextIntent));
    if (nextIntent.setup) localStorage.setItem(PENDING_SETUP_KEY, JSON.stringify(nextIntent.setup));
  }

  async function submit() {
    if (!email.includes("@")) return;
    setBusy(true);
    setMessage("");
    setConflict(false);
    try {
      const nextIntent: AuthIntent = {
        mode: securing ? "secure" : mode === "signup" ? "signup" : "signin",
        email: email.trim().toLowerCase(),
        sentAt: Date.now(),
        ...(pendingSetup ? { setup: pendingSetup } : {}),
        ...((securing || mode === "signin") && activeListId ? { listId: activeListId } : {}),
        ...(activeListName ? { listName: activeListName } : {}),
      };
      const redirectTo = redirectFor(nextIntent);
      if (securing) await secureCloudAccount(email, redirectTo);
      else if (mode === "signup") await sendCloudSignUpLink(email, redirectTo);
      else await sendCloudSignInLink(email, redirectTo);
      remember(nextIntent);
    } catch (reason) {
      const raw = reason instanceof Error ? reason.message : "We could not send the email.";
      const issue = classifyAuthIssue(raw);
      if (securing && issue === "conflict") {
        setConflict(true);
        setMessage("That email already has a ReelTogether account. This guest list is still open and unchanged.");
      } else if (issue === "rate-limit") {
        setMessage("Supabase has temporarily limited emails. Your session is safe—wait a few minutes, then resend once.");
      } else setMessage(raw);
    } finally {
      setBusy(false);
    }
  }

  async function recoverExistingAccount() {
    if (!activeListId) return;
    setBusy(true);
    setMessage("");
    try {
      const transferToken = await prepareCloudAccountTransfer(activeListId);
      const nextIntent: AuthIntent = {
        mode: "signin",
        email: email.trim().toLowerCase(),
        sentAt: Date.now(),
        listId: activeListId,
        ...(activeListName ? { listName: activeListName } : {}),
        transferToken,
      };
      await sendCloudSignInLink(nextIntent.email, redirectFor(nextIntent));
      remember(nextIntent);
      setConflict(false);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not prepare the safe account handoff.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!intent || code.replace(/\D/g, "").length < 6) return;
    setBusy(true);
    setMessage("");
    try {
      await verifyCloudOtp(intent.email, code, intent.mode === "secure" ? "email_change" : "email");
      await onVerified(intent);
    } catch (reason) {
      const raw = reason instanceof Error ? reason.message : "That code could not be verified.";
      setMessage(classifyAuthIssue(raw) === "expired" ? "That code expired. Resend a fresh one—your list is still safe." : raw);
      setBusy(false);
    }
  }

  async function resend() {
    if (!intent || secondsLeft > 0) return;
    setBusy(true);
    setMessage("");
    try {
      const redirectTo = redirectFor(intent);
      if (intent.mode === "secure") await resendCloudEmailChange(intent.email, redirectTo);
      else if (intent.mode === "signup") await sendCloudSignUpLink(intent.email, redirectTo);
      else await sendCloudSignInLink(intent.email, redirectTo);
      remember({ ...intent, sentAt: Date.now() });
      setMessage("A fresh code is on its way.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    setMessage("");
    try {
      await updateCloudDisplayName(profileName);
      const cleanName = profileName.trim().slice(0, 40);
      onProfileUpdated?.(cleanName);
      setMessage("Name updated for both of you.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not update your name.");
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

  async function deleteAccount() {
    setBusy(true);
    setMessage("");
    try {
      await deleteCloudAccount();
      localStorage.removeItem(AUTH_INTENT_KEY);
      localStorage.removeItem(PENDING_SETUP_KEY);
      onSignedOut();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not delete the account.");
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
        {intent ? (
          <div className="email-sent">
            <span>
              <Mail size={27} />
            </span>
            <p>CHECK YOUR EMAIL</p>
            <h2>Enter your verification code.</h2>
            <small>
              Sent to <strong>{intent.email}</strong>. Enter it here to restore the exact shared space, or use the secure button in the email.
            </small>
            <label>
              Verification code
              <input
                className="otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(event) => setCode(normalizeOtp(event.target.value))}
                placeholder="000000"
                autoFocus
              />
            </label>
            <button className="primary-button" disabled={busy || code.length < 6 || code.length > 10} onClick={verify}>
              {busy || authStatus === "restoring" || authStatus === "joining" ? "Restoring your space…" : "Verify and continue"}
            </button>
            <button className="text-button" disabled={busy || secondsLeft > 0} onClick={resend}>
              {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend code"}
            </button>
            <button className="text-button" disabled={busy} onClick={() => {
              localStorage.removeItem(AUTH_INTENT_KEY);
              setIntent(null);
              setCode("");
              setMessage("");
            }}>Use a different email</button>
            <small className="magic-link-fallback">The secure button in the email works as a fallback too.</small>
            {message && <div className="form-message">{message}</div>}
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
            <label>
              Your display name
              <input value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={40} />
            </label>
            <button className="outline-button" disabled={busy || profileName.trim().length < 2 || profileName.trim() === displayName} onClick={saveProfile}>
              Save name
            </button>
            <button
              className="outline-button sign-out"
              disabled={busy}
              onClick={signOut}
            >
              <LogOut size={16} /> Sign out
            </button>
            <small className="account-safety-note">Signing out only removes this device session. It never deletes your shared lists.</small>
            {confirmDelete ? (
              <div className="delete-account-confirm">
                <b>Delete this account permanently?</b>
                <small>Your partner keeps shared two-person lists. Your own votes and profile are removed.</small>
                <div><button className="text-button" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button><button className="text-button danger" disabled={busy} onClick={deleteAccount}>{busy ? "Deleting…" : "Yes, delete"}</button></div>
              </div>
            ) : (
              <button className="text-button danger delete-account-trigger" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete account</button>
            )}
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
                  ? "We’ll send a six-digit email code, then create your shared list exactly once."
                  : "We’ll email you a six-digit sign-in code—no password needed."}
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
                    : "Send my sign-in code"}
            </button>
            {conflict && (
              <div className="account-conflict">
                <ShieldCheck size={18} />
                <div><b>Keep this list and sign in</b><small>We’ll make a one-time recovery handoff, then merge this guest membership into your existing account after verification.</small></div>
                <button className="outline-button" disabled={busy} onClick={recoverExistingAccount}>Continue safely</button>
              </div>
            )}
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
  const detectedRegion = deviceRegion();
  const regionValues = [...new Set([detectedRegion, draft.region, "US", "GB", "IN", "CA", "AU", "DE", "FR", "ES", "IT", "NL", "SE", "NO", "DK", "BR", "MX", "JP", "KR", "SG", "NZ"])];
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
              values={regionValues}
              selected={[draft.region]}
              onToggle={(value) => setDraft({ ...draft, region: value })}
              labels={Object.fromEntries(regionValues.map((region) => [region, `${regionName(region)}${region === detectedRegion ? " · This device" : ""}`]))}
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
          {item.kind === "activity" && item.sourceUrl && (
            <a className="watch-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
              <Link2 size={16} /> Open the original idea
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
function itemKey(item: Item) {
  return `${item.kind}:${item.id}`;
}
function isItemMatched(item: Item, snapshot: SessionSnapshot) {
  const pickers = new Set(
    snapshot.votes
      .filter(
        (vote) =>
          vote.itemId === item.id &&
          vote.kind === item.kind &&
          vote.decision === "pick",
      )
      .map((vote) => vote.userId),
  );
  return (
    pickers.size >= 2 ||
    snapshot.events.some(
      (event) =>
        event.type === "wildcard" &&
        event.itemId === item.id &&
        event.kind === item.kind,
    )
  );
}
function isCompletedItem(item: Item, events: PairEvent[]) {
  return events.some(
    (event) =>
      event.type === "complete" &&
      event.itemId === item.id &&
      event.kind === item.kind,
  );
}
function formatDeadline(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
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
function topCounts(values: string[], limit: number): Array<[string, number]> {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
function downloadCalendar(item: Item, when: string, location: string) {
  const parsed = new Date(when);
  const start = Number.isNaN(parsed.getTime()) ? new Date(Date.now() + 24 * 60 * 60 * 1000) : parsed;
  if (Number.isNaN(parsed.getTime())) start.setHours(19, 0, 0, 0);
  const end = new Date(start.getTime() + (item.kind === "activity" ? 2 : 2.5) * 60 * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (value: string) => value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const calendar = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ReelTogether//Pair Plan//EN", "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@reeltogether`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(item.title)} together`, `DESCRIPTION:${escape(item.summary)}`, `LOCATION:${escape(location)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
  link.download = `${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-together.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
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
