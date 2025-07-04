import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  requireAdminTechnician,
  logSecurityEvent,
} from '@/middleware/permissions'
import { normalizePhoneNumber } from '../../../../utils/phoneNumber'
import {
  nameMatchesSearchTerms,
  normalizeName,
} from '../../../../utils/nameMatching'

export async function GET(request: Request) {
  const { userProfile, error: permissionError } =
    await requireAdminTechnician(request)

  if (permissionError) {
    await logSecurityEvent(
      userProfile,
      'customer_search_denied',
      'customers/search',
      false,
      {
        reason: 'insufficient_permissions',
      },
    )
    return permissionError
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ customers: [] })
  }

  const supabase = await createClient()

  const searchTerm = query.trim().toLowerCase()

  // Search strategy:
  // 1. Check if it looks like a phone number
  // 2. Check if it looks like an email
  // 3. Otherwise treat as name search

  const isPhoneSearch = /^\d{3,}/.test(searchTerm.replace(/\D/g, ''))
  const isEmailSearch = searchTerm.includes('@')

  try {
    if (isPhoneSearch) {
      const normalizedPhone = normalizePhoneNumber(searchTerm)

      const { data: users, error } = await supabase
        .from('users')
        .select('id, full_name, phone, customer_type, home_address_id')
        .not('phone', 'is', null)

      if (error) throw error

      const matchedUsers = users.filter((user) => {
        const userNormalizedPhone = normalizePhoneNumber(user.phone)
        return (
          userNormalizedPhone.includes(normalizedPhone) ||
          normalizedPhone.includes(userNormalizedPhone)
        )
      })

      const { data: authUsers } = await supabase.auth.admin.listUsers()

      const customers = matchedUsers.map((user) => {
        const authUser = authUsers?.users?.find((au) => au.id === user.id)
        return {
          id: user.id,
          full_name: user.full_name,
          email: authUser?.email || null,
          phone: user.phone,
          customer_type: user.customer_type,
          home_address_id: user.home_address_id,
        }
      })

      return NextResponse.json({ customers })
    } else if (isEmailSearch) {
      console.log('isEmailSearch', searchTerm)
      const { data: authUsers } = await supabase.auth.admin.listUsers()

      const matchedAuthUsers =
        authUsers?.users?.filter((au) =>
          au.email?.toLowerCase().includes(searchTerm),
        ) || []

      const userIds = matchedAuthUsers.map((au) => au.id)

      if (userIds.length === 0) {
        return NextResponse.json({ customers: [] })
      }

      const { data: users, error } = await supabase
        .from('users')
        .select('id, full_name, phone, customer_type, home_address_id')
        .in('id', userIds)

      if (error) throw error

      const customers = users.map((user) => {
        const authUser = matchedAuthUsers.find((au) => au.id === user.id)
        return {
          id: user.id,
          full_name: user.full_name,
          email: authUser?.email || null,
          phone: user.phone,
          customer_type: user.customer_type,
          home_address_id: user.home_address_id,
        }
      })

      await logSecurityEvent(
        userProfile,
        'customer_search_success',
        'customers/search',
        true,
        {
          search_query: query,
          results_count: customers.length,
          search_type: 'email_phone',
        },
      )

      return NextResponse.json({ customers })
    } else {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, full_name, phone, customer_type, home_address_id')

      if (error) throw error

      const matchedUsers = users.filter((user) =>
        nameMatchesSearchTerms(user.full_name || '', searchTerm),
      )

      const { data: authUsers } = await supabase.auth.admin.listUsers()

      const customers = matchedUsers.map((user) => {
        const authUser = authUsers?.users?.find((au) => au.id === user.id)
        return {
          id: user.id,
          full_name: user.full_name,
          email: authUser?.email || null,
          phone: user.phone,
          customer_type: user.customer_type,
          home_address_id: user.home_address_id,
        }
      })

      customers.sort((a, b) => {
        const aName = normalizeName(a.full_name || '')
        const bName = normalizeName(b.full_name || '')
        const aStartsWith = aName.startsWith(searchTerm)
        const bStartsWith = bName.startsWith(searchTerm)

        if (aStartsWith && !bStartsWith) return -1
        if (!aStartsWith && bStartsWith) return 1

        return aName.localeCompare(bName)
      })

      return NextResponse.json({ customers })
    }
  } catch (error) {
    console.error('Customer search error:', error)
    return NextResponse.json(
      { error: 'Failed to search customers' },
      { status: 500 },
    )
  }
}
