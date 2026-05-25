import https from "node:https";

export const CURRENT_VERSION = "1.0.0";
export const GITHUB_REPO = "your-username/contextbridge";

export interface UpdateInfo {
  latest: string;
  url: string;
}

export function checkForUpdate(
  repo: string = GITHUB_REPO,
  timeoutMs: number = 2000,
): Promise<UpdateInfo | null> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const req = https.get(
      `https://api.github.com/repos/${repo}/releases/latest`,
      {
        headers: {
          "User-Agent": "contextbridge-update-checker",
          Accept: "application/vnd.github.v3+json",
        },
        signal: controller.signal,
      },
      (res) => {
        clearTimeout(timer);
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            if (res.statusCode !== 200) {
              resolve(null);
              return;
            }
            const body = Buffer.concat(chunks).toString();
            const data: Record<string, unknown> = JSON.parse(body);
            const latestTag = data.tag_name as string | undefined;
            if (!latestTag) {
              resolve(null);
              return;
            }
            const latest = latestTag.replace(/^v/, "");
            if (compareVersions(CURRENT_VERSION, latest) >= 0) {
              resolve(null);
              return;
            }
            resolve({ latest, url: `https://github.com/${repo}/releases/tag/${latestTag}` });
          } catch {
            resolve(null);
          }
        });
        res.on("error", () => resolve(null));
      },
    );

    req.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
