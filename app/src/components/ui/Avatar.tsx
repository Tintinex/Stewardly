import React from 'react'
import { twMerge } from 'tailwind-merge'

const COLORS = [
  'bg-blue-500',
  'bg-teal',
  'bg-purple-500',
  'bg-orange-500',
  'bg-green-600',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-amber-500',
]

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-11 w-11 text-base',
  xl: 'h-14 w-14 text-lg',
}

interface AvatarProps {
  name: string
  size?: AvatarSize
  src?: string | null
  className?: string
}

export function Avatar({ name, size = 'md', src, className }: AvatarProps) {
  const color = COLORS[hashName(name) % COLORS.length]
  const initials = getInitials(name)

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={twMerge('rounded-full object-cover', sizeClasses[size], className)}
      />
    )
  }

  return (
    <span
      className={twMerge(
        'inline-flex items-center justify-center rounded-full font-semibold text-white select-none',
        color,
        sizeClasses[size],
        className,
      )}
      aria-label={name}
      title={name}
    >
      {initials}
    </span>
  )
}
