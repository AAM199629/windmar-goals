import type { Metadata } from 'next'
import { Bebas_Neue, Barlow, Barlow_Condensed } from 'next/font/google'
import './globals.css'

const bebas = Bebas_Neue({
  weight:   ['400'],
  variable: '--font-bebas-var',
  subsets:  ['latin'],
})

const barlow = Barlow({
  weight:   ['400', '500', '600', '700'],
  variable: '--font-body-var',
  subsets:  ['latin'],
})

const barlowCondensed = Barlow_Condensed({
  weight:   ['400', '600', '700', '800', '900'],
  variable: '--font-cond-var',
  subsets:  ['latin'],
})

export const metadata: Metadata = {
  title:       'Windmar Goals',
  description: 'Metas de ventas — Windmar Energy',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${bebas.variable} ${barlow.variable} ${barlowCondensed.variable}`}>
      <body>{children}</body>
    </html>
  )
}
