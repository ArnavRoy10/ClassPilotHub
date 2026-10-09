import 'server-only'

import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { getUserContext } from '@/lib/supabase/user-context'
import { computeBillingState, type BillingState } from '@/lib/billing-state'

export async function getOrganizationBillingState(organizationId: string, organizationPlan?: string | null): Promise<BillingState> {
  // Admin client on purpose: teachers, students and parents may not be able to read the
  // subscriptions table under RLS, but they must still be locked out when the bill is unpaid.
  // organizationId always comes from the signed-in user's own profile (getUserContext).
  const { data: subscription } = await getAdminClient().from('subscriptions').select('*').eq('organization_id', organizationId).maybeSingle()
  return computeBillingState(subscription, organizationPlan)
}

// For API routes: returns a 402 response when the organisation is suspended for non-payment, otherwise null.
export async function organizationSuspendedResponse() {
  const context = await getUserContext()
  if (!context) return null
  const state = await getOrganizationBillingState(context.organization.id, context.organization.plan)
  if (state.kind !== 'suspended') return null
  return NextResponse.json({ error: 'Your organisation is suspended because of an unpaid bill. The owner can pay from the billing page to reactivate it.' }, { status: 402 })
}
