'use client'

import React from 'react'
import { Loader } from '@/components/ui/Loader'

interface EmptyStateProps {
  title: string
  description: string
}

export function LoadingState() {
  return (
    <div className="flex justify-center items-center h-64">
      <Loader />
    </div>
  )
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-64 bg-white rounded-md p-8 shadow-sm">
      <p className="text-lg font-medium text-gray-700">{title}</p>
      <p className="text-gray-500 mt-2">{description}</p>
    </div>
  )
}
