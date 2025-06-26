export const getCustomerTypeColor = (type: string) => {
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
