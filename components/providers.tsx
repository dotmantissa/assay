"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { ThemeProvider } from "next-themes";
export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem>
      {appId ? (
        <PrivyProvider
          appId={appId}
          config={{
            loginMethods: ["email"],
            appearance: {
              theme: "light",
              accentColor: "#000000",
              logo: "/icon.svg",
            },
            legal: {
              termsAndConditionsUrl: "/about",
              privacyPolicyUrl: "/about",
            },
          }}
        >
          {children}
        </PrivyProvider>
      ) : (
        children
      )}
    </ThemeProvider>
  );
}
