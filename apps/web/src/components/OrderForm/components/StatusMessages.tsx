import React from 'react'

interface StatusMessagesProps {
  success: boolean
  error: string | null
}

export const StatusMessages: React.FC<StatusMessagesProps> = React.memo(
  ({ success, error }) => (
    <>
      {success && (
        <div className="mb-4 p-4 bg-green-100 text-green-800 rounded-lg">
          Order submitted successfully! You can view it in your dashboard.
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-lg">
          {error}
        </div>
      )}
    </>
  ),
)
