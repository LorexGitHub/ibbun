import { useState } from "react";
import { StudyItemId } from "@mojibun/shared";
import { createCramClient, type CramClient } from "./client.ts";
import { Picker } from "./Picker.tsx";
import { Practice, type PracticeItem } from "./Practice.tsx";

const defaultClient = createCramClient();

/** The Study Items a link asked for, as in `/cram?items=<id>,<id>`. A link carries no label, so they share one. */
export const askedFor = (search: string): PracticeItem[] =>
  new URLSearchParams(search)
    .getAll("items")
    .flatMap((ids) => ids.split(","))
    .flatMap((id) => {
      const parsed = StudyItemId.safeParse(id);
      return parsed.success ? [{ id: parsed.data, label: "a Study Item from your Reviews" }] : [];
    });

export const CramScreen = ({ client = defaultClient }: { client?: CramClient }) => {
  const [items, setItems] = useState<PracticeItem[] | null>(() => {
    const linked = askedFor(window.location.search);
    return linked.length ? linked : null;
  });
  return items ? <Practice items={items} client={client} onDone={() => setItems(null)} /> : <Picker client={client} onStart={setItems} />;
};
