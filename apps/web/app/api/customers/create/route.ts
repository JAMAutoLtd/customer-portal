import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

function generateTemporaryPassword(): string {
  // Generate a secure temporary password using crypto
  // Format: XXXX-XXXX-XXXX (12 characters)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  const randomValues = crypto.getRandomValues(new Uint8Array(12));
  let password = '';
  
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) {
      password += '-';
    }
    password += chars[randomValues[i] % chars.length];
  }
  
  return password;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  
  // Check if the current user is an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
    
  if (!userData?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  try {
    const body = await request.json();
    const {
      full_name,
      email,
      phone,
      customer_type,
      street_address,
      address_lat,
      address_lng
    } = body;
    
    // Validate required fields
    if (!full_name || !email || !phone || !customer_type || !street_address) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }
    
    // Phone validation (should be 10 digits after normalization)
    if (phone.length !== 10 || !/^\d+$/.test(phone)) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }
    
    // Check for existing user with same email
    const { data: existingAuthUser } = await supabase.auth.admin.listUsers();
    const emailExists = existingAuthUser?.users?.some(u => u.email === email);
    
    if (emailExists) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }
    
    // Start transaction
    // First, create the address
    const { data: addressData, error: addressError } = await supabase
      .from('addresses')
      .insert({
        street_address,
        lat: address_lat || null,
        lng: address_lng || null
      })
      .select()
      .single();
      
    if (addressError) {
      console.error('Address creation error:', addressError);
      throw new Error('Failed to create address');
    }
    
    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();
    
    // Create auth user with temporary password
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: false, // Don't auto-confirm email
      user_metadata: {
        full_name,
        temp_password: true
      }
    });
    
    if (authError) {
      // Rollback address creation
      await supabase
        .from('addresses')
        .delete()
        .eq('id', addressData.id);
        
      console.error('Auth user creation error:', authError);
      throw new Error('Failed to create user account');
    }
    
    // Create user profile
    const { data: userProfile, error: userError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        full_name,
        phone,
        customer_type,
        home_address_id: addressData.id,
        is_admin: false
      })
      .select()
      .single();
      
    if (userError) {
      // Rollback auth user and address
      await supabase.auth.admin.deleteUser(authData.user.id);
      await supabase
        .from('addresses')
        .delete()
        .eq('id', addressData.id);
        
      console.error('User profile creation error:', userError);
      throw new Error('Failed to create user profile');
    }
    
    // TODO: Add audit logging when audit_logs table is created
    
    return NextResponse.json({
      id: userProfile.id,
      full_name: userProfile.full_name,
      email: authData.user.email,
      phone: userProfile.phone,
      customer_type: userProfile.customer_type,
      home_address_id: userProfile.home_address_id,
      temporary_password: temporaryPassword,
      created_at: authData.user.created_at
    });
    
  } catch (error) {
    console.error('Customer creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create customer' },
      { status: 500 }
    );
  }
}