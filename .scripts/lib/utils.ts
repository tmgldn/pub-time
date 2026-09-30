import fs, { constants } from "node:fs";
import dns from "node:dns";
import readline from "node:readline";
import { posix } from "node:path";

export const readFile = async (path: string): Promise<string> => {
  return fs.promises.readFile(path, "utf8");
};

export const writeFile = async (path: string, newFileString: string): Promise<void> => {
  return fs.promises.writeFile(path, newFileString);
};

export const isFile = async (path: string): Promise<boolean> => {
  try {
    return (await fs.promises.lstat(path)).isFile();
  } catch {
    return false;
  }
};

const isFolder = async (path: string): Promise<boolean> => {
  try {
    return (await fs.promises.lstat(path)).isDirectory();
  } catch {
    return false;
  }
};

export const deleteFile = async (path: string): Promise<void> => {
  return fs.promises.unlink(path);
};

export const deleteFolder = async (path: string): Promise<void> => {
  return fs.promises.rm(path, { recursive: true });
};

export const deleteAny = async (path: string): Promise<void> => {
  await ((await isFolder(path)) ? deleteFolder(path) : fs.promises.unlink(path));
};

export const ensureEmptyFolderExists = async (path: string): Promise<void> => {
  await fs.promises.rm(path, { recursive: true, force: true });
  await fs.promises.mkdir(path, { recursive: true });
};

export const copyFile = async (
  sourcePath: string,
  destinationPath: string,
  shouldReplace = false
): Promise<void> => {
  await fs.promises.copyFile(
    sourcePath,
    destinationPath,
    shouldReplace ? constants.COPYFILE_FICLONE : constants.COPYFILE_EXCL
  );
};

const listFilesInFolder = async (path: string): Promise<string[]> => {
  const dirents = await fs.promises.readdir(path, { withFileTypes: true });
  return dirents.filter((dirent) => dirent.isFile()).map((dirent) => dirent.name);
};

const listFoldersInFolder = async (path: string): Promise<string[]> => {
  const dirents = await fs.promises.readdir(path, { withFileTypes: true });
  return dirents.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
};

const recursiveListFilesWithinFolder = async (path: string): Promise<string[]> => {
  const [files, folders] = await Promise.all([listFilesInFolder(path), listFoldersInFolder(path)]);

  const nestedDescendants = await Promise.all(
    folders.map(async (name) => {
      const within = await recursiveListFilesWithinFolder(`${path}/${name}`);
      return within.map((child) => `${name}/${child}`);
    })
  );

  return [...files, ...nestedDescendants.flat()];
};

export const listFilesWithinFolder = async (path: string): Promise<string[]> => {
  return recursiveListFilesWithinFolder(path);
};

export const copyFolderContentsToFolder = async (
  sourcePath: string,
  destinationPath: string,
  shouldReplaceFiles = false
): Promise<void> => {
  await fs.promises.mkdir(destinationPath, { recursive: true });
  const dirents = await fs.promises.readdir(sourcePath, { withFileTypes: true });
  await Promise.all([
    ...dirents
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) =>
        copyFolderContentsToFolder(
          `${sourcePath}/${dirent.name}`,
          `${destinationPath}/${dirent.name}`,
          shouldReplaceFiles
        )
      ),
    ...dirents
      .filter((dirent) => dirent.isFile())
      .map((dirent) =>
        copyFile(
          `${sourcePath}/${dirent.name}`,
          `${destinationPath}/${dirent.name}`,
          shouldReplaceFiles
        )
      ),
  ]);
};

export const splitPath = (path: string): string[] => {
  const normalizedPath = posix.normalize(path).replace(/\/+$/, "");
  return normalizedPath.split("/").filter((part) => part !== "" && part !== ".");
};

export const readInput = async (promptMessage: string): Promise<string> => {
  const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const isEmpty = promptMessage === "";
  const hasWhiteSpaceEnd = promptMessage.endsWith(" ") || promptMessage.endsWith("\n");
  const question = hasWhiteSpaceEnd || isEmpty ? promptMessage : `${promptMessage} `;

  return new Promise((resolve) => {
    readlineInterface.question(question, (answer) => {
      readlineInterface.close();
      resolve(answer);
    });
  });
};

export const delay = async (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, milliseconds);
  });
};

type MatchingIPs = Array<["IPv4", string] | ["IPv6", string]>;

export const dnsLookup = async (url: string): Promise<MatchingIPs> => {
  const { hostname } = new URL(url);

  let hasFoundIPv4 = false;
  let hasFoundIPv6 = false;

  const matches: MatchingIPs = [];
  for (const { address, family } of await dns.promises.lookup(hostname, { all: true })) {
    if (!hasFoundIPv4 && family === 4) {
      matches.push(["IPv4", address]);
      hasFoundIPv4 = true;
    }
    if (!hasFoundIPv6 && family === 6) {
      matches.push(["IPv6", address]);
      hasFoundIPv6 = true;
    }
    if (hasFoundIPv4 && hasFoundIPv6) {
      break;
    }
  }

  return matches;
};

const isEscaped = (jsonString: string, quotePosition: number): boolean => {
  let index = quotePosition - 1;
  let backslashCount = 0;

  while (jsonString[index] === "\\") {
    index -= 1;
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
};

const removeJSONComments = (jsonString: string): string => {
  let isInsideString = false;
  let isInsideComment: 0 | 1 | 2 = 0;
  let offset = 0;
  let result = "";

  for (let index = 0; index < jsonString.length; index += 1) {
    const currentCharacter = jsonString[index];
    const nextCharacter = jsonString[index + 1];

    if (!isInsideComment && currentCharacter === '"' && !isEscaped(jsonString, index)) {
      isInsideString = !isInsideString;
    }

    if (isInsideString) {
      continue;
    }

    if (!isInsideComment && currentCharacter + nextCharacter === "//") {
      result += jsonString.slice(offset, index);
      offset = index;
      isInsideComment = 1;
      index += 1;
    } else if (isInsideComment === 1 && currentCharacter + nextCharacter === "\r\n") {
      index += 1;
      isInsideComment = 0;
      offset = index;
    } else if (isInsideComment === 1 && currentCharacter === "\n") {
      isInsideComment = 0;
      offset = index;
    } else if (!isInsideComment && currentCharacter + nextCharacter === "/*") {
      result += jsonString.slice(offset, index);
      offset = index;
      isInsideComment = 2;
      index += 1;
    } else if (isInsideComment === 2 && currentCharacter + nextCharacter === "*/") {
      index += 1;
      isInsideComment = 0;
      offset = index + 1;
    }
  }

  return result + (isInsideComment ? "" : jsonString.slice(offset));
};

export const readJSON = <T = unknown>(jsonString: string): T => {
  return JSON.parse(removeJSONComments(jsonString));
};
