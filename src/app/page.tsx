import { redirect } from "next/navigation";

export default function Home() {
  // TODO: if a user is logged in, redirect to the dashboard, otherwise redirect to the login page
  redirect("/dashboard");
}
