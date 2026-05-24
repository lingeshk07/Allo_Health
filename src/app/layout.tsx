import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Boxes, ShieldCheck } from 'lucide-react'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Allo Inventory',
  description: 'Multi-warehouse inventory reservation system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-950">Allo Inventory</h1>
                <p className="text-xs font-medium text-slate-500">Multi-warehouse fulfillment</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              Race-safe checkout holds
            </div>
          </div>
        </header>
        <main className="min-h-screen bg-slate-50">
          {children}
        </main>
      </body>
    </html>
  )
}
