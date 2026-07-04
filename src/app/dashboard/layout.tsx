import { auth } from "@/lib/auth";
import { SessionProvider } from "next-auth/react";
import DashboardShell from "./DashboardShell";

export default async function DashboardLayoutServer({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <SessionProvider session={session}>
      <DashboardShell>{children}</DashboardShell>
    </SessionProvider>
  );
}
