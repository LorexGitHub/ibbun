import { Hono } from "hono";
import { z } from "zod";
import { defineJob, handler } from "@mojibun/jobs";

export const Ping = defineJob("sample.ping", z.object({ who: z.string() }));
export const pinged: string[] = [];

export const api = new Hono().get("/ping", (c) => c.json({ pong: true }));
export const jobs = [handler(Ping, async ({ who }) => void pinged.push(who))];
