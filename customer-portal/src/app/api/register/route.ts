import { NextResponse } from 'next/server';
import { db } from '@/app/db/db';
import { hash } from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, fullName, phone, streetAddress, customerType } = body;

    // Validate required fields
    if (!email || !password || !fullName || !phone || !streetAddress || !customerType) {
      return NextResponse.json(
        { detail: 'All fields are required' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await db.query(
      'SELECT userid FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { detail: 'Email already registered' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await hash(password, 10);

    // Start transaction
    await db.query('BEGIN');

    try {
      // Insert user
      const userResult = await db.query(
        `INSERT INTO users (username, passwordhash, fullname, email, phone, customertype)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING userid`,
        [email, hashedPassword, fullName, email, phone, customerType]
      );
      const userId = userResult.rows[0].userid;

      // Insert address
      const addressResult = await db.query(
        `INSERT INTO addresses (streetaddress)
         VALUES ($1)
         RETURNING addressid`,
        [streetAddress]
      );
      const addressId = addressResult.rows[0].addressid;

      // Link user and address
      await db.query(
        `INSERT INTO useraddressesjunction (userid, addressid)
         VALUES ($1, $2)`,
        [userId, addressId]
      );

      await db.query('COMMIT');

      return NextResponse.json(
        { message: 'Registration successful' },
        { status: 201 }
      );
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { detail: 'Registration failed' },
      { status: 500 }
    );
  }
} 