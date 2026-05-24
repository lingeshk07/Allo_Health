'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Headphones,
  Keyboard,
  MapPin,
  Monitor,
  Mouse,
  Package,
  RefreshCw,
  ShieldCheck,
  Video,
  Warehouse,
} from 'lucide-react'

interface StockEntry {
  inventoryId: string
  warehouseId: string
  warehouseName: string
  warehouseLocation: string
  totalQuantity: number
  reservedQuantity: number
  availableQuantity: number
}

interface Product {
  id: string
  name: string
  description: string | null
  sku: string
  imageUrl: string | null
  stock: StockEntry[]
}

const PRODUCT_ICONS: Record<string, typeof Package> = {
  'WH-PRO-001': Headphones,
  'KB-MECH-002': Keyboard,
  'MON-4K-003': Monitor,
  'MS-ERG-004': Mouse,
  'CAM-HD-005': Video,
}

function stockTone(qty: number) {
  if (qty === 0) return 'border-rose-200 bg-rose-50 text-rose-700'
  if (qty <= 3) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function stockLabel(qty: number) {
  if (qty === 0) return 'Out of stock'
  if (qty <= 3) return `${qty} left`
  return `${qty} available`
}

function StockBadge({ qty }: { qty: number }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${stockTone(qty)}`}>
      {qty === 0 ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      {stockLabel(qty)}
    </span>
  )
}

function ProductIcon({ sku }: { sku: string }) {
  const Icon = PRODUCT_ICONS[sku] ?? Package

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm sm:h-14 sm:w-14">
      <Icon className="h-6 w-6" />
    </div>
  )
}

function StatTile({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Package }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
    </div>
  )
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reserving, setReserving] = useState<string | null>(null)
  const [reserveError, setReserveError] = useState<Record<string, string>>({})
  const router = useRouter()

  const fetchProducts = async () => {
    setError(null)
    try {
      const res = await fetch('/api/products')
      if (!res.ok) throw new Error('Failed to load products')
      const data = await res.json()
      setProducts(data)
    } catch {
      setError('Could not load products. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  const metrics = useMemo(() => {
    const rows = products.flatMap((product) => product.stock)
    return {
      products: products.length,
      warehouses: new Set(rows.map((row) => row.warehouseId)).size,
      available: rows.reduce((sum, row) => sum + row.availableQuantity, 0),
      reserved: rows.reduce((sum, row) => sum + row.reservedQuantity, 0),
    }
  }, [products])

  const handleReserve = async (inventoryId: string, productName: string) => {
    setReserving(inventoryId)
    setReserveError({})
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId, quantity: 1 }),
      })
      const data = await res.json()

      if (res.status === 409) {
        setReserveError((prev) => ({ ...prev, [inventoryId]: `Not enough stock for ${productName}` }))
        await fetchProducts()
        return
      }
      if (!res.ok) {
        setReserveError((prev) => ({ ...prev, [inventoryId]: data.error || 'Failed to reserve' }))
        return
      }

      router.push(`/reservation/${data.id}`)
    } catch {
      setReserveError((prev) => ({ ...prev, [inventoryId]: 'Network error. Please try again.' }))
    } finally {
      setReserving(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="text-lg font-semibold text-slate-950">{error}</p>
        <button
          onClick={fetchProducts}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              Live reservation control
            </div>
            <h2 className="mt-4 text-3xl font-bold text-slate-950 sm:text-4xl">Inventory ready for checkout holds</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Review availability across warehouses, hold one unit for payment, and keep inventory accurate while customers complete checkout.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Products" value={metrics.products} icon={Boxes} />
            <StatTile label="Warehouses" value={metrics.warehouses} icon={Warehouse} />
            <StatTile label="Available" value={metrics.available} icon={Package} />
            <StatTile label="Reserved" value={metrics.reserved} icon={Clock3} />
          </div>
        </div>
      </section>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-950">Product availability</h3>
          <p className="text-sm text-slate-500">Choose a warehouse to reserve one unit.</p>
        </div>
        <button
          onClick={fetchProducts}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
          aria-label="Refresh products"
          title="Refresh products"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {products.map((product) => {
          const totalAvailable = product.stock.reduce((sum, stock) => sum + stock.availableQuantity, 0)

          return (
            <article key={product.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <ProductIcon sku={product.sku} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-base font-bold text-slate-950 sm:text-lg">{product.name}</h4>
                        <p className="mt-1 text-xs font-medium text-slate-500">{product.sku}</p>
                      </div>
                      <StockBadge qty={totalAvailable} />
                    </div>
                    {product.description && <p className="mt-2 text-sm leading-6 text-slate-600">{product.description}</p>}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {product.stock.map((inv) => {
                  const pct = inv.totalQuantity > 0 ? Math.max(0, Math.min(100, (inv.availableQuantity / inv.totalQuantity) * 100)) : 0

                  return (
                    <div key={inv.inventoryId} className="p-4 transition hover:bg-slate-50 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Warehouse className="h-4 w-4 text-slate-400" />
                            <p className="truncate text-sm font-semibold text-slate-900">{inv.warehouseName}</p>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="truncate">{inv.warehouseLocation}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <StockBadge qty={inv.availableQuantity} />
                          <button
                            onClick={() => handleReserve(inv.inventoryId, product.name)}
                            disabled={inv.availableQuantity === 0 || reserving === inv.inventoryId}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 sm:min-w-32"
                          >
                            {reserving === inv.inventoryId ? (
                              <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Holding
                              </>
                            ) : inv.availableQuantity === 0 ? (
                              'Unavailable'
                            ) : (
                              <>
                                Reserve
                                <ChevronRight className="h-4 w-4" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
                          <span>{inv.availableQuantity} available / {inv.totalQuantity} total</span>
                          {inv.reservedQuantity > 0 && <span>{inv.reservedQuantity} held</span>}
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>

                      {reserveError[inv.inventoryId] && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{reserveError[inv.inventoryId]}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
