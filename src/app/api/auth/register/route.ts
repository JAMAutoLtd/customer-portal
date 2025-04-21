import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const {
      email,
      password,
      fullName,
      phone,
      streetAddress,
      lat,
      lng,
      customerType,
    } = body

    if (
      !email ||
      !password ||
      !fullName ||
      !phone ||
      !streetAddress ||
      !customerType
    ) {
      return NextResponse.json(
        { detail: 'All fields are required' },
        { status: 400 }
      )
    }

    // Create user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone,
          customer_type: customerType,
        },
      },
    })

    if (authError) {
      return NextResponse.json({ detail: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json(
        { detail: 'Failed to create user' },
        { status: 500 }
      )
    }

    // Check if address already exists (case-insensitive search)
    const { data: existingAddress } = await supabase
      .from('addresses')
      .select('id')
      .ilike('street_address', streetAddress)
      .single()

    let addressId

    if (existingAddress) {
      addressId = existingAddress.id

      // Update coordinates if provided and address exists
      if (lat !== undefined && lng !== undefined) {
        await supabase
          .from('addresses')
          .update({ lat, lng })
          .eq('id', addressId)
      }
    } else {
      // Prepare address data with coordinates if provided
      const addressData: {
        street_address: string
        lat?: number
        lng?: number
      } = {
        street_address: streetAddress,
      }

      if (lat !== undefined && lng !== undefined) {
        addressData.lat = lat
        addressData.lng = lng
      }

      const { data: newAddress, error: addressError } = await supabase
        .from('addresses')
        .insert([addressData])
        .select()
        .single()

      if (addressError) {
        console.error('Failed to create address:', addressError)
        return NextResponse.json(
          { detail: 'User created but failed to save address' },
          { status: 201 }
        )
      }

      addressId = newAddress.id
    }

    // Insert user into our database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([
        {
          id: authData.user.id,
          full_name: fullName,
          phone: phone,
          home_address_id: addressId,
          customer_type: customerType,
          is_admin: false,
        },
      ])
      .select()
      .single()

    if (userError) {
      console.error('Failed to create user profile:', userError)
      return NextResponse.json(
        { detail: 'User created but profile creation failed' },
        { status: 201 }
      )
    }

    // Create user-address junction
    const { error: junctionError } = await supabase
      .from('user_addresses')
      .insert([
        {
          user_id: userData.id,
          address_id: addressId,
        },
      ])

    if (junctionError) {
      console.error('Failed to create address junction:', junctionError)
      return NextResponse.json(
        { detail: 'User created but address linking failed' },
        { status: 201 }
      )
    }

    return NextResponse.json(
      { message: 'Registration successful' },
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({ detail: 'Registration failed' }, { status: 500 })
  }
}
