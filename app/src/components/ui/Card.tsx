import React from 'react'
import { twMerge } from 'tailwind-merge'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={twMerge('rounded-xl border border-gray-200 bg-white shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <div
      className={twMerge('flex flex-col space-y-1.5 p-6', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: CardProps) {
  return (
    <h3
      className={twMerge('text-lg font-semibold leading-none tracking-tight text-gray-900', className)}
      {...props}
    >
      {children}
    </h3>
  )
}

export function CardDescription({ className, children, ...props }: CardProps) {
  return (
    <p className={twMerge('text-sm text-gray-500', className)} {...props}>
      {children}
    </p>
  )
}

export function CardContent({ className, children, ...props }: CardProps) {
  return (
    <div className={twMerge('p-6 pt-0', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...props }: CardProps) {
  return (
    <div
      className={twMerge('flex items-center p-6 pt-0', className)}
      {...props}
    >
      {children}
    </div>
  )
}
