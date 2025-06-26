'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Search, Loader2, User, Phone, Mail } from 'lucide-react'
import { debounce } from 'lodash'
import { formatPhoneNumber } from '../utils/phoneNumber'
import { getCustomerTypeColor } from '@/utils/styles'

interface Customer {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  customer_type: 'residential' | 'commercial' | 'insurance'
  home_address_id: number | null
}

interface CustomerSearchProps {
  onSelectCustomer: (customer: Customer) => void
  placeholder?: string
  className?: string
}

export function CustomerSearch({
  onSelectCustomer,
  placeholder = 'Search by name, email, or phone...',
  className = '',
}: CustomerSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const searchCustomers = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setResults([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/customers/search?q=${encodeURIComponent(searchQuery)}`,
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('You must be logged in to search customers')
        } else if (response.status === 403) {
          throw new Error('You do not have permission to search customers')
        } else {
          throw new Error('Failed to search customers')
        }
      }

      const data = await response.json()
      setResults(data.customers || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const debouncedSearch = useCallback(
    debounce((searchQuery: string) => searchCustomers(searchQuery), 500),
    [searchCustomers],
  )

  useEffect(() => {
    debouncedSearch(query)

    return () => {
      debouncedSearch.cancel()
    }
  }, [query, debouncedSearch])

  const handleSelectCustomer = (customer: Customer) => {
    onSelectCustomer(customer)
    setQuery('')
    setResults([])
    setShowResults(false)
  }

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowResults(true)
          }}
          onFocus={() => setShowResults(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          role="combobox"
          aria-expanded={
            showResults && (query.length >= 2 || results.length > 0)
          }
          aria-autocomplete="list"
          aria-describedby={error ? 'search-error' : undefined}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 animate-spin text-gray-400" />
        )}
      </div>

      {showResults && (query.length >= 2 || results.length > 0) && (
        <div
          className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto"
          role="listbox"
        >
          {error ? (
            <div id="search-error" className="p-4 text-red-600 text-sm">
              {error}
            </div>
          ) : results.length === 0 && !isLoading ? (
            <div className="p-4 text-gray-500 text-sm text-center">
              No customers found
            </div>
          ) : (
            <ul className="py-2">
              {results.map((customer) => (
                <li key={customer.id} role="option">
                  <button
                    onClick={() => handleSelectCustomer(customer)}
                    className="w-full px-4 py-3 hover:bg-gray-50 flex items-start gap-3 text-left transition-colors"
                  >
                    <User className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {customer.full_name || 'Unnamed Customer'}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-600">
                        {customer.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {formatPhoneNumber(customer.phone)}
                          </div>
                        )}
                      </div>
                      <div className="mt-1">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getCustomerTypeColor(customer.customer_type)}`}
                        >
                          {customer.customer_type}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {showResults && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowResults(false)}
        />
      )}
    </div>
  )
}
