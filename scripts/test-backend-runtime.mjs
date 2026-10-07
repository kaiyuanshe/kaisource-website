// Start a disposable PostgreSQL cluster on a Unix socket only. No production
// URL is read, and this script never opens a public database port.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const workspace = mkdtempSync(path.join(tmpdir(), "kaisource-pg-test-"));
const data = path.join(workspace, "data");
const goBinary = process.env.KAISOURCE_TEST_GO || "go";
let started = false;
function run(command, args, env = {}) {
  const result = spawnSync(command === "go" ? goBinary : command, args, {
    cwd: path.join(root, "kaiyuanshe"),
    env: { ...process.env, ...env },
    encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    // Test commands use disposable data only. No third-party credentials.
    throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout;
}
try {
  run("initdb", ["-D", data, "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  run("pg_ctl", ["-D", data, "-l", path.join(workspace, "postgres.log"), "-o",
    `-k ${workspace} -p 55439 -c listen_addresses=''`, "-w", "start"]);
  started = true;
  run("createdb", ["-h", workspace, "-p", "55439", "kaisource_runtime_test"]);
  const url = new URL("postgresql://localhost/kaisource_runtime_test");
  url.searchParams.set("host", workspace);
  url.searchParams.set("port", "55439");
  url.searchParams.set("sslmode", "disable");
  const output = run("go", ["test", "./integration", "-count=1", "-v"], {
    KAISOURCE_TEST_DATABASE_URL: url.toString(),
    KAISOURCE_TEST_REPOSITORY: root,
    KAISOURCE_TEST_NEXTAUTH: process.argv.includes("--nextauth") ? "true" : "",
    KAISOURCE_CONFIG_FILE: "",
    KAISOURCE_DATABASE_URL: url.toString(),
    DATABASE_URL: url.toString(),
    JWT_SECRET: "isolated-runtime-test-key-not-for-production",
    KAISOURCE_JWT_SECRET: "isolated-runtime-test-key-not-for-production",
  });
  console.log(output.trim());
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(workspace, { recursive: true, force: true });
}
