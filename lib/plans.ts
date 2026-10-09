// Shared (client + server safe) plan catalogue. Single source of truth for
// prices and seat limits used by billing UI, checkout and the webhook.

export type PlanId = 'solo' | 'starter' | 'growth' | 'pro'

export const PLANS: Record<PlanId, { id: PlanId; name: string; monthly: number; maxStudents: number; maxTeachers: number; limits: string }> = {
  solo: { id: 'solo', name: 'Solo Tutor', monthly: 299, maxStudents: 50, maxTeachers: 5, limits: '50 students · 5 teachers' },
  starter: { id: 'starter', name: 'Starter', monthly: 499, maxStudents: 150, maxTeachers: 15, limits: '150 students · 15 teachers' },
  growth: { id: 'growth', name: 'Growth', monthly: 999, maxStudents: 500, maxTeachers: 40, limits: '500 students · 40 teachers' },
  pro: { id: 'pro', name: 'Pro', monthly: 1999, maxStudents: 100000, maxTeachers: 100, limits: 'Unlimited students · 100 teachers' },
}

export const PLAN_ORDER: PlanId[] = ['solo', 'starter', 'growth', 'pro']

// Accepts 'starter', 'Starter', 'Solo Tutor', 'solo_tutor' ... and returns the plan id.
export function normalizePlan(value?: string | null): PlanId | null {
  const v = (value ?? '').trim().toLowerCase()
  if (v === 'solo' || v === 'solo tutor' || v === 'solo_tutor') return 'solo'
  return v in PLANS ? (v as PlanId) : null
}

export function formatINR(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`
}
