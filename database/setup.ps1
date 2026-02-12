# CampusLynk Database Setup Script
# Run this script to create and initialize your database

param(
    [string]$DBUser = "postgres",
    [string]$DBPassword = "",
    [string]$DBName = "campuslink_db",
    [string]$DBHost = "localhost",
    [int]$DBPort = 5432,
    [switch]$SkipSampleData
)

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "CampusLynk Database Setup" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if PostgreSQL is installed
$psqlCmd = "psql"
try {
    $psqlVersion = & $psqlCmd --version 2>&1
    Write-Host "PostgreSQL found: $psqlVersion" -ForegroundColor Green
} catch {
    # Try common install location on Windows
    $candidate = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($candidate -and (Test-Path $candidate)) {
        $psqlCmd = $candidate
        $psqlVersion = & $psqlCmd --version 2>&1
        Write-Host "PostgreSQL found: $psqlVersion" -ForegroundColor Green
    } else {
        Write-Host "PostgreSQL not found. Please install PostgreSQL first." -ForegroundColor Red
        Write-Host "  Download from: https://www.postgresql.org/download/" -ForegroundColor Yellow
        exit 1
    }
}

# Set password environment variable if provided
if ($DBPassword) {
    $env:PGPASSWORD = $DBPassword
}

Write-Host ""
Write-Host "Database Configuration:" -ForegroundColor Yellow
Write-Host "  Host: $DBHost" -ForegroundColor White
Write-Host "  Port: $DBPort" -ForegroundColor White
Write-Host "  User: $DBUser" -ForegroundColor White
Write-Host "  Database: $DBName" -ForegroundColor White
Write-Host ""

# Step 1: Create database
Write-Host "[1/3] Creating database..." -ForegroundColor Cyan
$createDB = "CREATE DATABASE " + $DBName + ";"
$queryExists = 'SELECT 1 FROM pg_database WHERE datname=''' + $DBName + ''''
$checkDB = & $psqlCmd -U $DBUser -h $DBHost -p $DBPort -d postgres -tAc $queryExists 2>&1

if ($checkDB -eq "1") {
    Write-Host "  Database '$DBName' already exists. Skipping creation." -ForegroundColor Yellow
} else {
    & $psqlCmd -U $DBUser -h $DBHost -p $DBPort -d postgres -c $createDB 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Database created successfully" -ForegroundColor Green
    } else {
        Write-Host "  Failed to create database" -ForegroundColor Red
        exit 1
    }
}

# Step 2: Run schema
Write-Host ""
Write-Host "[2/3] Creating tables and schema..." -ForegroundColor Cyan
$schemaPath = Join-Path $PSScriptRoot "database_schema.sql"
& $psqlCmd -U $DBUser -h $DBHost -p $DBPort -d $DBName -f $schemaPath 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Schema created successfully" -ForegroundColor Green
} else {
    Write-Host "  Failed to create schema" -ForegroundColor Red
    exit 1
}

# Step 3: Load sample data (optional)
if (-not $SkipSampleData) {
    Write-Host ""
    Write-Host "[3/3] Loading sample data..." -ForegroundColor Cyan
    $samplePath = Join-Path $PSScriptRoot "sample_data.sql"
    & $psqlCmd -U $DBUser -h $DBHost -p $DBPort -d $DBName -f $samplePath 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Sample data loaded successfully" -ForegroundColor Green
    } else {
        Write-Host "  Failed to load sample data" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "[3/3] Skipping sample data (use -SkipSampleData:$false to include)" -ForegroundColor Yellow
}

# Clean up
if ($DBPassword) {
    Remove-Item Env:\PGPASSWORD
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your database is ready at:" -ForegroundColor White
Write-Host "  postgresql://$DBUser@$DBHost`:$DBPort/$DBName" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review common_queries.sql for query examples" -ForegroundColor White
Write-Host "  2. Check DATABASE_README.md for documentation" -ForegroundColor White
Write-Host "  3. Connect your application to the database" -ForegroundColor White
Write-Host ""
