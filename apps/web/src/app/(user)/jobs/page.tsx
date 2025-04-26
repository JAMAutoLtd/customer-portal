'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Loader } from '@/components/ui/Loader'
import { QueuedJobs } from '@/components/jobs/QueuedJobs'
import { PendingJobs } from '@/components/jobs/PendingJobs'

export default function TechnicianJobs() {
  const { user, userProfile, loading } = useAuth()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login')
        return
      }

      // Check if the user is a technician (you might need to adjust this logic based on how technicians are identified)
      if (userProfile?.is_admin) {
        // For now, admins can access this page. You might want to change this logic if needed.
        setIsLoading(false)
      } else {
        setIsLoading(false)
      }
    }
  }, [user, userProfile, loading, router])

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
        <TabsList className="mb-6">
          <TabsTrigger value="queued">Queued</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
        </TabsList>

        <TabsContent value="queued">
          <QueuedJobs />
        </TabsContent>

        <TabsContent value="pending">
          <PendingJobs />
        </TabsContent>
      </Tabs>
    </div>
  )
}
