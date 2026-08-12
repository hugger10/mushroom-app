import { mobileAppController } from "../../services/app-runtime";
import { ensureMobileDeviceInfoReady } from "../../services/app-runtime";
import log from "../../utils/log";
import type { RunAction } from "../../actions/action-types";
import type { MobileAppState } from "../controller/useMobileAppState";
import { i18n } from "../../i18n";

const authLog = log.scope("auth");

export function buildAuthScreenProps(params: {
  state: MobileAppState;
  runAction: RunAction;
}) {
  const { state, runAction } = params;

  return {
    mode: state.mode,
    pending: state.pending,
    loginForm: state.loginForm,
    registerForm: state.registerForm,
    onChangeMode: state.setMode,
    onChangeLoginForm: (value: Partial<typeof state.loginForm>) =>
      state.setLoginForm(current => ({ ...current, ...value })),
    onChangeRegisterForm: (value: Partial<typeof state.registerForm>) =>
      state.setRegisterForm(current => ({ ...current, ...value })),
    onLogin: () => {
      authLog.info("login start", {
        usernameLen: state.loginForm.username?.length ?? 0
      });
      void runAction(
        "",
        async () => {
          try {
            await ensureMobileDeviceInfoReady();
            const result = await mobileAppController.login(state.loginForm);
            authLog.info("login success");
            return result;
          } catch (err) {
            authLog.warn("login failed", {
              err: err instanceof Error ? err.message : String(err)
            });
            throw err;
          }
        },
        ""
      );
    },
    onRegister: () => {
      if (state.registerForm.password !== state.registerForm.confirmPassword) {
        state.setError(i18n.t("auth.validation.passwordMismatch"));
        return;
      }

      authLog.info("register start", {
        usernameLen: state.registerForm.username?.length ?? 0
      });
      void runAction(
        "",
        async () => {
          try {
            await ensureMobileDeviceInfoReady();
            const result = await mobileAppController.register({
              username: state.registerForm.username,
              nickname: state.registerForm.nickname || undefined,
              password: state.registerForm.password
            });
            authLog.info("register success");
            return result;
          } catch (err) {
            authLog.warn("register failed", {
              err: err instanceof Error ? err.message : String(err)
            });
            throw err;
          }
        },
        ""
      );
    }
  };
}
