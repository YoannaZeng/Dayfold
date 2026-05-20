import { AuthScreen } from "@/components/auth-screen";
import { DayfoldApp } from "@/components/dayfold-app";
import { getCurrentUser } from "@/lib/server/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <DayfoldApp
      currentUser={{
        email: user.email,
        name: user.name ?? "未命名用户"
      }}
    />
  );
}
