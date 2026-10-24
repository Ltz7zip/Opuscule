import type { SessionState } from "../types";
import { AuthTerminal } from "./AuthTerminal";

interface RegisterPageProps {
  session: SessionState | null;
  onLogin: (session: SessionState) => void;
}

/** Same gate in register mode; open registration remains a new-site feature. */
export function RegisterPage({ session, onLogin }: RegisterPageProps) {
  return <AuthTerminal mode="register" session={session} onLogin={onLogin} />;
}
