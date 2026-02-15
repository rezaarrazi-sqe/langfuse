@echo off
REM Rebuild Langfuse Worker Image WITHOUT CACHE
REM This ensures all changes (including shared package and cost calculation fix) are included

echo === Rebuilding Langfuse Worker Image (No Cache) ===
echo This will take longer but ensures all changes are included
echo.

cd /d %~dp0

echo Step 1: Removing old image...
docker rmi rezaarrazi/langfuse-worker:latest 2>nul

echo.
echo Step 2: Building Docker image with --no-cache...
docker build --no-cache -f ./worker/Dockerfile -t rezaarrazi/langfuse-worker:latest .

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Docker build failed!
    exit /b %ERRORLEVEL%
)

echo.
echo Step 3: Pushing to Docker Hub...
docker push rezaarrazi/langfuse-worker:latest

echo.
echo === ✅ Rebuild Complete! ===
echo.
echo Next steps:
echo 1. Go to your root project: cd ..
echo 2. Pull the new image: docker-compose pull langfuse-worker
echo 3. Restart: docker-compose up -d --force-recreate langfuse-worker

pause
