import { mobileAppController } from "../../services/app-runtime";
import { ensureMobileDeviceInfoReady } from "../../services/app-runtime";
import log from "../../utils/log";
import type { RunAction } from "../../actions/action-types";
import type { MobileAppState } from "../controller/useMobileAppState";
import { i18n } from "../../i18n";

const authLog = log.scope("auth");

/**
 * UI-only 占位：手机号/验证码登录的后端链路尚未接入。
 * 预留清晰的提交入口，后续接入服务端后无需重写 UI。
 */
function phoneMethodUnavailable(state: MobileAppState) {
  state.setStatus(i18n.t("auth.phoneMethodUnavailable"), "user");
  authLog.info("phone auth requested but backend not wired", {
    ready: false
  });
}

export function buildAuthScreenProps(params: {
  state: MobileAppState;
  runAction: RunAction;
}) {
  const { state, runAction } = params;

  return {
    mode: state.mode,
    authMethod: state.authMethod,
    pending: state.pending,
    loginForm: state.loginForm,
    registerForm: state.registerForm,
    phoneLoginForm: state.phoneLoginForm,
    phoneRegisterForm: state.phoneRegisterForm,
    onChangeMode: state.setMode,
    onChangeAuthMethod: state.setAuthMethod,
    onChangeLoginForm: (value: Partial<typeof state.loginForm>) =>
      state.setLoginForm(current => ({ ...current, ...value })),
    onChangeRegisterForm: (value: Partial<typeof state.registerForm>) =>
      state.setRegisterForm(current => ({ ...current, ...value })),
    onChangePhoneLoginForm: (value: Partial<typeof state.phoneLoginForm>) =>
      state.setPhoneLoginForm(current => ({ ...current, ...value })),
    onChangePhoneRegisterForm: (
      value: Partial<typeof state.phoneRegisterForm>
    ) => state.setPhoneRegisterForm(current => ({ ...current, ...value })),
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
    },
    onPhoneLogin: () => phoneMethodUnavailable(state),
    onPhoneRegister: () => phoneMethodUnavailable(state),
    onSendCode: () => phoneMethodUnavailable(state)
  };
}
