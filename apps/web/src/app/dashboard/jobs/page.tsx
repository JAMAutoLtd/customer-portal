'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Loader } from '@/components/ui/Loader'
import { QueuedJobs } from '@/components/jobs/QueuedJobs'
import { PendingJobs } from '@/components/jobs/PendingJobs'
import { CompletedJobs } from '@/components/jobs/CompletedJobs'
import { Button } from '@/components/ui/Button'
import { CalendarSync } from 'lucide-react'

function usePendingJobsCount() {
  const [count, setCount] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchPendingJobsCount = async () => {
      try {
        const response = await fetch('/api/jobs/pending/count')
        if (!response.ok) {
          throw new Error('Failed to fetch pending jobs count')
        }
        const { count: pendingCount } = await response.json()
        setCount(pendingCount)
      } catch (error) {
        console.error('Error fetching pending jobs count:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchPendingJobsCount()
  }, [])

  return { count, isLoading }
}

export default function TechnicianJobs() {
  const { user, userProfile, loading } = useAuth()
  const { count: pendingJobsCount, isLoading: countLoading } =
    usePendingJobsCount()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login')
        return
      }

      // Check if the user is a technician
      if (userProfile?.is_admin) {
        setIsLoading(false)
      } else {
        setIsLoading(false)
      }
    }
  }, [user, userProfile, loading, router])

  const handleReplan = async () => {
    const response = await fetch('/api/schedule-jobs')
    if (!response.ok) {
      throw new Error('Failed to replan jobs')
    }
  }

  if (loading || isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-[768px]">
      <Tabs defaultValue="queued" className="w-full">
        <div className="w-full flex justify-between">
          <TabsList className="mb-6">
            <TabsTrigger value="queued">Queued</TabsTrigger>
            <TabsTrigger value="pending" className="relative">
              Pending
              {!countLoading && pendingJobsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs rounded-full h-4 px-1 flex items-center justify-center min-w-4">
                  {pendingJobsCount > 99 ? '99+' : pendingJobsCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <Button
            onClick={handleReplan}
            className="whitespace-nowrap flex items-center"
          >
            <CalendarSync className="inline-block w-5 h-5" />
            <span className="hidden md:inline ml-2">Replan</span>
          </Button>
        </div>

        <TabsContent value="queued">
          <QueuedJobs />
        </TabsContent>

        <TabsContent value="pending">
          <PendingJobs />
        </TabsContent>

        <TabsContent value="completed">
          <CompletedJobs />
        </TabsContent>
      </Tabs>
    </div>
  )
}
