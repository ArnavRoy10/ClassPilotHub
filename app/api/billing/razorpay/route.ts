import { NextResponse } from 'next/server'
import { getBillingContext } from '@/lib/billing'
import { razorpay } from '@/lib/razorpay'
import { computeBillingState } from '@/lib/billing-state'
import { PLANS, normalizePlan } from '@/lib/plans'

const PLAN_ENV: Record<string, string | undefined> = {
  solo: process.env.RAZORPAY_PLAN_SOLO,
  starter: process.env.RAZORPAY_PLAN_STARTER,
  growth: process.env.RAZORPAY_PLAN_GROWTH,
  pro: process.env.RAZORPAY_PLAN_PRO,
}

export async function POST(request: Request) {
  try {
    if (!razorpay || !process.env.RAZORPAY_KEY_ID) return NextResponse.json({ error: 'Razorpay is not configured.' }, { status: 503 })

    const body = (await request.json().catch(() => null)) as { plan?: string } | null
    const planId = normalizePlan(body?.plan)
    if (!planId) return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 })

    const context = await getBillingContext()
    if (!context) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    if (context.profile.role !== 'owner') return NextResponse.json({ error: 'Only organization owners can manage billing.' }, { status: 403 })

    const razorpayPlanId = PLAN_ENV[planId]
    if (!razorpayPlanId) return NextResponse.json({ error: 'This plan is not configured yet.' }, { status: 503 })

    const state = computeBillingState(context.subscription, context.organization.plan)
    const plan = PLANS[planId]

    // Bill must be cleared before switching to a different plan.
    if (state.mustPay && planId !== state.planId) {
      return NextResponse.json({ error: `Clear your pending ${state.planName} bill (₹${state.amountDue}) before changing plans.` }, { status: 403 })
    }
    if (state.kind === 'trial') {
      return NextResponse.json({ error: 'You are on a free trial. Select your plan; payment starts when the trial ends.' }, { status: 400 })
    }

    const students = context.usage?.student_count ?? 0
    const teachers = context.usage?.teacher_count ?? 0
    if (students > plan.maxStudents || teachers > plan.maxTeachers) {
      return NextResponse.json({ error: `${plan.name} allows ${plan.limits}. You currently have ${students} students and ${teachers} teachers.` }, { status: 400 })
    }

    // Paid and up to date: a plan change starts when the current period ends, so nobody pays twice.
    let startAt: number | undefined
    let replaces: string | undefined
    if (state.kind === 'active' && state.periodEnd) {
      if (planId === state.planId && !state.cancelAtPeriodEnd) return NextResponse.json({ error: 'You are already on this plan.' }, { status: 400 })
      startAt = Math.floor(new Date(state.periodEnd).getTime() / 1000)
      if (startAt - Math.floor(Date.now() / 1000) < 600) {
        return NextResponse.json({ error: 'Your plan renews in a few minutes. Please try again after it renews.' }, { status: 400 })
      }
      const current = context.subscription?.stripe_subscription_id as string | undefined
      if (!state.cancelAtPeriodEnd && current?.startsWith('razorpay:')) replaces = current.replace('razorpay:', '')
    }

    const notes: Record<string, string> = { organization_id: context.organization.id, plan: planId }
    if (replaces) notes.replaces = replaces

    const subscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      total_count: 12,
      customer_notify: 1,
      ...(startAt ? { start_at: startAt } : {}),
      notes,
    })

    return NextResponse.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      subscriptionId: subscription.id,
      plan: plan.name,
      scheduledFor: startAt ? new Date(startAt * 1000).toISOString() : null,
    })
  } catch (error) {
    // Razorpay SDK errors are plain objects: { statusCode, error: { code, description } }
    const rzp = (error as { statusCode?: number; error?: { code?: string; description?: string } } | null) ?? {}
    console.error('Razorpay checkout failed:', rzp.statusCode, rzp.error?.code, rzp.error?.description ?? error)
    return NextResponse.json({ error: 'Unable to start Razorpay checkout.', detail: rzp.error?.description ?? null }, { status: 502 })
  }
}
