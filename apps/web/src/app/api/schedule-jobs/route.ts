import { NextResponse } from 'next/server'
import { GoogleAuth } from 'google-auth-library'

export async function GET() {
  const SCHEDULER_BASE_URL = process.env.SCHEDULER_BASE_URL
  const GCP_SERVICE_ACCOUNT_KEY = process.env.GCP_SERVICE_ACCOUNT_KEY

  if (!SCHEDULER_BASE_URL || !GCP_SERVICE_ACCOUNT_KEY) {
    throw new Error('SCHEDULER_BASE_URL or GCP_SERVICE_ACCOUNT_KEY is not set')
  }

  try {
    const decodedKey = Buffer.from(GCP_SERVICE_ACCOUNT_KEY, 'base64').toString(
      'utf-8',
    )
    const credentials = JSON.parse(decodedKey)

    const auth = new GoogleAuth({
      credentials,
    })

    const client = await auth.getIdTokenClient(SCHEDULER_BASE_URL)

    const response = await client.request({
      url: `${SCHEDULER_BASE_URL}/run-replan`,
      method: 'POST',
    })

    return NextResponse.json(response.data)
  } catch (error) {
    console.error('Error calling the scheduler:', error)
    return NextResponse.json(
      { error: `Failed to call the scheduler: ${error}` },
      { status: 500 },
    )
  }
}
