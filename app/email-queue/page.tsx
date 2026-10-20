import { redirect } from "next/navigation";
export default function QueuePageRedirect() { redirect("/contacts?view=queue"); }
