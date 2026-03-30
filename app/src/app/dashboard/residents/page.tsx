'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Mail, Phone } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import * as api from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import type { User, UserRole, CreateResidentPayload } from '@/types'
import { clsx } from 'clsx'

type RoleFilter = 'all' | UserRole

const roleBadgeVariant: Record<UserRole, 'default' | 'info' | 'success'> = {
  board_admin:  'success',
  board_member: 'info',
  homeowner:    'default',
}

const roleLabel: Record<UserRole, string> = {
  board_admin:  'Board Admin',
  board_member: 'Board Member',
  homeowner:    'Homeowner',
}

export default function ResidentsPage() {
  const { hoaId } = useAuth()
  const [residents, setResidents] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [selectedResident, setSelectedResident] = useState<User | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form state
  const [formFirstName, setFormFirstName] = useState('')
  const [formLastName, setFormLastName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('homeowner')
  const [formUnit, setFormUnit] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadResidents = useCallback(async () => {
    if (!hoaId) return
    const data = await api.getResidents(hoaId)
    setResidents(data)
  }, [hoaId])

  useEffect(() => {
    loadResidents().finally(() => setIsLoading(false))
  }, [loadResidents])

  const filtered = residents.filter(r => {
    const matchesSearch =
      !search ||
      `${r.firstName} ${r.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase()) ||
      r.unitNumber?.includes(search)
    const matchesRole = roleFilter === 'all' || r.role === roleFilter
    return matchesSearch && matchesRole
  })

  const resetForm = () => {
    setFormFirstName('')
    setFormLastName('')
    setFormEmail('')
    setFormPhone('')
    setFormRole('homeowner')
    setFormUnit('')
    setFormError(null)
  }

  const handleAddResident = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hoaId) return
    setFormError(null)
    setFormLoading(true)
    try {
      const payload: CreateResidentPayload = {
        firstName: formFirstName,
        lastName: formLastName,
        email: formEmail,
        phone: formPhone || undefined,
        role: formRole,
        unitNumber: formUnit,
      }
      const created = await api.createResident(hoaId, payload)
      setResidents(prev => [...prev, created])
      setIsModalOpen(false)
      resetForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add resident')
    } finally {
      setFormLoading(false)
    }
  }

  const roleTabs: { key: RoleFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'board_admin', label: 'Board Admin' },
    { key: 'board_member', label: 'Board Member' },
    { key: 'homeowner', label: 'Homeowners' },
  ]

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Residents</h1>
          <p className="text-sm text-gray-500">{residents.length} residents across 24 units</p>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setIsModalOpen(true)}>
          Add Resident
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or unit..."
            className="w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
          />
        </div>
        <div className="flex gap-0.5 rounded-lg border border-gray-200 bg-gray-100 p-1">
          {roleTabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRoleFilter(key)}
              className={clsx(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                roleFilter === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Resident grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No residents found"
          description={search ? 'Try a different search term.' : 'Add residents to get started.'}
          ctaLabel="Add Resident"
          onCta={() => setIsModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(resident => (
            <div
              key={resident.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm cursor-pointer hover:shadow-md hover:border-teal-200 transition-all"
              onClick={() => setSelectedResident(resident)}
            >
              <div className="flex items-start gap-3">
                <Avatar
                  name={`${resident.firstName} ${resident.lastName}`}
                  size="lg"
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">
                    {resident.firstName} {resident.lastName}
                  </p>
                  {resident.unitNumber && (
                    <p className="text-sm text-gray-500">Unit {resident.unitNumber}</p>
                  )}
                  <div className="mt-1.5">
                    <Badge variant={roleBadgeVariant[resident.role]}>
                      {roleLabel[resident.role]}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-gray-500 truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="truncate">{resident.email}</span>
                </div>
                {resident.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    {resident.phone}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedResident && (
        <Modal
          isOpen={!!selectedResident}
          onClose={() => setSelectedResident(null)}
          title="Resident Details"
        >
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar
                name={`${selectedResident.firstName} ${selectedResident.lastName}`}
                size="xl"
              />
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {selectedResident.firstName} {selectedResident.lastName}
                </h3>
                <Badge variant={roleBadgeVariant[selectedResident.role]} className="mt-1">
                  {roleLabel[selectedResident.role]}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Unit</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">
                  {selectedResident.unitNumber ? `Unit ${selectedResident.unitNumber}` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</p>
                <p className="mt-0.5 text-sm text-gray-900">{selectedResident.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</p>
                <p className="mt-0.5 text-sm text-gray-900">{selectedResident.phone ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Member Since</p>
                <p className="mt-0.5 text-sm text-gray-900">
                  {new Date(selectedResident.createdAt).getFullYear()}
                </p>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Resident Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title="Add Resident"
      >
        <form onSubmit={handleAddResident} className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First Name"
              value={formFirstName}
              onChange={e => setFormFirstName(e.target.value)}
              required
            />
            <Input
              label="Last Name"
              value={formLastName}
              onChange={e => setFormLastName(e.target.value)}
              required
            />
          </div>
          <Input
            label="Email Address"
            type="email"
            value={formEmail}
            onChange={e => setFormEmail(e.target.value)}
            required
          />
          <Input
            label="Phone (optional)"
            type="tel"
            value={formPhone}
            onChange={e => setFormPhone(e.target.value)}
            placeholder="(555) 000-0000"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Role"
              value={formRole}
              onChange={e => setFormRole(e.target.value as UserRole)}
              options={[
                { value: 'homeowner', label: 'Homeowner' },
                { value: 'board_member', label: 'Board Member' },
                { value: 'board_admin', label: 'Board Admin' },
              ]}
            />
            <Input
              label="Unit Number"
              value={formUnit}
              onChange={e => setFormUnit(e.target.value)}
              placeholder="e.g., 12"
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              Cancel
            </Button>
            <Button type="submit" isLoading={formLoading}>
              Add Resident
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
