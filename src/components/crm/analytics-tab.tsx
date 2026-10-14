import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToneBadge } from "@/components/crm/badges";
import { formatMoney, STATUS_MAP, type Lead } from "@/lib/crm";
import type { Property } from "@/lib/crm";

interface Props {
  leads: Lead[];
  properties: Property[];
}

const FUNNEL_STAGES = [
  "QUALIFYING",
  "QUALIFIED",
  "SITE_VISIT_BOOKED",
  "VISIT_DONE",
  "DEAL_WON",
] as const;

const BUDGET_BUCKETS = [
  { label: "< 20L", min: 0, max: 2_000_000 },
  { label: "20–50L", min: 2_000_000, max: 5_000_000 },
  { label: "50L–1Cr", min: 5_000_000, max: 10_000_000 },
  { label: "1–2Cr", min: 10_000_000, max: 20_000_000 },
  { label: "2–5Cr", min: 20_000_000, max: 50_000_000 },
  { label: "> 5Cr", min: 50_000_000, max: Infinity },
] as const;

function HBar({ value, max, label, sub }: { value: number; max: number; label: string; sub?: string }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="max-w-[60%] truncate font-medium" title={label}>{label}</span>
        <span className="text-muted-foreground">{sub ?? value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "green" | "red" | "yellow" | undefined }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${tone === "red" ? "text-red-500" : tone === "green" ? "text-green-600" : ""}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function AnalyticsTab({ leads, properties }: Props) {
  // ── Lead funnel ──
  const funnel = useMemo(() => {
    const total = leads.length || 1;
    return FUNNEL_STAGES.map((s) => ({
      key: s,
      label: STATUS_MAP[s]?.label ?? s,
      count: leads.filter((l) => l.status === s).length,
      pct: Math.round((leads.filter((l) => l.status === s).length / total) * 100),
    }));
  }, [leads]);

  // ── Source ROI ──
  const sourceBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of leads) {
      const src = l.source || "Unknown";
      map[src] = (map[src] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  // ── Location demand vs supply ──
  const locationInsight = useMemo(() => {
    const demand: Record<string, number> = {};
    const supply: Record<string, number> = {};
    for (const l of leads) {
      const loc = l.location || "Unknown";
      demand[loc] = (demand[loc] ?? 0) + 1;
    }
    for (const p of properties) {
      const loc = p.location || "Unknown";
      supply[loc] = (supply[loc] ?? 0) + 1;
    }
    const locs = Array.from(new Set([...Object.keys(demand), ...Object.keys(supply)]));
    return locs
      .map((loc) => ({ loc, demand: demand[loc] ?? 0, supply: supply[loc] ?? 0 }))
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 8);
  }, [leads, properties]);

  // ── Budget histogram ──
  const budgetDist = useMemo(() => {
    return BUDGET_BUCKETS.map((b) => ({
      label: b.label,
      count: leads.filter((l) => (l.budget ?? 0) >= b.min && (l.budget ?? 0) < b.max).length,
    }));
  }, [leads]);

  // ── Property type gap ──
  const propTypeGap = useMemo(() => {
    const leadPref: Record<string, number> = {};
    const invAvail: Record<string, number> = {};
    for (const l of leads) {
      if (l.property_type) leadPref[l.property_type] = (leadPref[l.property_type] ?? 0) + 1;
    }
    for (const p of properties) {
      if (p.configuration) invAvail[p.configuration] = (invAvail[p.configuration] ?? 0) + 1;
    }
    const types = Array.from(new Set([...Object.keys(leadPref), ...Object.keys(invAvail)]));
    return types
      .map((t) => ({ type: t, leads: leadPref[t] ?? 0, supply: invAvail[t] ?? 0 }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 8);
  }, [leads, properties]);

  // ── Key metrics ──
  const metrics = useMemo(() => {
    const visitBooked = leads.filter((l) => l.status === "SITE_VISIT_BOOKED" || l.status === "VISIT_DONE" || l.status === "DEAL_WON").length;
    const visitDone = leads.filter((l) => l.status === "VISIT_DONE" || l.status === "DEAL_WON").length;
    const dealWon = leads.filter((l) => l.status === "DEAL_WON").length;
    const visitConvRate = visitBooked > 0 ? Math.round((visitDone / visitBooked) * 100) : 0;
    const dealConvRate = leads.length > 0 ? Math.round((dealWon / leads.length) * 100) : 0;
    const dropped = leads.filter((l) => l.status === "NOT_INTERESTED").length;
    const withFollowups = leads.filter((l) => (l.followup_count ?? 0) >= 3).length;
    const qualifiedFromFollowups =
      leads.filter((l) => (l.followup_count ?? 0) >= 3 && (l.status === "QUALIFIED" || l.status === "SITE_VISIT_BOOKED" || l.status === "VISIT_DONE" || l.status === "DEAL_WON")).length;
    const followupEff = withFollowups > 0 ? Math.round((qualifiedFromFollowups / withFollowups) * 100) : 0;

    // Avg budget of leads with known budgets
    const budgeted = leads.filter((l) => l.budget && l.budget > 0);
    const avgBudget = budgeted.length > 0 ? Math.round(budgeted.reduce((s, l) => s + (l.budget ?? 0), 0) / budgeted.length) : 0;

    return { visitConvRate, dealConvRate, dropped, followupEff, avgBudget, dealWon };
  }, [leads]);

  const maxSource = Math.max(1, ...sourceBreakdown.map(([, c]) => c));
  const maxBudget = Math.max(1, ...budgetDist.map((b) => b.count));
  const maxDemand = Math.max(1, ...locationInsight.map((l) => l.demand));
  const maxTypeLeads = Math.max(1, ...propTypeGap.map((t) => t.leads));

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Visit conversion rate"
          value={`${metrics.visitConvRate}%`}
          sub="Booked → visit done"
          {...(metrics.visitConvRate >= 50 ? { tone: "green" as const } : metrics.visitConvRate < 25 ? { tone: "red" as const } : {})}
        />
        <StatCard
          label="Deal conversion rate"
          value={`${metrics.dealConvRate}%`}
          sub={`${metrics.dealWon} deal${metrics.dealWon === 1 ? "" : "s"} won`}
          {...(metrics.dealConvRate >= 10 ? { tone: "green" as const } : {})}
        />
        <StatCard
          label="Follow-up effectiveness"
          value={`${metrics.followupEff}%`}
          sub="Leads with 3+ follow-ups that qualified"
          {...(metrics.followupEff >= 40 ? { tone: "green" as const } : {})}
        />
        <StatCard
          label="Avg lead budget"
          value={formatMoney(metrics.avgBudget)}
          sub={`${leads.filter((l) => l.budget && l.budget > 0).length} leads with budget data`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lead funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead funnel</CardTitle>
            <CardDescription>Stage-by-stage distribution of all leads</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnel.map((stage) => (
              <HBar
                key={stage.key}
                label={stage.label}
                value={stage.count}
                max={Math.max(1, ...funnel.map((f) => f.count))}
                sub={`${stage.count} (${stage.pct}%)`}
              />
            ))}
          </CardContent>
        </Card>

        {/* Budget distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget distribution</CardTitle>
            <CardDescription>How lead budgets are spread across ranges</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {budgetDist.map((b) => (
              <HBar key={b.label} label={b.label} value={b.count} max={maxBudget} />
            ))}
          </CardContent>
        </Card>

        {/* Source breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead sources</CardTitle>
            <CardDescription>Which channels bring in the most leads</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sourceBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No source data yet.</p>
            ) : (
              sourceBreakdown.map(([src, count]) => (
                <HBar key={src} label={src} value={count} max={maxSource} />
              ))
            )}
          </CardContent>
        </Card>

        {/* Property type gap */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Property type demand vs supply</CardTitle>
            <CardDescription>Lead preference (demand) vs available inventory (supply)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {propTypeGap.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              propTypeGap.map(({ type, leads: ldCount, supply }) => (
                <div key={type} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{type}</span>
                    <div className="flex gap-2">
                      <span className="text-primary">{ldCount} leads</span>
                      <span className="text-muted-foreground">{supply} units</span>
                      {ldCount > supply * 2 && (
                        <ToneBadge tone="red" label="Shortage" />
                      )}
                      {supply > ldCount * 2 && (
                        <ToneBadge tone="yellow" label="Oversupply" />
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1 overflow-hidden rounded-full bg-secondary" style={{ height: 6 }}>
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(4, (ldCount / maxTypeLeads) * 100)}%` }}
                      />
                    </div>
                    <div className="flex-1 overflow-hidden rounded-full bg-secondary" style={{ height: 6 }}>
                      <div
                        className="h-full rounded-full bg-green-500/60"
                        style={{ width: `${Math.max(0, (supply / Math.max(1, ...propTypeGap.map((t) => t.supply))) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
            <div className="flex gap-4 pt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-primary/70" /> Demand</span>
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-green-500/60" /> Supply</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Location demand vs supply */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location demand vs supply</CardTitle>
          <CardDescription>Lead interest per location vs available inventory units</CardDescription>
        </CardHeader>
        <CardContent>
          {locationInsight.length === 0 ? (
            <p className="text-sm text-muted-foreground">No location data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Location</th>
                    <th className="pb-2 pr-4 font-medium">Leads</th>
                    <th className="pb-2 pr-4 font-medium">Properties</th>
                    <th className="pb-2 font-medium">Lead bar</th>
                    <th className="pb-2 pl-2 font-medium">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {locationInsight.map(({ loc, demand, supply }) => (
                    <tr key={loc}>
                      <td className="py-2 pr-4 font-medium">{loc}</td>
                      <td className="pr-4 tabular-nums">{demand}</td>
                      <td className="pr-4 tabular-nums">{supply}</td>
                      <td className="w-32 pr-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${(demand / maxDemand) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="pl-2">
                        {demand > 0 && supply === 0 && <ToneBadge tone="red" label="No stock" />}
                        {demand > supply * 2 && supply > 0 && <ToneBadge tone="orange" label="High demand" />}
                        {supply > demand * 2 && demand > 0 && <ToneBadge tone="yellow" label="Low interest" />}
                        {supply === 0 && demand === 0 && <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
