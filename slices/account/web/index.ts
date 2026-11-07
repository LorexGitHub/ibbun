import type { WebRoute } from "@mojibun/slice";
import { ForgotPassword, Login, ResetPassword, SignUp } from "./auth-screens.tsx";
import { Settings } from "./settings.tsx";

export const routes: WebRoute[] = [
  { path: "/signup", component: SignUp },
  { path: "/login", component: Login },
  { path: "/forgot-password", component: ForgotPassword },
  { path: "/reset-password", component: ResetPassword },
  { path: "/settings", component: Settings },
];
