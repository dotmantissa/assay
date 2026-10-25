// Optional local transport for environments where curl can connect but Node fetch cannot.
// Request credentials travel on stdin and never appear in process arguments or logs.
import { spawn } from "node:child_process";
export async function curlFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  pin?: { host: string; address: string; maximum: number },
): Promise<Response> {
  const request = new Request(input, init);
  const requestBody = await request.text();
  const lines = [
    `url = ${JSON.stringify(request.url)}`,
    `request = ${JSON.stringify(request.method)}`,
  ];
  request.headers.forEach((value, key) =>
    lines.push(`header = ${JSON.stringify(key + ": " + value)}`),
  );
  if (pin)
    lines.push(
      `resolve = ${JSON.stringify(pin.host + ":443:" + (pin.address.includes(":") ? "[" + pin.address + "]" : pin.address))}`,
    );
  if (requestBody) lines.push(`data = ${JSON.stringify(requestBody)}`);
  return await new Promise((resolve, reject) => {
    const child = spawn(
      "curl",
      [
        "--config",
        "-",
        "--include",
        "--silent",
        "--show-error",
        "--max-time",
        "25",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > (pin?.maximum || 20_000_000)) child.kill();
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.on("error", () => reject(new Error("HTTP transport unavailable")));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("HTTP transport failed"));
        return;
      }
      let buffer = Buffer.concat(chunks);
      let header = "";
      while (buffer.subarray(0, 5).toString() === "HTTP/") {
        const end = buffer.indexOf("\r\n\r\n");
        if (end < 0) break;
        header = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end + 4);
      }
      const status = Number(header.split(" ")[1]);
      if (!status) {
        reject(new Error("Invalid HTTP response"));
        return;
      }
      const headers = new Headers();
      for (const line of header.split("\r\n").slice(1)) {
        const colon = line.indexOf(":");
        if (colon > 0 && !/^transfer-encoding:/i.test(line))
          headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
      }
      resolve(
        new Response([204, 205, 304].includes(status) ? null : buffer, {
          status,
          headers,
        }),
      );
    });
    child.stdin.end(lines.join("\n") + "\n");
  });
}
if (process.env.ASSAY_HTTP_TRANSPORT === "curl")
  globalThis.fetch = (input, init) => curlFetch(input, init);
