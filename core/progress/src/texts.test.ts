import { describe } from "vitest";
import { useProgressDb } from "./tests/db.testing.ts";
import { createFakeTexts } from "./fake-texts.ts";
import { createTexts } from "./texts-postgres.ts";
import { textsContract } from "./tests/texts.contract.ts";

describe("Texts, real", () => {
  const pg = useProgressDb();
  textsContract(async () => createTexts(pg.db));
});

describe("Texts, fake", () => {
  textsContract(async () => createFakeTexts());
});
