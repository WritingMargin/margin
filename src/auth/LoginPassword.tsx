import { Eye,EyeOff } from "lucide-react";
import type { LoginController } from "./useLogin";
type Props = {
  state: Pick<
    LoginController,
    "setup" | "password" | "setPassword" | "showPassword" | "setShowPassword"
  >;
};
export default function LoginPassword({ state }: Props) {
  const { setup, password, setPassword, showPassword, setShowPassword } = state;
  return (
    <div className="login-password-field">
      <input
        id="login-password"
        type={showPassword ? "text" : "password"}
        required
        minLength={setup ? 12 : 1}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={setup ? "At least 12 characters" : "Your password"}
        autoComplete={setup ? "new-password" : "current-password"}
      />
      <button
        type="button"
        className="password-visibility"
        aria-label={showPassword ? "Hide password" : "Show password"}
        aria-pressed={showPassword}
        aria-controls="login-password"
        onClick={() => setShowPassword((visible) => !visible)}
      >
        {showPassword ? (
          <EyeOff size={18} aria-hidden="true" />
        ) : (
          <Eye size={18} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
