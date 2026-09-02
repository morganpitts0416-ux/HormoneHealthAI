import http from "node:http";
import fs from "node:fs";

const port = Number(process.env.PORT || 5101);
const capturePath = process.env.SYNTHETIC_MODEL_CAPTURE_FILE || "/tmp/group1-model-capture.ndjson";
fs.writeFileSync(capturePath, "");

const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", chunk => chunks.push(Buffer.from(chunk)));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    fs.appendFileSync(capturePath, `${body}\n`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl-synthetic",
      object: "chat.completion",
      created: 0,
      model: "synthetic-local",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Synthetic local model response." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`synthetic OpenAI capture listening on ${port}`);
});