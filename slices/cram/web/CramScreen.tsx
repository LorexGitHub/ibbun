import { useState } from "react";
import type { StudyItemSummary } from "@mojibun/content-graph";
import { createCramClient, type CramClient } from "./client.ts";
import { Picker } from "./Picker.tsx";
import { Practice } from "./Practice.tsx";

const defaultClient = createCramClient();

export const CramScreen = ({ client = defaultClient }: { client?: CramClient }) => {
  const [items, setItems] = useState<StudyItemSummary[] | null>(null);
  return items ? <Practice items={items} client={client} onDone={() => setItems(null)} /> : <Picker client={client} onStart={setItems} />;
};
