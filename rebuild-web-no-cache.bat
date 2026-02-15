@echo off
REM Rebuild Langfuse Web Image WITHOUT CACHE
REM This ensures all changes (including shared package) are included

echo === Rebuilding Langfuse Web Image (No Cache) ===
echo This will take longer but ensures all changes are included
echo.

cd /d %~dp0

echo Step 1: Removing old image...
docker rmi rezaarrazi/langfuse-web:latest 2>nul
docker rmi rezaarrazi/langfuse-web:token-metrics 2>nul

echo.
echo Step 2: Building Docker image with --no-cache...
docker build --no-cache -f ./web/Dockerfile -t rezaarrazi/langfuse-web:latest -t rezaarrazi/langfuse-web:token-metrics .

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Docker build failed!
    exit /b %ERRORLEVEL%
)

echo.
echo Step 3: Pushing to Docker Hub...
docker push rezaarrazi/langfuse-web:latest
docker push rezaarrazi/langfuse-web:token-metrics

echo.
echo === ✅ Rebuild Complete! ===
echo.
echo Next steps:
echo 1. Go to your root project: cd ..
echo 2. Pull the new image: docker-compose pull langfuse-web
echo 3. Restart: docker-compose up -d --force-recreate langfuse-web

pause
