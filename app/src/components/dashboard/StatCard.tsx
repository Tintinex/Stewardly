import React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { clsx } from 'clsx'

type TrendDirection = 'up' | 'down' | 'neutral'
type ColorVariant = 'navy' | 'teal' | 'gold' | 'green' | 'red'

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  trendPercent?: number
  trendDirection?: TrendDirection
  trendLabel?: string
  variant?: ColorVariant
}

const iconBgClasses: Record<ColorVariant, string> = {
  navy:  'bg-navy-50 text-navy',
  teal:  'bg-teal-50 text-teal',
  gold:  'bg-gold-50 text-gold',
  green: 'bg-green-50 text-green-600',
  red:   'bg-red-50 text-red-600',
}

export function StatCard({
  icon,
  label,
  value,
  trendPercent,
  trendDirection = 'neutral',
  trendLabel,
  variant = 'teal',
}: StatCardProps) {
  const trendColor = clsx({
    'text-green-600': trendDirection === 'up',
    'text-red-600':   trendDirection === 'down',
    'text-gray-500':  trendDirection === 'neutral',
  })

  const TrendIcon =
    trendDirection === 'up'
      ? TrendingUp
      : trendDirection === 'down'
        ? TrendingDown
        : Minus

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            iconBgClasses[variant],
          )}
        >
          {icon}
        </div>
      </div>

      {(trendPercent !== undefined || trendLabel) && (
        <div className={clsx('mt-3 flex items-center gap-1 text-xs font-medium', trendColor)}>
          <TrendIcon className="h-3.5 w-3.5" />
          {trendPercent !== undefined && (
            <span>{trendPercent > 0 ? '+' : ''}{trendPercent}%</span>
          )}
          {trendLabel && <span className="text-gray-500 font-normal">{trendLabel}</span>}
        </div>
      )}
    </div>
  )
}
