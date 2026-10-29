<#
.SYNOPSIS
  Exportuje databazi Life360 do SQL souboru pro presun na jiny server.

.DESCRIPTION
  Ve vychozim stavu exportuje jen strukturu (tabulky, indexy, rozsireni PostGIS) a obsah tabulky
  schema_migrations, aby aplikace po importu poznala, ze migrace uz probehly.

.PARAMETER OutFile
  Cilovy soubor (vychozi deploy\life360-schema.sql, s daty deploy\life360-data.sql).
.PARAMETER WithData
  Prida data tabulek (kruhy, clenove, mista, polohy, udalosti, geo_cache). Tabulka settings se vynecha.
.PARAMETER IncludeSettings
  Se -WithData prida i tabulku settings (sifrovany Life360 token). Funguje jen se stejnym TOKEN_ENCRYPTION_KEY.
.PARAMETER DatabaseUrl
  Pripojeni k databazi; vychozi DATABASE_URL z .env.
#>
param(
  [string]$OutFile,
  [switch]$WithData,
  [switch]$IncludeSettings,
  [string]$DatabaseUrl
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not $DatabaseUrl) {
  $line = Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if (-not $line) { throw 'DATABASE_URL nenalezeno v .env, zadejte -DatabaseUrl' }
  $DatabaseUrl = $line -replace '^DATABASE_URL=', ''
}
if (-not $OutFile) {
  $name = if ($WithData) { 'life360-data.sql' } else { 'life360-schema.sql' }
  $OutFile = Join-Path $PSScriptRoot $name
}

$pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
if (-not $pgDump) {
  $pgDump = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
    Sort-Object { [int](($_.FullName -split '\\')[3]) } -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $pgDump) { throw 'pg_dump nenalezen (pridejte PostgreSQL bin do PATH)' }

$common = @('--no-owner', '--no-privileges', '--no-comments', $DatabaseUrl)
$tmp = [IO.Path]::GetTempFileName()
try {
  if ($WithData) {
    $opts = @('--inserts', '--column-inserts')
    if (-not $IncludeSettings) { $opts += '--exclude-table-data=settings' }
    & $pgDump @opts @common | Set-Content $tmp -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "pg_dump selhal (kod $LASTEXITCODE)" }
  } else {
    & $pgDump '--schema-only' @common | Set-Content $tmp -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "pg_dump selhal (kod $LASTEXITCODE)" }
    # Evidence provedenych migraci, aby je aplikace po importu neprovadela znovu
    & $pgDump '--data-only' '--inserts' '--column-inserts' '--table=schema_migrations' @common | Add-Content $tmp -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "pg_dump selhal (kod $LASTEXITCODE)" }
  }

  # Vystup nove verze pg_dump jde importovat i do starsich serveru (PostgreSQL 14+)
  Get-Content $tmp -Encoding utf8 |
    Where-Object { $_ -notmatch '^(\\restrict|\\unrestrict) ' -and $_ -notmatch '^SET transaction_timeout' } |
    Set-Content $OutFile -Encoding utf8
} finally {
  Remove-Item $tmp -ErrorAction SilentlyContinue
}
$size = [Math]::Round((Get-Item $OutFile).Length / 1KB, 1)
Write-Host "Export hotov: $OutFile ($size kB)"
