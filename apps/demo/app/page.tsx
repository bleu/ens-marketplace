import { redirect } from "next/navigation";

// Explore *is* home, matching the design's IA — there's no separate landing page.
export default function Home() {
  redirect("/domains");
}
