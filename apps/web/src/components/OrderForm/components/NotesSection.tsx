import React from 'react'

interface NotesSectionProps {
  notes: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
}

export const NotesSection: React.FC<NotesSectionProps> = React.memo(
  ({ notes, onChange }) => (
    <div>
      <label
        htmlFor="notes"
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        Additional Notes
      </label>
      <textarea
        id="notes"
        name="notes"
        value={notes}
        onChange={onChange}
        rows={4}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Any additional information or special requests..."
      />
    </div>
  ),
)
