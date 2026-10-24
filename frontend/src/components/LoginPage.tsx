import type { SessionState } from "../types";
import { AuthTerminal } from "./AuthTerminal";

interface LoginPageProps {
  session: SessionState | null;
  onLogin: (session: SessionState) => void;
}

/** 0.8.1 terminal gate; the API/session layer is still the new one. */
export function LoginPage({ session, onLogin }: LoginPageProps) {
  return <AuthTerminal mode="login" session={session} onLogin={onLogin} />;
}
