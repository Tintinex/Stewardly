import React from 'react'
import { ChevronDown } from 'lucide-react'
import { twMerge } from 'tailwind-merge'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: SelectOption[]
  placeholder?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={twMerge(
              'block w-full appearance-none rounded-md border bg-white px-3 py-2 pr-8 text-sm text-gray-900',
              'focus:outline-none focus:ring-2 focus:ring-teal focus:border-teal',
              'disabled:cursor-not-allowed disabled:bg-gray-50',
              error
                ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                : 'border-gray-300',
              className,
            )}
            aria-invalid={!!error}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )
  },
)

Select.displayName = 'Select'
