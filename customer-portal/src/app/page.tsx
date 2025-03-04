import { redirect } from "next/navigation";

export default function Home() {
  // Force redirect at runtime
  redirect("/dashboard");
}
