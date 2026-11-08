import { Hono } from "hono";
import type { AuthEnv } from "@mojibun/auth";
import { createClipReviewsApi, type ClipReviewsDeps } from "./clip-reviews-api.ts";

/** The reviews API with the scheduled Listening Clip Reviews under `/listening`. */
export const withListening = (reviews: Hono<AuthEnv>, deps: ClipReviewsDeps) =>
  new Hono<AuthEnv>().route("/listening", createClipReviewsApi(deps)).route("/", reviews);
