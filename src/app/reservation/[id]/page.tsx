'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Warehouse,
  XCircle,
} from 'lucide-react'

type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'RELEASED'

interface Reservation {
  id: string
  status: ReservationStatus
  quantity: number
  expiresAt: string
  createdAt: string
  product: { id: string; name: string; sku: string; description?: string }
  warehouse: { id: string; name: string; location: string }
}

function Countdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const ms = new Date(expiresAt).getTime() - Date.now()
    return Math.max(0, Math.floor(ms / 1000))
  })

  useEffect(() => {
    if (secondsLeft <= 0) {
      onExpire()
      return
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onExpire()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [expiresAt, onExpire, secondsLeft])

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const pct = Math.max(0, (secondsLeft / 600) * 100)
  const urgency = secondsLeft < 60 ? 'text-rose-600' : secondsLeft < 180 ? 'text-amber-600' : 'text-cyan-700'
  const barColor = secondsLeft < 60 ? 'bg-rose-500' : secondsLeft < 180 ? 'bg-amber-500' : 'bg-cyan-500'

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <Clock3 className="h-4 w-4" />
            Time remaining
          </div>
          <p className="mt-1 text-sm text-slate-500">Confirm before the hold expires.</p>
        </div>
        <p className={`font-mono text-4xl font-bold tabular-nums sm:text-5xl ${urgency}`}>
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </p>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full transition-all duration-1000 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const STATUS_CONFIG = {
  CONFIRMED: {
    Icon: CheckCircle2,
    title: 'Order confirmed',
    desc: 'Payment succeeded and the unit has been deducted from inventory.',
    color: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  RELEASED: {
    Icon: RotateCcw,
    title: 'Reservation released',
    desc: 'The hold has been released and the unit is available again.',
    color: 'border-slate-200 bg-slate-50 text-slate-700',
  },
}

function StatusPill({ status }: { status: ReservationStatus }) {
  const tone =
    status === 'PENDING'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : status === 'CONFIRMED'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-slate-100 text-slate-600'

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tone}`}>{status}</span>
}

export default function ReservationPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [reservation, setReservation] = useState<Reservation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<'confirm' | 'release' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)

  const fetchReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/${id}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError('Reservation not found.')
          return
        }
        throw new Error('Failed to load')
      }
      const data: Reservation = await res.json()
      setReservation(data)
      setError(null)
      if (data.status !== 'PENDING') setExpired(false)
    } catch {
      setError('Could not load reservation.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchReservation()
  }, [fetchReservation])

  const handleConfirm = async () => {
    setActionLoading('confirm')
    setActionError(null)
    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (res.status === 410) {
        setActionError('This reservation has expired. The units have been released.')
        setExpired(true)
        await fetchReservation()
        return
      }
      if (!res.ok) {
        setActionError(data.error || 'Failed to confirm. Please try again.')
        return
      }
      setReservation(data)
      setExpired(false)
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRelease = async () => {
    setActionLoading('release')
    setActionError(null)
    try {
      const res = await fetch(`/api/reservations/${id}/release`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'Failed to cancel.')
        return
      }
      setReservation(data)
      setExpired(false)
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleExpire = useCallback(() => {
    setExpired(true)
    fetchReservation()
  }, [fetchReservation])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="h-96 animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" />
      </div>
    )
  }

  if (error || !reservation) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="text-lg font-semibold text-slate-950">{error || 'Reservation not found.'}</p>
        <button
          onClick={() => router.push('/')}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to products
        </button>
      </div>
    )
  }

  const isSettled = reservation.status !== 'PENDING'
  const settledConfig = STATUS_CONFIG[reservation.status as keyof typeof STATUS_CONFIG]

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <button
        onClick={() => router.push('/')}
        className="mb-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to products
      </button>

      <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="border-b border-slate-100 p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-mono font-semibold text-slate-500">
                    {reservation.id.slice(0, 12)}
                  </span>
                  <StatusPill status={reservation.status} />
                </div>
                <h2 className="mt-4 text-2xl font-bold text-slate-950 sm:text-3xl">Reservation details</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Your item is held while checkout is completed.</p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                    <ShoppingBag className="h-4 w-4" />
                    Product
                  </div>
                  <p className="mt-2 text-lg font-bold text-slate-950">{reservation.product.name}</p>
                  <p className="mt-1 text-sm font-medium text-slate-500">{reservation.product.sku}</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2 text-right shadow-sm">
                  <p className="text-xs font-semibold text-slate-500">Qty</p>
                  <p className="text-xl font-bold text-slate-950">{reservation.quantity}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <Warehouse className="h-4 w-4" />
                    Warehouse
                  </div>
                  <p className="mt-1 font-semibold text-slate-900">{reservation.warehouse.name}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <MapPin className="h-4 w-4" />
                    Location
                  </div>
                  <p className="mt-1 font-semibold text-slate-900">{reservation.warehouse.location}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="p-5 sm:p-6">
            {isSettled && settledConfig ? (
              <div className={`rounded-lg border p-5 text-center ${settledConfig.color}`}>
                <settledConfig.Icon className="mx-auto h-10 w-10" />
                <p className="mt-3 text-xl font-bold">{settledConfig.title}</p>
                <p className="mt-2 text-sm opacity-80">{settledConfig.desc}</p>
              </div>
            ) : expired ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-center text-rose-800">
                <XCircle className="mx-auto h-10 w-10" />
                <p className="mt-3 text-xl font-bold">Reservation expired</p>
                <p className="mt-2 text-sm opacity-80">The hold has timed out and the unit has returned to inventory.</p>
              </div>
            ) : (
              <Countdown expiresAt={reservation.expiresAt} onExpire={handleExpire} />
            )}

            {actionError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {!isSettled && !expired && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <button
                  onClick={handleConfirm}
                  disabled={!!actionLoading}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {actionLoading === 'confirm' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                  {actionLoading === 'confirm' ? 'Confirming' : 'Confirm purchase'}
                </button>
                <button
                  onClick={handleRelease}
                  disabled={!!actionLoading}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoading === 'release' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  {actionLoading === 'release' ? 'Cancelling' : 'Cancel reservation'}
                </button>
              </div>
            )}

            {(isSettled || expired) && (
              <button
                onClick={() => router.push('/')}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Browse more products
              </button>
            )}
          </section>
        </div>
      </article>

      <p className="mt-4 text-center text-xs text-slate-500">
        Created {new Date(reservation.createdAt).toLocaleString()}
      </p>
    </div>
  )
}
