'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { User, X, Plus, Copy, CheckCircle, Shield } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CustomerCreateForm } from '@/components/CustomerCreateForm'
import { CustomerSearch } from '@/components/CustomerSearch'
import { OrderForm } from '@/components/OrderForm/OrderForm'
import { OrderEntryGuard, usePermissions } from '@/components/guards/PermissionGuard'

interface Customer {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  customer_type: 'residential' | 'commercial' | 'insurance'
  home_address_id: number | null
}

interface NewCustomer extends Customer {
  temporary_password?: string
}

export default function OrderEntryPage() {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  )
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newCustomerInfo, setNewCustomerInfo] = useState<NewCustomer | null>(
    null,
  )
  const [passwordCopied, setPasswordCopied] = useState(false)
  const { permissionDescription, isAdminTechnician } = usePermissions()

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setNewCustomerInfo(null)
  }

  const handleClearCustomer = () => {
    setSelectedCustomer(null)
    setNewCustomerInfo(null)
  }

  const handleCreateCustomer = (customer: NewCustomer) => {
    setNewCustomerInfo(customer)
    setSelectedCustomer(customer)
    setShowCreateModal(false)
  }

  const copyPassword = () => {
    if (newCustomerInfo?.temporary_password) {
      navigator.clipboard.writeText(newCustomerInfo.temporary_password)
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 2000)
    }
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

  return (
    <OrderEntryGuard
      showError={true}
      fallback={
        <div className="container mx-auto max-w-[768px] px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <Shield className="h-8 w-8 text-red-500 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-red-800 mb-2">Access Restricted</h1>
            <p className="text-red-600 mb-4">
              This feature requires admin-technician privileges to create orders on behalf of customers.
            </p>
            <p className="text-sm text-red-500">
              Current access level: {permissionDescription}
            </p>
          </div>
        </div>
      }
    >
      <div className="container mx-auto max-w-[768px] px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <h1 className="text-2xl font-bold">Create Order for Customer</h1>
          {isAdminTechnician && (
            <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
              <Shield className="h-3 w-3" />
              Admin-Tech
            </div>
          )}
        </div>

      {/* Customer Selection Section */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Select Customer</h2>
          {!selectedCustomer && (
            <Button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 text-sm px-3 py-1"
            >
              <Plus className="h-4 w-4" />
              Create New
            </Button>
          )}
        </div>

        {!selectedCustomer ? (
          <CustomerSearch
            onSelectCustomer={handleSelectCustomer}
            placeholder="Search by name, email, or phone..."
            className="w-full"
          />
        ) : (
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">
                  {selectedCustomer.full_name || 'Unnamed Customer'}
                </div>
                {selectedCustomer.email && (
                  <div className="text-sm text-gray-600">
                    {selectedCustomer.email}
                  </div>
                )}
                {selectedCustomer.phone && (
                  <div className="text-sm text-gray-600">
                    {selectedCustomer.phone}
                  </div>
                )}
                <div className="mt-1">
                  <span
                    className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getCustomerTypeColor(selectedCustomer.customer_type)}`}
                  >
                    {selectedCustomer.customer_type}
                  </span>
                </div>
              </div>
            </div>
            <Button
              onClick={handleClearCustomer}
              variant="destructive"
              className="flex items-center gap-1 text-sm px-3 py-1"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Order Form Section - Only show when customer is selected */}
      {selectedCustomer && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <OrderForm
            customer={selectedCustomer}
            onSuccess={() => {
              // Handle successful order creation
              setSelectedCustomer(null)
              setNewCustomerInfo(null)
            }}
            onCancel={() => {
              // Handle cancel - could clear customer or just close form
              setSelectedCustomer(null)
              setNewCustomerInfo(null)
            }}
          />
        </div>
      )}

      {/* Instructions when no customer selected */}
      {!selectedCustomer && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          <p className="font-medium mb-1">Getting Started</p>
          <p>
            Search for an existing customer or create a new one to begin
            creating an order.
          </p>
        </div>
      )}

      {/* New Customer Password Info */}
      {newCustomerInfo?.temporary_password && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
          <div className="flex items-start gap-2 mb-2">
            <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-green-900">
                Customer Created Successfully!
              </p>
              <p className="text-sm text-green-700 mt-1">
                Temporary password for {newCustomerInfo.full_name}:
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <code className="bg-white px-3 py-1 rounded border border-green-300 font-mono text-sm flex-1">
              {newCustomerInfo.temporary_password}
            </code>
            <Button
              onClick={copyPassword}
              variant={passwordCopied ? 'default' : 'secondary'}
              className="flex items-center gap-1 text-sm px-3 py-1"
            >
              {passwordCopied ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-green-600 mt-2">
            Please save this password. The customer will need it to activate
            their account.
          </p>
        </div>
      )}

      {/* Create Customer Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Customer"
      >
        <CustomerCreateForm
          onSuccess={handleCreateCustomer}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>
      </div>
    </OrderEntryGuard>
  )
}
