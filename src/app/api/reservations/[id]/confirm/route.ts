import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const rows = await prisma.$queryRawUnsafe<Array<ReservationRow>>(`
      WITH confirmed AS (
        UPDATE "Reservation"
        SET status = 'CONFIRMED'::"ReservationStatus",
            "updatedAt" = NOW()
        WHERE id = $1
          AND status = 'PENDING'::"ReservationStatus"
          AND "expiresAt" >= NOW()
        RETURNING *
      ),
      adjusted_inventory AS (
        UPDATE "Inventory" i
        SET "totalQuantity" = i."totalQuantity" - c.quantity,
            "reservedQuantity" = i."reservedQuantity" - c.quantity,
            "updatedAt" = NOW()
        FROM confirmed c
        WHERE i.id = c."inventoryId"
        RETURNING i.id
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
      FROM confirmed r
      JOIN "Inventory" i ON i.id = r."inventoryId"
      JOIN "Product" p ON p.id = i."productId"
      JOIN "Warehouse" w ON w.id = i."warehouseId"
    `, id)

    if (rows[0]) {
      return NextResponse.json(formatReservationRow(rows[0]))
    }

    const existing = await prisma.reservation.findUnique({
      where: { id },
      include: { inventory: { include: { product: true, warehouse: true } } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }

    if (existing.status === 'CONFIRMED') {
      return NextResponse.json(formatReservation(existing))
    }

    if (existing.status === 'RELEASED') {
      return NextResponse.json({ error: 'Reservation is already released' }, { status: 409 })
    }

    if (existing.expiresAt < new Date()) {
      await releaseExpiredReservation(id)
      return NextResponse.json(
        { error: 'Reservation has expired', code: 'RESERVATION_EXPIRED' },
        { status: 410 }
      )
    }

    return NextResponse.json({ error: 'Reservation could not be confirmed' }, { status: 409 })
  } catch (error: unknown) {
    console.error('POST /reservations/:id/confirm error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function releaseExpiredReservation(id: string) {
  await prisma.$executeRawUnsafe(`
    WITH released AS (
      UPDATE "Reservation"
      SET status = 'RELEASED'::"ReservationStatus",
          "updatedAt" = NOW()
      WHERE id = $1
        AND status = 'PENDING'::"ReservationStatus"
        AND "expiresAt" < NOW()
      RETURNING "inventoryId", quantity
    )
    UPDATE "Inventory" i
    SET "reservedQuantity" = i."reservedQuantity" - r.quantity,
        "updatedAt" = NOW()
    FROM released r
    WHERE i.id = r."inventoryId"
  `, id)
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
    product: { id: r.inventory.product.id, name: r.inventory.product.name, sku: r.inventory.product.sku },
    warehouse: { id: r.inventory.warehouse.id, name: r.inventory.warehouse.name, location: r.inventory.warehouse.location },
  }
}

function formatReservationRow(r: ReservationRow) {
  return {
    id: r.id,
    status: r.status,
    quantity: r.quantity,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    product: { id: r.productId, name: r.productName, sku: r.productSku },
    warehouse: { id: r.warehouseId, name: r.warehouseName, location: r.warehouseLocation },
  }
}
