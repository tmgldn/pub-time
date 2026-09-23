import { execSync } from "node:child_process";
import { readFileSync, rmSync, lstatSync } from "node:fs";
import { createInterface } from "node:readline";
import { get } from "node:https";

export const run = (...args: Parameters<typeof execSync>): string => {
  return (execSync(...args) ?? "").toString();
};
export const read = (...args: Parameters<typeof readFileSync>): string => {
  return readFileSync(...args).toString();
};
export const remove = (path: string) => {
  return rmSync(path, { recursive: true, force: true });
};
export const isFile = (path: string) => {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
};
export const ask = async (prompt: string): Promise<string> => {
  const readlineInterface = createInterface({ input: process.stdin, output: process.stdout });
  const shouldAddSpace = !(prompt.endsWith(" ") || prompt.endsWith("\n") || prompt === "");
  return new Promise((resolve) => {
    readlineInterface.question(`${prompt}${shouldAddSpace ? " " : ""}`, (answer) => {
      readlineInterface.close();
      resolve(answer);
    });
  });
};

export const isOnline = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(false);
    }, 4500);
    get("https://captive.apple.com/hotspot-detect.html", (response) => {
      let body = "";
      response.on("data", (data: string | Buffer) => {
        body += data.toString();
      });
      response.on("close", () => {
        clearTimeout(timeout);
        resolve(body.includes("Success"));
      });
    }).on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
};

export { writeFileSync as write } from "node:fs";
