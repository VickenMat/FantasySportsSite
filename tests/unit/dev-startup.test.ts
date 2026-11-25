import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("refuses duplicate ownership before starting any server or worker", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fantasy-startup-"));
  try {
    await mkdir(join(dir, ".dev-stack-lock"));
    await writeFile(join(dir, ".dev-stack-lock", "owner"), String(process.pid));
    const result = await promisify(execFile)(process.execPath, [resolve("scripts/dev-all.mjs")], { cwd: dir })
      .then(() => ({ code: 0, stderr: "" }), (error) => ({ code: error.code, stderr: String(error.stderr) }));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Development stack already owns PID");
    expect(await import("node:fs/promises").then((fs) => fs.readFile(join(dir, ".dev-stack-lock", "owner"), "utf8"))).toBe(String(process.pid));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
