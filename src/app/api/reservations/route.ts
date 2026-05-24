import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const ReserveSchema = z.object({
  inventoryId: z.string().min(1),
  quantity: z.number().int().positive(),
})

const RESERVATION_DURATION_MINUTES = 10

export async function POST(request: NextRequest) {
  let idempotencyKey: string | null = null
  try {
    const body = await request.json()
    const parsed = ReserveSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { inventoryId, quantity } = parsed.data
    idempotencyKey = request.headers.get('Idempotency-Key')

    if (idempotencyKey) {
      const existing = await prisma.reservation.findUnique({
        where: { idempotencyKey },
        include: { inventory: { include: { product: true, warehouse: true } } },
      })
      if (existing) {
        return NextResponse.json(formatReservation(existing), { status: 200 })
      }
    }

    const expiresAt = new Date(Date.now() + RESERVATION_DURATION_MINUTES * 60 * 1000)
    const reservationId = `res_${randomUUID()}`

    const rows = await prisma.$queryRawUnsafe<Array<ReservationRow>>(`
      WITH updated_inventory AS (
        UPDATE "Inventory"
        SET "reservedQuantity" = "reservedQuantity" + $2,
            "updatedAt" = NOW()
        WHERE id = $1
          AND ("totalQuantity" - "reservedQuantity") >= $2
        RETURNING id
      ),
      created_reservation AS (
        INSERT INTO "Reservation" (
          id,
          "inventoryId",
          quantity,
          status,
          "expiresAt",
          "idempotencyKey",
          "createdAt",
          "updatedAt"
        )
        SELECT
          $3,
          id,
          $2,
          'PENDING'::"ReservationStatus",
          $4,
          $5,
          NOW(),
          NOW()
        FROM updated_inventory
        RETURNING *
      )
      SELECT
        r.id,
        r.status,
        r.quantity,
        r."expiresAt",
        r."createdAt",
        p.id AS "productId",
        p.name AS "productName",
        p.sku AS "productSku",
        w.id AS "warehouseId",
        w.name AS "warehouseName",
        w.location AS "warehouseLocation"
      FROM created_reservation r
      JOIN "Inventory" i ON i.id = r."inventoryId"
      JOIN "Product" p ON p.id = i."productId"
      JOIN "Warehouse" w ON w.id = i."warehouseId"
    `, inventoryId, quantity, reservationId, expiresAt, idempotencyKey)

    if (!rows.length) {
      const inventoryExists = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        select: { id: true },
      })
      if (!inventoryExists) throw new Error('INVENTORY_NOT_FOUND')
      throw new Error('INSUFFICIENT_STOCK')
    }

    return NextResponse.json(formatReservationRow(rows[0]), { status: 201 })
  } catch (error: unknown) {
    if (idempotencyKey && isUniqueConstraintError(error)) {
      const existing = await prisma.reservation.findUnique({
        where: { idempotencyKey },
        include: { inventory: { include: { product: true, warehouse: true } } },
      })
      if (existing) {
        return NextResponse.json(formatReservation(existing), { status: 200 })
      }
    }

    if (error instanceof Error) {
      if (error.message === 'INSUFFICIENT_STOCK') {
        return NextResponse.json(
          { error: 'Not enough stock available', code: 'INSUFFICIENT_STOCK' },
          { status: 409 }
        )
      }
      if (error.message === 'INVENTORY_NOT_FOUND') {
        return NextResponse.json({ error: 'Inventory not found' }, { status: 404 })
      }
    }
    console.error('POST /api/reservations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type ReservationRow = {
  id: string
  status: string
  quantity: number
  expiresAt: Date
  createdAt: Date
  productId: string
  productName: string
  productSku: string
  warehouseId: string
  warehouseName: string
  warehouseLocation: string
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  )
}

type ReservationWithRelations = Prisma.ReservationGetPayload<{
  include: { inventory: { include: { product: true; warehouse: true } } }
}>

function formatReservation(r: ReservationWithRelations) {
  return {
    id: r.id,
    status: r.status,
    quantity: r.quantity,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    product: {
      id: r.inventory.product.id,
      name: r.inventory.product.name,
      sku: r.inventory.product.sku,
    },
    warehouse: {
      id: r.inventory.warehouse.id,
      name: r.inventory.warehouse.name,
      location: r.inventory.warehouse.location,
    },
  }
}

function formatReservationRow(r: ReservationRow) {
  return {
    id: r.id,
    status: r.status,
    quantity: r.quantity,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    product: {
      id: r.productId,
      name: r.productName,
      sku: r.productSku,
    },
    warehouse: {
      id: r.warehouseId,
      name: r.warehouseName,
      location: r.warehouseLocation,
    },
  }
}
