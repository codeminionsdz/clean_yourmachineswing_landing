import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans_Arabic, Noto_Kufi_Arabic } from 'next/font/google'
import './globals.css'
import { MetaPixel } from '@/components/meta-pixel'
import { getIntegrationSettings } from '@/lib/integration-settings'

const bodyFont = IBM_Plex_Sans_Arabic({ subsets: ['arabic', 'latin'], variable: '--font-body', weight: ['400', '500', '600', '700'] })
const displayFont = Noto_Kufi_Arabic({ subsets: ['arabic', 'latin'], variable: '--font-display', weight: ['500', '700', '900'] })

export const metadata: Metadata = {
  title: 'ACME MSTX320 | ماكينة سرفلة ACME Model 320',
  description: 'ماكنة سرفلة ACME Model 320 احترافية للعمل اليومي، مع ضمان 24 شهر، قطع غيار، دعم تقني وتوصيل إلى 69 ولاية.',
  openGraph: {
    title: 'ACME MSTX320 | ماكينة سرفلة ACME Model 320',
    description: 'ماكنة سرفلة ACME Model 320 احترافية للعمل اليومي، مع ضمان 24 شهر، قطع غيار، دعم تقني وتوصيل إلى 69 ولاية.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'ACME MSTX320 | ماكينة سرفلة ACME Model 320',
    description: 'ماكنة سرفلة ACME Model 320 احترافية للعمل اليومي، مع ضمان 24 شهر، قطع غيار، دعم تقني وتوصيل إلى 69 ولاية.',
  },
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f4efe4',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getIntegrationSettings().catch(() => null)
  return (
    <html lang="ar" dir="rtl" className="bg-background">
      <body className={`${bodyFont.variable} ${displayFont.variable} font-sans antialiased`}>
        {children}
        <MetaPixel pixelId={settings?.meta_pixel_id || process.env.NEXT_PUBLIC_META_PIXEL_ID} />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
