import { NextResponse } from 'next/server'
import supabase from '@/db/supabaseClient'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, fullName, phone, streetAddress, customerType } =
      body

    // Validate required fields
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

    // Create user with Supabase Auth
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
      .select('addressid')
      .ilike('streetaddress', streetAddress)
      .single()

    let addressId

    if (existingAddress) {
      // Use existing address
      addressId = existingAddress.addressid
    } else {
      // Create new address if it doesn't exist
      const { data: newAddress, error: addressError } = await supabase
        .from('addresses')
        .insert([{ streetaddress: streetAddress }])
        .select()
        .single()

      if (addressError) {
        console.error('Failed to create address:', addressError)
        return NextResponse.json(
          { detail: 'User created but failed to save address' },
          { status: 201 }
        )
      }

      addressId = newAddress.addressid
    }

    // Insert user into our database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([
        {
          username: email,
          passwordhash: 'MANAGED_BY_SUPABASE', // We don't store the actual password
          fullname: fullName,
          email: email,
          phone: phone,
          customertype: customerType,
          homeaddressid: addressId,
          authid: authData.user.id, // Store the Supabase auth ID
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
      .from('useraddressesjunction')
      .insert([
        {
          userid: userData.userid,
          addressid: addressId,
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
