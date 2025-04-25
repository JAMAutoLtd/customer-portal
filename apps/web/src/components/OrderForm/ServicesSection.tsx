import React from 'react'
import { ChevronDownIcon } from '../icons/ChevronDownIcon'
import { ServicesSectionProps } from './types'
import { Service } from '@/types'

const GROUP_NAMES: Record<string, string> = {
  adas: 'ADAS Calibration',
  prog: 'Module Programming',
  immo: 'Immobilizer & Keys',
  diag: 'Diagnostic & Wiring',
}

export const ServicesSection: React.FC<ServicesSectionProps> = ({
  services,
  selectedServices,
  onServiceChange,
}) => {
  const [openGroups, setOpenGroups] = React.useState<string[]>([])

  React.useEffect(() => {
    const groupsWithSelectedServices = new Set<string>()

    selectedServices.forEach((serviceId) => {
      const service = services.find(({ id }) => id === serviceId)
      if (service) {
        const groupSlug = service.slug.split('_')[0]
        groupsWithSelectedServices.add(groupSlug)
      }
    })

    setOpenGroups((prev) => {
      const newGroups = new Set([...prev, ...groupsWithSelectedServices])
      return Array.from(newGroups)
    })
  }, [selectedServices, services])

  const groupedServices = React.useMemo(() => {
    const groups: Record<string, Service[]> = {}

    services.forEach((service) => {
      const groupSlug = service.slug.split('_')[0]
      if (!groups[groupSlug]) {
        groups[groupSlug] = []
      }
      groups[groupSlug].push(service)
    })

    return Object.entries(groups).map(([slug, services]) => ({
      name: GROUP_NAMES[slug] || slug.toUpperCase(),
      slug,
      services: services.sort((a, b) =>
        a.service_name.localeCompare(b.service_name)
      ),
    }))
  }, [services])

  const toggleGroup = (groupSlug: string) => {
    setOpenGroups((prev) =>
      prev.includes(groupSlug)
        ? prev.filter((slug) => slug !== groupSlug)
        : [...prev, groupSlug]
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Services Required</h2>
      <div className="space-y-2">
        {groupedServices.map((group) => (
          <div key={group.slug} className="border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full bg-white flex justify-between items-center p-4 hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
              onClick={() => toggleGroup(group.slug)}
              aria-expanded={openGroups.includes(group.slug)}
            >
              <span className="font-medium text-gray-700">{group.name}</span>
              <ChevronDownIcon
                className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                  openGroups.includes(group.slug) ? 'transform rotate-180' : ''
                }`}
              />
            </button>

            {openGroups.includes(group.slug) && (
              <div className="p-4 pt-0 space-y-2 bg-white">
                {group.services.map((service) => (
                  <label
                    key={service.id}
                    className="flex items-center space-x-2 py-2 hover:bg-gray-100 px-2 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(service.id)}
                      onChange={(e) =>
                        onServiceChange(service.id, e.target.checked)
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">
                      {service.service_name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
