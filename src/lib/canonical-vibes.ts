export interface CanonicalVibe {
  tag: string;
  description: string;
}

export const CANONICAL_VIBES: CanonicalVibe[] = [
  { tag: "cozy", description: "Comfort reads, warm feelings, low stakes" },
  { tag: "dark", description: "Grim, unsettling, morally complex" },
  { tag: "hopeful", description: "Optimistic arc, things get better" },
  { tag: "melancholy", description: "Beautiful sadness, bittersweet" },
  { tag: "intense", description: "Can't put it down, high tension" },
  { tag: "slow burn", description: "Meditative pace, rewards patience" },
  { tag: "atmospheric", description: "Setting is a character, immersive world" },
  { tag: "found family", description: "Chosen bonds, group dynamics" },
  { tag: "female rage", description: "Women's anger as power, cathartic" },
  { tag: "escapist", description: "Pure fun, don't have to think" },
  {
    tag: "emotional gut-punch",
    description: "Will make you cry",
  },
  { tag: "epic", description: "Big scope, sweeping narrative" },
  {
    tag: "sincere",
    description:
      "Earnest emotional investment, anti-ironic, wrestling with meaning",
  },
  {
    tag: "austere",
    description:
      "Restrained, precise, intellectual cool, observational distance",
  },
  {
    tag: "demanding",
    description: "Dense prose, requires surrender, rewards patience",
  },
  {
    tag: "weird",
    description: "Reality feels wrong, cosmic unease, philosophical dread",
  },
  {
    tag: "transgressive",
    description: "Pushes boundaries, goes to uncomfortable places",
  },
];

export const CANONICAL_VIBE_SET = new Set(CANONICAL_VIBES.map((v) => v.tag));

export function formatCanonicalVibe(tag: string): string {
  return tag.replace(/\b\w/g, (c) => c.toUpperCase());
}
