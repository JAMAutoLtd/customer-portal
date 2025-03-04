import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Missing email parameter" }, { status: 400 });
    }

    console.log("📤 Sending email to Zapier:", email);

    const zapierWebhookURL = "https://hooks.zapier.com/hooks/catch/20160419/2q4feka/";

    const response = await fetch(zapierWebhookURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error(`Zapier Error: ${response.status} ${response.statusText}`);
    }

    return NextResponse.json({ message: "Email sent to Zapier" });
  } catch (error) {
    console.error("❌ Error sending email to Zapier:", error);
    return NextResponse.json({ error: "Failed to send email to Zapier" }, { status: 500 });
  }
}
