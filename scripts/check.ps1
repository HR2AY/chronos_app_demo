$ErrorActionPreference = "Stop"

Write-Host "Checking Python syntax..."
python -m compileall server agent

Write-Host "Checking standard-library dev server imports..."
Push-Location server
try {
  python -c "from dev_server import Handler; from app.calendar_service import render_month; print(render_month(2026, 7)['monthLabel'])"
}
finally {
  Pop-Location
}

Write-Host "Checking TypeScript config..."
Push-Location mobile
try {
  if (Test-Path node_modules) {
    npx tsc --noEmit
  } else {
    Write-Host "Skipping TypeScript compile because mobile/node_modules is not installed."
  }
}
finally {
  Pop-Location
}

Write-Host "Done."
