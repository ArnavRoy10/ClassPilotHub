import { NextResponse } from 'next/server'
import { getBillingContext } from '@/lib/billing'
import { getAdminClient } from '@/lib/supabase/admin'
import { computeBillingState } from '@/lib/billing-state'
import { PLANS, normalizePlan } from '@/lib/plans'

// Choose / change plan during the free trial. Nothing is charged: the first payment
// is for the plan selected here, and is asked for when the trial ends.
export async function POST(request: Request) {
  const context = await getBillingContext()
  if (!context) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (context.profile.role !== 'owner') return NextResponse.json({ error: 'Only organization owners can manage billing.' }, { status: 403 })

  const body = (await request.json().catch(() => null)) as { plan?: string } | null
  const planId = normalizePlan(body?.plan)
  if (!planId) return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 })

  const state = computeBillingState(context.subscription, context.organization.plan)
  if (state.mustPay) return NextResponse.json({ error: 'Clear your pending bill before changing plans.' }, { status: 403 })
  if (state.kind === 'active') return NextResponse.json({ error: 'Use checkout to switch plans on a paid subscription.' }, { status: 400 })

  const plan = PLANS[planId]
  const students = context.usage?.student_count ?? 0
  const teachers = context.usage?.teacher_count ?? 0
  if (students > plan.maxStudents || teachers > plan.maxTeachers) {
    return NextResponse.json({ error: `${plan.name} allows ${plan.limits}. You currently have ${students} students and ${teachers} teachers.` }, { status: 400 })
  }

  const { error } = await getAdminClient().from('organizations').update({ plan: planId }).eq('id', context.organization.id)
  if (error) return NextResponse.json({ error: 'Unable to save your plan.' }, { status: 500 })
  return NextResponse.json({ ok: true, plan: planId })
}
