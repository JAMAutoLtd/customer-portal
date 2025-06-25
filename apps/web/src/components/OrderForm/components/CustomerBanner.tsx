import React from 'react'
import { Customer } from '../types'

interface CustomerBannerProps {
  customer: Customer
}

const getCustomerTypeColor = (type: string) => {
  switch (type) {
    case 'insurance':
      return 'text-purple-600 bg-purple-100'
    case 'commercial':
      return 'text-blue-600 bg-blue-100'
    case 'residential':
      return 'text-green-600 bg-green-100'
    default:
      return 'text-gray-600 bg-gray-100'
  }
}

export const CustomerBanner: React.FC<CustomerBannerProps> = React.memo(
  ({ customer }) => (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-medium text-blue-900 mb-1">
            Creating order for: {customer.full_name || 'Unnamed Customer'}
          </p>
          <div className="text-sm text-blue-700 space-y-1">
            {customer.email && <p>Email: {customer.email}</p>}
            {customer.phone && <p>Phone: {customer.phone}</p>}
            <div className="mt-2">
              <span
                className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getCustomerTypeColor(customer.customer_type)}`}
              >
                {customer.customer_type} customer
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
)
