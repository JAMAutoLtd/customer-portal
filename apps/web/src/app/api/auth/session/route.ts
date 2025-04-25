import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
          set(name, value, options) {
            try {
              cookieStore.set(name, value, options);
            } catch (error) {
              // Handle cookie setting error
            }
          },
          remove(name, options) {
            try {
              cookieStore.set(name, "", { ...options, maxAge: 0 });
            } catch (error) {
              // Handle cookie removal error
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("Session error:", error);
      return NextResponse.json({ session: null }, { status: 401 });
    }

    return NextResponse.json({ session: data.session }, { status: 200 });
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json({ session: null }, { status: 500 });
  }
}
