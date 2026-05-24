import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET() {
  try {
    await releaseExpiredReservations()

    const products = await prisma.product.findMany({
      include: {
        inventories: {
          include: { warehouse: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const result = products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      sku: product.sku,
      imageUrl: product.imageUrl,
      stock: product.inventories.map((inv) => ({
        inventoryId: inv.id,
        warehouseId: inv.warehouseId,
        warehouseName: inv.warehouse.name,
        warehouseLocation: inv.warehouse.location,
        totalQuantity: inv.totalQuantity,
        reservedQuantity: inv.reservedQuantity,
        availableQuantity: inv.totalQuantity - inv.reservedQuantity,
      })),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/products error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function releaseExpiredReservations() {
  const expiredReservations = await prisma.reservation.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    select: { id: true, inventoryId: true, quantity: true },
  })

  for (const reservation of expiredReservations) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const locked = await tx.$queryRawUnsafe<Array<{ status: string }>>(`
        SELECT status
        FROM "Reservation"
        WHERE id = $1
        FOR UPDATE
      `, reservation.id)

      if (!locked[0] || locked[0].status !== 'PENDING') return

      await tx.inventory.update({
        where: { id: reservation.inventoryId },
        data: { reservedQuantity: { decrement: reservation.quantity } },
      })
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED' },
      })
    })
  }
}
