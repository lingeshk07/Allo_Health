const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const fs = require('fs')
const path = require('path')

for (const file of ['.env.local', '.env']) {
  const envPath = path.join(process.cwd(), file)
  if (!fs.existsSync(envPath)) continue

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const index = trimmed.indexOf('=')
    if (index <= 0) continue

    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)

    process.env[key] ??= value
  }
}

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database')
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  await prisma.reservation.deleteMany()
  await prisma.inventory.deleteMany()
  await prisma.product.deleteMany()
  await prisma.warehouse.deleteMany()

  await prisma.warehouse.createMany({
    data: [
      { id: 'wh_mumbai', name: 'Mumbai Central', location: 'Mumbai, Maharashtra' },
      { id: 'wh_delhi', name: 'Delhi North', location: 'Delhi, NCR' },
      { id: 'wh_bangalore', name: 'Bangalore Hub', location: 'Bangalore, Karnataka' },
    ],
  })

  await prisma.product.createMany({
    data: [
      { id: 'prod_001', name: 'Premium Wireless Headphones', sku: 'WH-PRO-001', description: 'High-fidelity wireless headphones with 40hr battery' },
      { id: 'prod_002', name: 'Mechanical Keyboard', sku: 'KB-MECH-002', description: 'TKL mechanical keyboard with Cherry MX switches' },
      { id: 'prod_003', name: 'USB-C Monitor', sku: 'MON-4K-003', description: '27 inch 4K IPS display with USB-C 90W PD' },
      { id: 'prod_004', name: 'Ergonomic Mouse', sku: 'MS-ERG-004', description: 'Vertical ergonomic wireless mouse' },
      { id: 'prod_005', name: 'Webcam 1080p', sku: 'CAM-HD-005', description: '1080p 60fps webcam with auto-focus' },
    ],
  })

  await prisma.inventory.createMany({
    data: [
      { productId: 'prod_001', warehouseId: 'wh_mumbai', totalQuantity: 15 },
      { productId: 'prod_001', warehouseId: 'wh_delhi', totalQuantity: 8 },
      { productId: 'prod_001', warehouseId: 'wh_bangalore', totalQuantity: 3 },
      { productId: 'prod_002', warehouseId: 'wh_mumbai', totalQuantity: 0 },
      { productId: 'prod_002', warehouseId: 'wh_delhi', totalQuantity: 20 },
      { productId: 'prod_002', warehouseId: 'wh_bangalore', totalQuantity: 12 },
      { productId: 'prod_003', warehouseId: 'wh_mumbai', totalQuantity: 5 },
      { productId: 'prod_003', warehouseId: 'wh_bangalore', totalQuantity: 2 },
      { productId: 'prod_004', warehouseId: 'wh_mumbai', totalQuantity: 30 },
      { productId: 'prod_004', warehouseId: 'wh_delhi', totalQuantity: 1 },
      { productId: 'prod_005', warehouseId: 'wh_delhi', totalQuantity: 10 },
      { productId: 'prod_005', warehouseId: 'wh_bangalore', totalQuantity: 7 },
    ],
  })

  console.log('Seeding complete!')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
