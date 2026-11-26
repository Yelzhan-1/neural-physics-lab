import { mkdir, writeFile } from "node:fs/promises";
import QRCode from "qrcode";

const URL = "https://neural-physics-lab-roan.vercel.app";

async function main(): Promise<void> {
  await mkdir("public", { recursive: true });
  const svg = await QRCode.toString(URL, {
    type: "svg",
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });
  await writeFile("public/qr.svg", svg);
  await QRCode.toFile("public/qr.png", URL, {
    type: "png",
    width: 1024,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });
  console.log("wrote public/qr.svg and public/qr.png");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
