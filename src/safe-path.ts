import * as fs from "node:fs";
import * as path from "node:path";

function isWithinRoot(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function createSafePath(rootDirectory: string): (filePath: string) => string {
  const root = fs.realpathSync(rootDirectory);

  return (filePath: string): string => {
    const requested = path.resolve(filePath);
    let ancestor = requested;

    while (!fs.existsSync(ancestor)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }

    const canonicalAncestor = fs.realpathSync(ancestor);
    const canonical = path.resolve(canonicalAncestor, path.relative(ancestor, requested));

    if (!isWithinRoot(canonical, root)) {
      throw new Error(
        `Access denied: path '${filePath}' is outside the allowed root '${root}'`
      );
    }

    return canonical;
  };
}
