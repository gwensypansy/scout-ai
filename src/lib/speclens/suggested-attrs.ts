export type SuggestedAttr = { name: string; desc: string };

const ATTR_SETS: Record<string, SuggestedAttr[]> = {
  permission: [
    { name: "Permission scope", desc: "The level at which permissions are set — per tool, folder, page, or row" },
    { name: "Restriction target", desc: "Who permissions can be assigned to — users, roles, groups, or companies" },
    { name: "Role model", desc: "How roles are structured — fixed tiers, fixed + add-ons, or fully custom" },
    { name: "Inheritance", desc: "Whether child items inherit permissions from their parent" },
    { name: "Override allowed", desc: "Whether a child item can differ from its parent" },
    { name: "External sharing", desc: "Whether non-members can be given access" },
    { name: "Public links", desc: "Whether shareable public links are supported" },
  ],
  comment: [
    { name: "Thread model", desc: "Whether comments are threaded, flat, or inline" },
    { name: "Resolution states", desc: "Whether comments can be resolved, reopened, or archived" },
    { name: "Mention scope", desc: "Who can be @mentioned" },
    { name: "Notification behavior", desc: "How and when users are notified" },
    { name: "Visibility control", desc: "Whether comments can be private or internal-only" },
    { name: "Edit & delete rules", desc: "Whether users can edit or delete after posting" },
  ],
  onboard: [
    { name: "Flow trigger", desc: "What kicks off onboarding" },
    { name: "Personalization depth", desc: "Whether onboarding adapts to role or goals" },
    { name: "Progress mechanism", desc: "How progress is shown" },
    { name: "Skip behavior", desc: "Whether users can skip steps" },
    { name: "Empty state design", desc: "How the product guides users before any data" },
    { name: "Time to first value", desc: "How quickly a user reaches a first outcome" },
  ],
  default: [
    { name: "Core approach", desc: "The high-level method used to solve this problem" },
    { name: "Configurability", desc: "How much users can customize this feature" },
    { name: "Granularity", desc: "How fine-grained the controls are" },
    { name: "Collaboration model", desc: "How multiple users interact together" },
    { name: "Enterprise controls", desc: "Admin-level settings for larger orgs" },
  ],
};

export function suggestedAttrsFor(featureArea: string): SuggestedAttr[] {
  const f = (featureArea || "").toLowerCase();
  if (f.includes("permission") || f.includes("access") || f.includes("role")) return ATTR_SETS.permission;
  if (f.includes("comment") || f.includes("thread") || f.includes("discussion")) return ATTR_SETS.comment;
  if (f.includes("onboard")) return ATTR_SETS.onboard;
  return ATTR_SETS.default;
}
