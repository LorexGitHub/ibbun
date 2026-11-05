import { z } from "zod";

export type Id<Brand extends string> = string & z.BRAND<Brand>;

/** A UUID that TypeScript refuses to mix up with a UUID of another kind. */
export const idSchema = <Brand extends string>(_brand: Brand) =>
  z.uuid().brand<Brand>();

export const LearnerId = idSchema("LearnerId");
export type LearnerId = z.infer<typeof LearnerId>;

export const StudyItemId = idSchema("StudyItemId");
export type StudyItemId = z.infer<typeof StudyItemId>;
