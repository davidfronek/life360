<#
.SYNOPSIS
  Naimportuje SQL export (struktura, pripadne i data) do cilove databaze.
.EXAMPLE
  .\import-db.ps1 -File life360-schema.sql -DatabaseUrl "postgres://life360:HESLO@localhost:5432/life360"
.NOTES
  Databazi, uzivatele a rozsireni PostGIS vytvorte predem jako superuzivatel:
    CREATE USER life360 WITH PASSWORD '...'; CREATE DATABASE life360 OWNER life360;
    (v databazi life360)  CREATE EXTENSION IF NOT EXISTS postgis;
#>
param(
  [Parameter(Mandatory)][string]$File,
  [Parameter(Mandatory)][string]$DatabaseUrl
)
$ErrorActionPreference = 'Stop'
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
  $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object { [int](($_.FullName -split '\\')[3]) } -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $psql) { throw 'psql nenalezen (pridejte PostgreSQL bin do PATH)' }
& $psql $DatabaseUrl -v ON_ERROR_STOP=1 -1 -f $File
if ($LASTEXITCODE -ne 0) { throw "Import selhal (kod $LASTEXITCODE)" }
Write-Host 'Import hotov.'
