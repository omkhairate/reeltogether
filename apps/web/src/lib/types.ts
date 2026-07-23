export type ContentMode = "watch" | "activities" | "mixed";
export type ContentKind = "movie" | "show" | "activity";
export type VoteDecision = "pick" | "pass";
export type PairEventType =
  | "tonight"
  | "nudge"
  | "wildcard"
  | "plan"
  | "confirm"
  | "complete"
  | "rating";

export type MediaItem = {
  id: string;
  kind: "movie" | "show";
  title: string;
  year: number;
  runtime: string;
  rating: number;
  genres: string[];
  language: string;
  providers: string[];
  image: string;
  summary: string;
};

export type ActivityItem = {
  id: string;
  kind: "activity";
  title: string;
  category: string;
  budget: "Free" | "€" | "€€" | "€€€";
  duration: string;
  distanceKm: number;
  location: string;
  vibes: string[];
  image: string;
  summary: string;
};

export type DiscoveryFilters = {
  genres: string[];
  languages: string[];
  providers: string[];
  mediaKinds: Array<"movie" | "show">;
  activityCategories: string[];
  budgets: string[];
  maxDistanceKm: number;
};

export type SharedList = {
  id: string;
  inviteCode: string;
  name: string;
  threshold: number;
  contentMode: ContentMode;
  filters: DiscoveryFilters;
};

export type Member = { id: string; displayName: string };
export type Vote = {
  userId: string;
  itemId: string;
  kind: ContentKind;
  decision: VoteDecision;
};

export type PairEvent = {
  id: string;
  userId: string;
  type: PairEventType;
  itemId: string;
  kind: ContentKind | "";
  payload: Record<string, string | number | boolean>;
  updatedAt: string;
};

export type SessionSnapshot = {
  user: Member;
  list: SharedList;
  members: Member[];
  votes: Vote[];
  events: PairEvent[];
};

export const defaultFilters: DiscoveryFilters = {
  genres: [],
  languages: [],
  providers: [],
  mediaKinds: [],
  activityCategories: [],
  budgets: [],
  maxDistanceKm: 25,
};
