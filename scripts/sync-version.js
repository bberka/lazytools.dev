const fs = require('fs');
const path = require('path');

try {
  // 1. Get version from command line argument
  let version = process.argv[2]?.trim();
  if (!version) {
    console.error('Error: Please provide a version argument (e.g. 0.2.0 or v0.2.0).');
    process.exit(1);
  }

  // Remove leading 'v' if present (e.g. v0.2.0 -> 0.2.0)
  if (version.startsWith('v')) {
    version = version.substring(1);
  }

  console.log(`Syncing project versions to: ${version}`);

  // 2. Update package.json
  const packageJsonPath = path.join(__dirname, '../package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.version = version;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log('Updated package.json');
  }

  // 3. Update src-tauri/tauri.conf.json
  const tauriConfPath = path.join(__dirname, '../src-tauri/tauri.conf.json');
  if (fs.existsSync(tauriConfPath)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = version;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
    console.log('Updated src-tauri/tauri.conf.json');
  }

  // 4. Update src-tauri/Cargo.toml
  const cargoTomlPath = path.join(__dirname, '../src-tauri/Cargo.toml');
  if (fs.existsSync(cargoTomlPath)) {
    let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
    // Replace version under [package]
    cargoToml = cargoToml.replace(/(^version\s*=\s*")[^"]*(")/m, `$1${version}$2`);
    fs.writeFileSync(cargoTomlPath, cargoToml);
    console.log('Updated src-tauri/Cargo.toml');
  }

} catch (error) {
  console.error('Failed to sync version:', error);
  process.exit(1);
}
