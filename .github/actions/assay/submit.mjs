const env = process.env;
const base = env.ASSAY_APP_URL?.replace(/\/$/, "");
if (!base?.startsWith("https://"))
  throw new Error("A public HTTPS Assay address is required");
console.log("::add-mask::" + env.ASSAY_API_KEY);
const headers = {
  Authorization: "Bearer " + env.ASSAY_API_KEY,
  "Content-Type": "application/json",
};
async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Assay request failed");
  return body;
}
const job = await request("/api/submissions", {
  method: "POST",
  headers: {
    "Idempotency-Key": `${env.GITHUB_REPOSITORY}:${env.GITHUB_RUN_ID}:${env.ASSAY_BENCHMARK}`,
  },
  body: JSON.stringify({
    benchmark_id: env.ASSAY_BENCHMARK,
    model: env.ASSAY_MODEL,
    outputs_url: env.ASSAY_OUTPUTS_URL,
    outputs_hash: env.ASSAY_OUTPUTS_HASH,
  }),
});
console.log("Assay queued: " + job.id);
const deadline = Date.now() + Number(env.ASSAY_TIMEOUT) * 60_000;
while (Date.now() < deadline) {
  const state = await request("/api/jobs/" + job.id);
  if (["failed", "cancelled"].includes(state.state))
    throw new Error(state.error || "Assay step failed");
  if (state.state === "complete") {
    const url = base + "/runs/" + state.result_id;
    const { appendFileSync } = await import("node:fs");
    appendFileSync(env.GITHUB_OUTPUT, `record-url=${url}\n`);
    console.log("Finalized artifact record: " + url);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 15000));
}
throw new Error(
  "Consensus is still pending. Resume at " + base + "/jobs/" + job.id,
);
