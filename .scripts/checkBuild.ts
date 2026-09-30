import { isFile } from "./lib/utils";
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import { join } from "node:path/posix";
import { getPackageJson } from "./lib/package";
import { checkDirectory } from "./lib/checkDirectory";

await checkDirectory();

const packageJson = await getPackageJson();

if (await isFile("cli/index.ts")) {
  console.log("validating cli...");
  for (const [cliName, cliFilePath] of Object.entries(packageJson.bin ?? {})) {
    if (cliFilePath) {
      let isExecutable: boolean;
      try {
        await fs.access(cliFilePath, fs.constants.X_OK);
        isExecutable = await isFile(cliFilePath);
      } catch {
        isExecutable = false;
      }
      if (!isExecutable) {
        console.log(`"${cliName}": "${cliFilePath}" is not an executable file`);
        process.exit(1);
      }

      const command = `${cliFilePath} --dry-run`;
      fs.rename("package.json", "package2.json");
      try {
        const stdout = execSync(command).toString().slice(0, 131);
        fs.rename("package2.json", "package.json");
        const expected =
          "--dry-run:\n  - package will not be published\n  - local git changes will not pushed to remote\n\nError: must be run from package root\n";
        if (stdout !== expected) {
          console.log(`unexpected response when running: ${command}\n`);
          console.log("expected:");
          console.log(JSON.stringify(expected));
          console.log("actual:");
          console.log(JSON.stringify(stdout));
          process.exit(1);
        }
      } catch {
        fs.rename("package2.json", "package.json");
      }
    }
  }
}

if (await isFile("lib/index.ts")) {
  console.log("validating api (esm)...");
  if (typeof packageJson.module !== "string") {
    console.log("package.json module must be a path to the esm entrypoint");
    process.exit(1);
  }

  if (packageJson.module) {
    if (!(await isFile(packageJson.module))) {
      console.log(`"module": "${packageJson.module}" must refer to a file`);
      process.exit(1);
    }

    const { publish } = await import(join(process.cwd(), packageJson.module));

    const result = typeof publish;
    const expected = `function`;
    if (result !== expected) {
      console.log("expected:");
      console.log(JSON.stringify(expected));
      console.log("actual:");
      console.log(JSON.stringify(result));
      process.exit(1);
    }
  }

  console.log("validating api (cjs)...");
  if (typeof packageJson.main !== "string") {
    console.log("package.json main must be a path to the cjs entrypoint");
    process.exit(1);
  }

  if (!(await isFile(packageJson.main))) {
    console.log(`"main": "${packageJson.main}" must refer to a file`);
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires, unicorn/prefer-module
  const { publish } = require(join(process.cwd(), packageJson.main));

  const result = typeof publish;
  const expected = `function`;
  if (result !== expected) {
    console.log("expected:");
    console.log(JSON.stringify(expected));
    console.log("actual:");
    console.log(JSON.stringify(result));
    process.exit(1);
  }

  const typesEntryFilePath = packageJson.types;
  if (typeof typesEntryFilePath !== "string" || !(await isFile(typesEntryFilePath))) {
    console.log(`"types": "${typesEntryFilePath}" must refer to a file`);
    process.exit(1);
  }
}
