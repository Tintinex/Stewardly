import React from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  ctaLabel?: string
  onCta?: () => void
}

export function EmptyState({ icon, title, description, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>
      )}
      {ctaLabel && onCta && (
        <div className="mt-4">
          <Button onClick={onCta} size="sm">
            {ctaLabel}
          </Button>
        </div>
      )}
    </div>
  )
}
