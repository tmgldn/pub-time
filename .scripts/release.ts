import { execSync, exec } from "node:child_process";
import { delay, dnsLookup, isFile, readFile, readInput, deleteAny, writeFile } from "./lib/utils";
import { firstIsBefore, parseVersion } from "./lib/version";
import { getPackageRoot, getPackageJson } from "./lib/package";

// preconditions
{
  if (process.cwd() !== (await getPackageRoot())) {
    console.log("must be run from package root");
    process.exit(1);
  }
  execSync("git fetch --all --prune");
  const statusStdout = execSync("git --no-optional-locks status --porcelain=2 --branch").toString();
  const isPointingAtRemoteMain = statusStdout.includes("\n# branch.upstream origin/main");
  if (!isPointingAtRemoteMain) {
    console.log("can only release from main (with origin/main as upstream)");
    process.exit(1);
  }
  const hasPendingFiles = statusStdout
    .split("\n")
    .some((line) => Boolean(line) && !line.startsWith("# "));
  if (hasPendingFiles) {
    console.log("local has uncommitted files");
    process.exit(1);
  }
  const isUpToDateWithRemote = statusStdout.includes("\n# branch.ab +0 -0");
  if (!isUpToDateWithRemote) {
    console.log("local is not level with remote");
    process.exit(1);
  }
}

// custom validation
const errors: string[] = [];
const warnings: string[] = [];
{
  const packageJson = await getPackageJson();

  // validation errors
  if (!packageJson.engines?.node) {
    errors.push(`package.json should specify the node version it is compatible with`);
  }
  if (packageJson.files === undefined) {
    errors.push(`package.json should include a files array`);
  }
  if (packageJson.name === undefined) {
    errors.push(`package.json should have a name`);
  }
  if (packageJson.homepage === undefined) {
    errors.push(`package.json should have a homepage pointed to the git repo`);
  }
  if (
    packageJson?.scripts?.test === undefined ||
    packageJson.scripts.test.includes("no test specified")
  ) {
    errors.push(`package.json should include a test script`);
  }
  if (packageJson.keywords === undefined || packageJson.keywords.length < 7) {
    errors.push(`package.json should have at least 7 keywords`);
  }
  if ((packageJson.description?.length ?? 0) < 10) {
    errors.push(`package.json should have a short description`);
  }
  if (packageJson.license === undefined) {
    errors.push(`package.json needs a licence`);
  }
  if (!(await isFile("README.md")) || (await readFile("README.md")).length < 800) {
    errors.push(`project should contain a README.md (with 800+ chars)`);
  }
  const npmVulnerabilites = await new Promise<string>((resolve) => {
    exec("npm audit", (err, stdout) => {
      resolve(err ? stdout.trim() : "");
    });
  });
  if (npmVulnerabilites) {
    errors.push(
      `npm dependencies contain vulnerabilities:\n${npmVulnerabilites
        .split("\n")
        .map((line) => `  │ ${line}`)
        .join("\n")}`
    );
  }

  // validation warnings
  if (Object.keys(packageJson.devDependencies ?? {}).length === 0) {
    warnings.push(`package.json should probably have dev dependencies`);
  }
  if (
    !(
      Object.keys(packageJson.dependencies ?? {}).length > 0 ||
      Object.keys(packageJson.peerDependencies ?? {}).length > 0 ||
      Object.keys(packageJson.optionalDependencies ?? {}).length > 0
    )
  ) {
    warnings.push(`package.json should probably have dependencies`);
  }

  // - standardised readme format / that can be checked? e.g. has example usage, fixed titles

  if (errors.length > 0) {
    console.log(`ERRORS:\n${errors.map((message) => `- ${message}`).join("\n")}`);
    console.log();
  }
  if (warnings.length > 0) {
    console.log(`WARNINGS:\n${warnings.map((message) => `- ${message}`).join("\n")}`);
    console.log();
  }
  if (errors.length > 0) {
    process.exit(1);
  }

  if (warnings.length > 0) {
    const answer = await readInput("Some warnings - continue anyway? [N/y]");
    if (answer.trim().toLowerCase() !== "y") {
      process.exit(1);
    }
    console.log();
  }
}

// calculating next version using semantic release principles
type Commit = { hash: string; message: string; footer: string };
let nextVersion: string;
let changelogCommits: Commit[];
const majors: Commit[] = [];
const minors: Commit[] = [];
const patchs: Commit[] = [];
{
  let currVersionStr: string;
  try {
    currVersionStr = execSync(`npm show 'pub-time' version`, {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
  } catch {
    // this dns lookup checks if they have internet
    if (await dnsLookup("https://example.com")) {
      currVersionStr = "0.0.0-new";
    } else {
      console.log("error determining latest version of pub-time on npm registry");
      process.exit(1);
    }
  }
  const currVersion = parseVersion(currVersionStr);

  // get all commits with hashes, messages and footers
  const rawGitLogStr = execSync(`git --no-pager log --format=format:'%H$%n%B'`).toString();
  const matches = [...rawGitLogStr.matchAll(/(?<=^|\n)[\da-f]{40}(?=\$\n)/g)];
  const commits: Commit[] = new Array(matches.length);
  let prevIndex = rawGitLogStr.length;
  for (let i = matches.length - 1; i >= 0; i--) {
    const currIndex = matches[i].index as number;
    const hash = rawGitLogStr.slice(currIndex, currIndex + 40);
    const body = rawGitLogStr.slice(currIndex + 42, prevIndex - 1);
    let firstNewlineIndex = body.indexOf("\n");
    if (firstNewlineIndex === -1) firstNewlineIndex = Number.POSITIVE_INFINITY;
    const message = body.slice(0, firstNewlineIndex).trim();
    const footer = body.slice(firstNewlineIndex + 1).trim();

    commits[i] = { hash, message, footer };
    prevIndex = currIndex;
  }

  let indexOfPrevVersion = 0;
  for (const commit of commits) {
    const pkgJsonStr = execSync(`git show ${commit.hash}:package.json`).toString();
    let pkgJson: Record<string, unknown> = {};
    try {
      pkgJson = JSON.parse(pkgJsonStr);
    } catch {}
    const versionStr = typeof pkgJson.version === "string" ? pkgJson.version : "0.0.0-new";
    const version = parseVersion(versionStr);
    if (firstIsBefore(version, currVersion)) {
      break;
    } else {
      indexOfPrevVersion++;
    }
  }

  const FEAT_REGEX = /^feat(\([^)]+\))?!?:/;
  const BREAKING_CHANGE_REGEX = /^[a-z]+(\([^)]+\))?!:/;
  const CONVENTIONAL_COMMIT_REGEX = /^[a-z]+(\([^)]+\))?!?:/;
  changelogCommits = commits.slice(0, indexOfPrevVersion);

  if (changelogCommits.length === 0) {
    console.log("no new commits since newest version");
    process.exit(1);
  }

  for (const commit of changelogCommits) {
    const { message, footer } = commit;
    if (CONVENTIONAL_COMMIT_REGEX.test(message)) {
      if (BREAKING_CHANGE_REGEX.test(message) || footer.includes("BREAKING CHANGE: ")) {
        majors.push(commit);
      } else if (FEAT_REGEX.test(message)) {
        minors.push(commit);
      } else {
        patchs.push(commit);
      }
    }
  }

  if (
    currVersion.major >= 1 &&
    firstIsBefore(currVersion, { major: currVersion.major, minor: 0, patch: 0 })
  ) {
    nextVersion = `${currVersion.major}.0.0`;
  } else if (firstIsBefore(currVersion, { major: 0, minor: 1, patch: 0 })) {
    nextVersion = `${currVersion.major}.1.0`;
  } else {
    if (majors.length > 0) {
      nextVersion = `${currVersion.major + 1}.0.0`;
    } else if (minors.length > 0) {
      nextVersion = `${currVersion.major}.${currVersion.minor + 1}.0`;
    } else {
      nextVersion = `${currVersion.major}.${currVersion.minor}.${currVersion.patch + 1}`;
    }
  }
}

// suggest untestable final sanity checklist
console.log(`Final checklist:`);
console.log(`
- do you need to update the readme?
- would anything be better as a peer dependency?
- are the examples in the readme examples for cli/api also tests?
`);
for (let i = 5; i >= 1; i--) {
  process.stdout.write(i + "…");
  await delay(1000);
}
const answer = await readInput(`release ${nextVersion}? [N/y]`);
if (answer.trim().toLowerCase() !== "y") {
  console.log(majors);
  console.log(minors);
  console.log(patchs);
  process.exit(1);
}

// final checks
await writeFile(
  "package.json",
  JSON.stringify({ ...(await getPackageJson()), version: nextVersion })
);
execSync("npx prettier --write package.json");

await deleteAny("node_modules");
execSync("npm install --engine-strict --ignore-scripts", { stdio: "inherit" });
execSync("npm run build", { stdio: "inherit" });
execSync("npm run check-build", { stdio: "inherit" });
execSync("npm run coverage", { stdio: "inherit" });
await writeFile(
  "coverage.json",
  JSON.stringify({
    total: JSON.parse(await readFile("coverage/coverage-summary.json")).total,
  })
);

console.log("final release checks passed... releasing...");

// prevent kill during this step
{
  const disableProcessExit = () => {
    // noop
  };
  process.on("SIGINT", disableProcessExit); // CTRL+C
  process.on("SIGQUIT", disableProcessExit); // Keyboard quit
  process.on("SIGTERM", disableProcessExit); // `kill` command
}

// the release
{
  const { name, license, main, module, types, author, homepage } = await getPackageJson();
  for (const distFile of [main, module, types]) {
    if (distFile) {
      const distFileContents = await readFile(distFile);
      let eol1Index = distFileContents.indexOf("\n");
      if (eol1Index === -1) eol1Index = Number.POSITIVE_INFINITY;
      const line1 = distFileContents.slice(0, eol1Index);

      let authorStr = "";
      if (typeof author === "string") {
        authorStr = author;
      } else if (author) {
        authorStr = `${author.name}${author.email ? ` <${author.email}>` : ""}${
          author.url ? ` (${author.url})` : ""
        }`;
      }

      const licenceStr = license ? `@license ${license} ` : "";

      const comment = `/**! ${[name, authorStr, licenceStr].join(" | ")} */`;

      await writeFile(
        distFile,
        line1.startsWith("#!")
          ? line1 + "\n" + comment + "\n" + distFileContents.slice(eol1Index + 1)
          : comment + "\n" + distFileContents
      );
    }
  }

  execSync("git add .", { stdio: "inherit" });
  execSync(`git commit -m 'ci: release v${nextVersion}'`, { stdio: "inherit" });
  execSync(`git tag -a v${nextVersion} -m '${nextVersion}'`, { stdio: "inherit" });
  execSync(`git push`, { stdio: "inherit" });
  execSync(`git push origin v${nextVersion}`, { stdio: "inherit" });
  execSync(`npm publish`, { stdio: "inherit" });

  if (homepage && homepage.startsWith("https://github.com/")) {
    const majorMessages = majors
      .map(({ message }) => `- ${message}`)
      .filter((commit, index, arr) => {
        return index === 0 || arr[index - 1] !== commit;
      });
    const minorMessages = minors
      .map(({ message }) => `- ${message}`)
      .filter((commit, index, arr) => {
        return index === 0 || arr[index - 1] !== commit;
      });
    const patchMessages = patchs
      .map(({ message }) => `- ${message}`)
      .filter((commit, index, arr) => {
        return index === 0 || arr[index - 1] !== commit;
      });

    const encodedBody = encodeURIComponent(
      [
        majorMessages.length > 0 ? `# Major changes (breaking)\n\n${majorMessages.join("\n")}` : "",
        minorMessages.length > 0 ? `# Feature updates\n\n${minorMessages.join("\n")}` : "",
        patchMessages.length > 0 ? `# Other commits\n\n${patchMessages.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    );

    console.log("Create GitHub release:");
    console.log(
      `${homepage}/releases/new?tag=v${nextVersion}&title=v${nextVersion}&body=${encodedBody}`
    );
  }
}
