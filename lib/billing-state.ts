import { PLANS, normalizePlan, type PlanId } from '@/lib/plans'

// Business rules
export const TRIAL_DAYS = 14 // free trial length (set when the organisation is created)
export const GRACE_DAYS = 4 // days allowed to pay after the trial / paid period ends

const DAY_MS = 86_400_000

export type BillingSubscriptionInput = {
  plan?: string | null
  status?: string | null
  trial_end?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean | null
} | null

// trial     : inside the free trial, nothing owed yet
// active    : paid up until periodEnd
// grace     : trial / paid period ended, payment due, organisation still usable (blocking popup)
// suspended : GRACE_DAYS passed without payment, organisation is shut down
// unknown   : no dates on record, nothing is enforced
export type BillingStateKind = 'trial' | 'active' | 'grace' | 'suspended' | 'unknown'

export type BillingState = {
  kind: BillingStateKind
  planId: PlanId
  planName: string
  amountDue: number // monthly price of the plan the next payment is for
  periodEnd: string | null // trial end / paid-through date (ISO)
  suspendsAt: string | null // ISO, only while overdue
  daysLeft: number // trial/active: days to periodEnd. grace: days until suspension
  overdueReason: 'trial' | 'renewal' | null
  cancelAtPeriodEnd: boolean
  mustPay: boolean
  canChangePlan: boolean // true only when the bill is cleared
}

function parse(value?: string | null) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysUntil(target: Date, now: Date) {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / DAY_MS))
}

export function computeBillingState(
  subscription: BillingSubscriptionInput,
  organizationPlan?: string | null,
  now: Date = new Date(),
): BillingState {
  const planId = normalizePlan(organizationPlan) ?? normalizePlan(subscription?.plan) ?? 'starter'
  const plan = PLANS[planId]
  const base: BillingState = {
    kind: 'unknown', planId, planName: plan.name, amountDue: plan.monthly,
    periodEnd: null, suspendsAt: null, daysLeft: 0, overdueReason: null,
    cancelAtPeriodEnd: false, mustPay: false, canChangePlan: true,
  }

  const status = subscription?.status ?? ''
  const trialEnd = parse(subscription?.trial_end)
  const periodEnd = parse(subscription?.current_period_end)
  const t = now.getTime()
  const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end) || status === 'canceled'

  // Paying customer with no end date on record: never lock them out by mistake.
  if (status === 'active' && !periodEnd) return { ...base, kind: 'active', cancelAtPeriodEnd }

  if ((status === 'active' || status === 'canceled') && periodEnd && t <= periodEnd.getTime()) {
    return { ...base, kind: 'active', periodEnd: periodEnd.toISOString(), daysLeft: daysUntil(periodEnd, now), cancelAtPeriodEnd }
  }

  if (trialEnd && t <= trialEnd.getTime()) {
    return { ...base, kind: 'trial', periodEnd: trialEnd.toISOString(), daysLeft: daysUntil(trialEnd, now) }
  }

  const ends = [trialEnd, periodEnd].filter((d): d is Date => d !== null)
  if (ends.length === 0) return base

  const overdueSince = new Date(Math.max(...ends.map((d) => d.getTime())))
  const suspendsAt = new Date(overdueSince.getTime() + GRACE_DAYS * DAY_MS)
  const overdueReason = periodEnd && (!trialEnd || periodEnd.getTime() >= trialEnd.getTime()) ? 'renewal' : 'trial'

  return {
    ...base,
    kind: t >= suspendsAt.getTime() ? 'suspended' : 'grace',
    periodEnd: overdueSince.toISOString(),
    suspendsAt: suspendsAt.toISOString(),
    daysLeft: daysUntil(suspendsAt, now),
    overdueReason,
    cancelAtPeriodEnd,
    mustPay: true,
    canChangePlan: false,
  }
}

// Fixed to IST so server and browser render identical text (no hydration mismatch).
export function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}
