import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export type Migration = {
  /** Unique across the workspace: `<package>/<file>`. */
  id: string;
  /** Postgres schema the migration runs in: the package directory name, `-` as `_`. */
  schema: string;
  /** 14 digits, `YYYYMMDDHHmmss`. Migrations apply in this order. */
  timestamp: string;
  sql: string;
};

const FILE = /^(\d{14})_[a-z0-9_-]+\.sql$/;
const PACKAGE_ROOTS = ["apps", "core", "platform", "slices"] as const;

export const parseMigrationFile = (packageDir: string, file: string, sql: string): Migration => {
  const match = FILE.exec(file);
  if (!match) {
    throw new Error(`${packageDir}: migration "${file}" must be named <YYYYMMDDHHmmss>_<name>.sql`);
  }
  const name = basename(packageDir);
  return { id: `${name}/${file}`, schema: name.replaceAll("-", "_"), timestamp: match[1]!, sql };
};

const readMigrations = async (packageDir: string): Promise<Migration[]> => {
  const dir = join(packageDir, "db", "migrations");
  const files = await readdir(dir).catch(() => [] as string[]);
  return Promise.all(
    files
      .filter((f) => f.endsWith(".sql"))
      .map(async (f) => parseMigrationFile(packageDir, f, await readFile(join(dir, f), "utf8"))),
  );
};

/** Every migration of every package, in the order they must run. */
export const collectMigrations = async (packageDirs: string[]): Promise<Migration[]> => {
  const all = (await Promise.all(packageDirs.map(readMigrations))).flat();
  return all.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
};

export const workspacePackageDirs = async (root: string): Promise<string[]> => {
  const dirs = await Promise.all(
    PACKAGE_ROOTS.map(async (r) => {
      const entries = await readdir(join(root, r), { withFileTypes: true }).catch(() => []);
      return entries.filter((e) => e.isDirectory()).map((e) => join(root, r, e.name));
    }),
  );
  return dirs.flat();
};
