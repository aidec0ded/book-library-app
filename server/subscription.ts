export function isPaidAndActive(sub: { plan: string; status: string }): boolean {
  return sub.plan !== "free" && (sub.status === "active" || sub.status === "trialing");
}
