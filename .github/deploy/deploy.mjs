// CI deploy driver: connects to Hostinger's own MCP server (stdio) and calls
// the same tested `hosting_deployJsApplication` tool used for manual deploys,
// then polls until the build finishes. Auth is the HOSTINGER_API_TOKEN env
// var (the MCP short-circuits OAuth when it's present), injected from the
// GitHub Actions secret — the token never lives in the repo.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const domain = process.env.DEPLOY_DOMAIN;
const archivePath = process.env.ARCHIVE_PATH;

if (!process.env.HOSTINGER_API_TOKEN) {
  console.error("HOSTINGER_API_TOKEN is not set (add it as a repo secret).");
  process.exit(1);
}
if (!domain || !archivePath) {
  console.error("DEPLOY_DOMAIN and ARCHIVE_PATH must be set.");
  process.exit(1);
}

const textOf = (result) => (result?.content ?? []).map((c) => c.text ?? "").join("\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const transport = new StdioClientTransport({
  command: "node",
  args: ["node_modules/@hostinger/mcp/src/servers/hosting.js"],
  env: process.env,
});
const client = new Client({ name: "novaestacao-gh-deploy", version: "1.0.0" });

let exitCode = 1;
try {
  await client.connect(transport);

  console.log(`Deploying ${archivePath} → ${domain}`);
  const deployRes = await client.callTool({
    name: "hosting_deployJsApplication",
    arguments: { domain, archivePath, removeArchive: true },
  });
  const deployText = textOf(deployRes);
  console.log("Deploy response:", deployText.slice(0, 800));

  let uuid;
  try {
    uuid = JSON.parse(deployText)?.build?.data?.uuid;
  } catch {
    /* fall through */
  }
  if (!uuid) {
    console.error("Could not read a build uuid from the deploy response.");
  } else {
    console.log("Build uuid:", uuid);
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(15000);
      const listRes = await client.callTool({
        name: "hosting_listJsDeployments",
        arguments: { domain, perPage: 10 },
      });
      let state;
      try {
        const data = JSON.parse(textOf(listRes));
        state = (data?.deployments?.data ?? []).find((d) => d.uuid === uuid)?.state;
      } catch {
        /* keep polling */
      }
      console.log("build state:", state ?? "(unknown)");
      if (state === "completed") {
        console.log("✅ Deploy completed");
        exitCode = 0;
        break;
      }
      if (state === "failed") {
        console.error("❌ Deploy failed — check hosting_showJsDeploymentLogs in hPanel.");
        exitCode = 1;
        break;
      }
    }
    if (exitCode !== 0 && Date.now() >= deadline) {
      console.error("Timed out waiting for the build to finish.");
    }
  }
} catch (error) {
  console.error("Deploy driver error:", error);
  exitCode = 1;
} finally {
  try {
    await client.close();
  } catch {
    /* ignore */
  }
}

process.exit(exitCode);
