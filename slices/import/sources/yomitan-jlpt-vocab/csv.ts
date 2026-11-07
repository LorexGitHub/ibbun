/** A quoted field starting at `at` (the opening quote): its text, and where the text after the closing quote starts. */
const quoted = (text: string, at: number): [string, number] => {
  let value = "";
  let i = at + 1;
  while (i < text.length) {
    if (text[i] !== '"') value += text[i++];
    else if (text[i + 1] === '"') (value += '"', (i += 2));
    else return [value, i + 1];
  }
  return [value, i];
};

/** An unquoted field starting at `at`, up to the next comma or line break. */
const UNQUOTED = /[^,\n]*/y;
const plain = (text: string, at: number): [string, number] => {
  UNQUOTED.lastIndex = at;
  const [field] = UNQUOTED.exec(text)!;
  return [field.replace(/\r$/, ""), at + field.length];
};

/** RFC 4180 rows: quoted fields may hold commas, doubled quotes and line breaks. Blank lines are dropped. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  while (i < text.length) {
    const [field, end] = text[i] === '"' ? quoted(text, i) : plain(text, i);
    row.push(field);
    i = end + 1;
    if (text[end] === ",") {
      if (i === text.length) row.push("");
    } else {
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  return rows;
};
