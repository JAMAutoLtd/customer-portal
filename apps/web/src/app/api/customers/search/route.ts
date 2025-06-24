import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { requireAdminTechnician, logSecurityEvent } from '@/middleware/permissions'
import { normalizePhoneNumber } from '../../../../../utils/phoneNumber'
import {
  nameMatchesSearchTerms,
  normalizeName,
} from '../../../../../utils/nameMatching'

export async function GET(request: Request) {
  // Check permissions first
  const { userProfile, error: permissionError } = await requireAdminTechnician(request);
  
  if (permissionError) {
    await logSecurityEvent(userProfile, 'customer_search_denied', 'customers/search', false, {
      reason: 'insufficient_permissions'
    });
    return permissionError;
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
      // Phone number search
      const normalizedPhone = normalizePhoneNumber(searchTerm)

      // Get all users and filter by normalized phone number
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

      // Get auth emails for matched users
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
      // Email search (case-insensitive)
      const { data: authUsers } = await supabase.auth.admin.listUsers()

      const matchedAuthUsers =
        authUsers?.users?.filter((au) =>
          au.email?.toLowerCase().includes(searchTerm),
        ) || []

      // Get user details for matched auth users
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

      // Log successful search
      await logSecurityEvent(userProfile, 'customer_search_success', 'customers/search', true, {
        search_query: query,
        results_count: customers.length,
        search_type: 'email_phone'
      });

      return NextResponse.json({ customers })
    } else {
      // Name search
      const { data: users, error } = await supabase
        .from('users')
        .select('id, full_name, phone, customer_type, home_address_id')

      if (error) throw error

      // Filter by name match
      const matchedUsers = users.filter((user) =>
        nameMatchesSearchTerms(user.full_name || '', searchTerm),
      )

      // Get auth emails for matched users
      const userIds = matchedUsers.map((u) => u.id)
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

      // Sort by name relevance
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
