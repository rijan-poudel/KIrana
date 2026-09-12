import { redirect } from "next/navigation";

// Night Closing moved into the Reports page.
export default function ClosingRedirect() {
  redirect("/reports");
}
