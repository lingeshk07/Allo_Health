import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const expiredReservations = await prisma.reservation.findMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      select: { id: true, inventoryId: true, quantity: true },
    })

    if (expiredReservations.length === 0) {
      return NextResponse.json({ released: 0 })
    }

    let released = 0
    for (const reservation of expiredReservations) {
      try {
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
          released++
        })
      } catch (err) {
        console.error(`Failed to release reservation ${reservation.id}:`, err)
      }
    }

    return NextResponse.json({ released, total: expiredReservations.length, runAt: now.toISOString() })
  } catch (error) {
    console.error('Cron expire-reservations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
