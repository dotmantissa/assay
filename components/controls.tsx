"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useTheme } from "next-themes";
import { Moon, Sun, LogIn, LogOut } from "lucide-react";
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      className="icon-button"
      aria-label="Toggle colour theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="sun" size={19} />
      <Moon className="moon" size={19} />
    </button>
  );
}
function EmailControl() {
  const { ready, authenticated, login, logout } = usePrivy();
  return (
    <button
      className="auth-button"
      disabled={!ready}
      onClick={() => (authenticated ? logout() : login())}
    >
      {authenticated ? <LogOut size={17} /> : <LogIn size={17} />}
      <span>{authenticated ? "Sign out" : "Sign in with email"}</span>
    </button>
  );
}
export function AuthButton() {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID ? (
    <EmailControl />
  ) : (
    <button className="auth-button" disabled>
      Email sign in unavailable
    </button>
  );
}
