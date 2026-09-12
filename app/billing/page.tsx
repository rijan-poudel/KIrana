import { redirect } from "next/navigation";

// The counter moved to the home screen.
export default function BillingRedirect() {
  redirect("/");
}
