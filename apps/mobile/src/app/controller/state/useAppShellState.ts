import { useCallback, useState } from "react";
import type { MobileAppSnapshot } from "@mushroom/app-core";
import type { AuthMethod, AuthMode, HomeTab } from "../../../types/app";
import {
  createStatusMessage,
  type StatusLevel,
  type StatusMessage
} from "./status-types";
import { i18n } from "../../../i18n";

export function useAppShellState() {
  const [snapshot, setSnapshot] = useState<MobileAppSnapshot | null>(null);
  // Initial status is `silent` so the bootstrap message never flashes a toast.
  // Toast.tsx also has a "skip first" guard, but using `silent` here makes the
  // intent explicit and survives future Toast refactors.
  const [status, setStatusInternal] = useState<StatusMessage>(() =>
    createStatusMessage(i18n.t("app.starting"), "silent")
  );
  const setStatus = useCallback((text: string, level: StatusLevel = "user") => {
    setStatusInternal(createStatusMessage(text, level));
  }, []);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  // True after a WS (re)connect until the first sync finishes: gates the
  // top-of-screen "Receiving messages…" status so it only appears while
  // catching up on messages missed while offline / in background.
  const [catchingUp, setCatchingUp] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("account");
  const [tab, setTab] = useState<HomeTab>("chats");
  const [loginForm, setLoginForm] = useState({
    username: "zhangsan",
    password: "123456"
  });
  const [registerForm, setRegisterForm] = useState({
    username: "",
    nickname: "",
    password: "",
    confirmPassword: ""
  });
  const [phoneLoginForm, setPhoneLoginForm] = useState({
    phone: "",
    code: ""
  });
  const [phoneRegisterForm, setPhoneRegisterForm] = useState({
    phone: "",
    code: "",
    nickname: "",
    password: ""
  });

  return {
    snapshot,
    setSnapshot,
    status,
    setStatus,
    error,
    setError,
    pending,
    setPending,
    catchingUp,
    setCatchingUp,
    mode,
    setMode,
    authMethod,
    setAuthMethod,
    tab,
    setTab,
    loginForm,
    setLoginForm,
    registerForm,
    setRegisterForm,
    phoneLoginForm,
    setPhoneLoginForm,
    phoneRegisterForm,
    setPhoneRegisterForm
  };
}
