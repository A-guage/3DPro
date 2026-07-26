const fs = require("fs");
const path = require("path");

const packages = ["pi-coding-agent", "pi-agent-core", "pi-ai", "pi-tui"];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyPackage(name) {
  const src = path.join(__dirname, "node_modules", "@mariozechner", name);
  const dest = path.join(__dirname, "pi-agent", "node_modules", "@mariozechner", name);

  if (!fs.existsSync(src)) {
    console.warn(`[WARN] Missing source package: ${src}`);
    return false;
  }

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  ensureDir(path.dirname(dest));
  fs.cpSync(src, dest, { recursive: true });
  return true;
}

function main() {
  const copied = packages.map(copyPackage).filter(Boolean).length;
  if (copied === 0) {
    console.error("[ERROR] No packages copied. Please run: npm install");
    process.exit(1);
  }
  console.log(`[OK] Copied ${copied}/${packages.length} core packages to ./pi-agent/node_modules/@mariozechner`);
}

main();
