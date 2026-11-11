import type { PublicationType } from "../../shared/publication";
import { useState } from "react";
import { api,APIError,json } from "../api";

export function useLogin({
  setup,
  onLogin,
}: {
  setup: boolean;
  onLogin: () => Promise<void>;
}) {
  const [publicationType, setPublicationType] = useState<PublicationType>("blog");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        setup ? "/setup" : "/login",
        json("POST", { email, password, setupToken, ...(setup ? { publicationType } : {}) }),
      );
      await onLogin();
    } catch (e) {
      if (setup && e instanceof APIError && e.code === "SETUP_COMPLETE") {
        try {
          await onLogin();
        } catch (refreshError) {
          setError((refreshError as Error).message);
        }
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return {
    submit,
    publicationType,
    setPublicationType,

    setup,
    onLogin,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    setupToken,
    setSetupToken,
    error,
    setError,
    busy,
    setBusy,
  };
}
export type LoginController = ReturnType<typeof useLogin>;
