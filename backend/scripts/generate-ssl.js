// scripts/generate-ssl.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import selfsigned from "selfsigned";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sslDir = path.join(__dirname, "..", "ssl");
if (!fs.existsSync(sslDir)) {
  fs.mkdirSync(sslDir, { recursive: true });
}

const keyPath = path.join(sslDir, "server.key");
const certPath = path.join(sslDir, "server.cert");

console.log("Generating self-signed SSL/TLS certificate for Officers Mess...");

const attrs = [
  { name: "commonName", value: "localhost" },
  { name: "countryName", value: "IN" },
  { shortName: "ST", value: "Delhi" },
  { name: "localityName", value: "New Delhi" },
  { name: "organizationName", value: "Officers Mess" },
  { shortName: "OU", value: "Security Wing" },
];

const generateFn = selfsigned.generate || selfsigned.default?.generate;

async function run() {
  try {
    const pems = await generateFn(attrs, {
      days: 3650, // 10 years validity
      keySize: 2048,
      algorithm: "sha256",
      extensions: [
        {
          name: "subjectAltName",
          altNames: [
            { type: 2, value: "localhost" },
            { type: 7, ip: "127.0.0.1" },
          ],
        },
      ],
    });

    fs.writeFileSync(keyPath, pems.private, "utf8");
    fs.writeFileSync(certPath, pems.cert, "utf8");

    console.log("✅ SSL Certificate & Private Key generated successfully!");
    console.log("  Certificate :", certPath);
    console.log("  Private Key :", keyPath);
    console.log("  Validity    : 10 Years");
  } catch (error) {
    console.error("Failed to generate SSL certificate:", error);
    process.exit(1);
  }
}

run();
