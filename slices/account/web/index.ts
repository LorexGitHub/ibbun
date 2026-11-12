import type { WebRoute, Widget } from "@mojibun/slice";
import { ForgotPassword, Login, ResetPassword, SignUp } from "./auth-screens.tsx";
import { Settings } from "./settings.tsx";
import { TryReview } from "./try.tsx";

export const routes: WebRoute[] = [
  { path: "/signup", component: SignUp },
  { path: "/login", component: Login },
  { path: "/try", component: TryReview },
  { path: "/forgot-password", component: ForgotPassword },
  { path: "/reset-password", component: ResetPassword },
  { path: "/settings", component: Settings },
];

/** A visitor's first screen is the sign-up split; the shell shows it in its `welcome` slot. */
export const widgets: Widget[] = [{ slot: "welcome", component: SignUp }];
