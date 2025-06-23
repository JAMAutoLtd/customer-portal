'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Link from 'next/link'
import { Mail, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'

export default function ActivatePage() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/customers/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: data.message })
        setIsSubmitted(true)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send activation email' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <Mail className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Check Your Email
            </h2>
            {message && (
              <p className="text-sm text-gray-600 mb-6">
                {message.text}
              </p>
            )}
            <div className="space-y-4">
              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                <p className="font-medium mb-1">What's next?</p>
                <ul className="text-left space-y-1">
                  <li>• Check your email inbox</li>
                  <li>• Click the activation link</li>
                  <li>• Set your new password</li>
                  <li>• Log in to your account</li>
                </ul>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setIsSubmitted(false)
                    setEmail('')
                    setMessage(null)
                  }}
                  variant="secondary"
                  className="flex-1"
                >
                  Send Another Email
                </Button>
                <Link href="/login" className="flex-1">
                  <Button className="w-full">
                    Go to Login
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
            <Mail className="h-6 w-6 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Activate Your Account
          </h1>
          <p className="text-sm text-gray-600 mt-2">
            Enter your email address to receive an activation link
          </p>
        </div>

        {/* Activation Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              required
              disabled={isSubmitting}
              className="w-full"
            />
          </div>

          {message && (
            <div className={`p-3 rounded-lg flex items-start gap-2 ${
              message.type === 'success' 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              {message.type === 'success' ? (
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              )}
              <p className={`text-sm ${
                message.type === 'success' ? 'text-green-700' : 'text-red-700'
              }`}>
                {message.text}
              </p>
            </div>
          )}

          <Button 
            type="submit" 
            disabled={isSubmitting || !email.trim()}
            className="w-full"
          >
            {isSubmitting ? 'Sending...' : 'Send Activation Email'}
          </Button>
        </form>

        {/* Help Info */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            Need Help?
          </h3>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• Activation emails may take a few minutes to arrive</li>
            <li>• Check your spam/junk folder</li>
            <li>• You can request up to 3 emails per hour</li>
            <li>• Contact support if you continue having issues</li>
          </ul>
        </div>

        {/* Back to Login */}
        <div className="mt-6 text-center">
          <Link 
            href="/login" 
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  )
}