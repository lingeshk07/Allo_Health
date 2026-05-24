import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    let reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { inventory: { include: { product: true, warehouse: true } } },
    })

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }

    if (reservation.status === 'PENDING' && reservation.expiresAt < new Date()) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const locked = await tx.$queryRawUnsafe<Array<{
          id: string
          inventoryId: string
          quantity: number
          status: string
        }>>(`
          SELECT id, "inventoryId", quantity, status
          FROM "Reservation"
          WHERE id = $1
          FOR UPDATE
        `, id)

        const expired = locked[0]
        if (!expired || expired.status !== 'PENDING') return

        await tx.inventory.update({
          where: { id: expired.inventoryId },
          data: { reservedQuantity: { decrement: expired.quantity } },
        })
        await tx.reservation.update({
          where: { id: expired.id },
          data: { status: 'RELEASED' },
        })
      })

      reservation = await prisma.reservation.findUnique({
        where: { id },
        include: { inventory: { include: { product: true, warehouse: true } } },
      })

      if (!reservation) {
        return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
      }
    }

    return NextResponse.json({
      id: reservation.id,
      status: reservation.status,
      quantity: reservation.quantity,
      expiresAt: reservation.expiresAt,
      createdAt: reservation.createdAt,
      product: {
        id: reservation.inventory.product.id,
        name: reservation.inventory.product.name,
        sku: reservation.inventory.product.sku,
        description: reservation.inventory.product.description,
      },
      warehouse: {
        id: reservation.inventory.warehouse.id,
        name: reservation.inventory.warehouse.name,
        location: reservation.inventory.warehouse.location,
      },
    })
  } catch (error) {
    console.error('GET /api/reservations/:id error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
