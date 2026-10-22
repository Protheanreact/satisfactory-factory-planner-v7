$ErrorActionPreference = 'Stop'
Write-Host 'Satisfactory Factory Planner - portable Windows build' -ForegroundColor Cyan
Write-Host 'This build needs Node.js and internet access on the build machine only.'
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm was not found. Install Node.js LTS on this build machine, then run this script again.'
}
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed; portable package was not created.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed; portable package was not created.' }
npm run package:portable
if ($LASTEXITCODE -ne 0) { throw 'Portable packaging failed.' }
Write-Host ''
Write-Host 'Finished. Look for the portable EXE in .\release\' -ForegroundColor Green
