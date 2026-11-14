import { execFile } from 'node:child_process';

/**
 * Opens `url` in the default browser. `execFile` without a shell: the URL is one argv element.
 * It only ever carries a single-use 60 s ticket, never the long-lived token.
 */
export function openBrowser(url: string): Promise<void> {
  const [file, args]: [string, string[]] =
    process.platform === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, shell: false, timeout: 10_000 }, (error) =>
      error ? reject(error) : resolve(),
    );
  });
}
