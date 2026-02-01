@echo off
echo ========================================
echo   Compilando Scarlet Menu Fetcher
echo ========================================
echo.

REM Verifica se g++ está instalado
where g++ >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] g++ nao encontrado! Instale MinGW.
    pause
    exit /b 1
)

REM Compilar index.cpp
echo [1/2] Compilando index.cpp...
g++ -o ScarletMenuFetcher.exe index.cpp -lwininet -static -O2 -s

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha na compilação!
    pause
    exit /b 1
)

echo [2/2] Compilação concluída!
echo.
echo ========================================
echo   Executável: ScarletMenuFetcher.exe
echo ========================================
echo.
echo IMPORTANTE: Antes de executar, edite index.cpp e configure:
echo   - SERVER_HOST (seu domínio ou localhost)
echo   - APP_ID (ID da aplicação)
echo   - APP_SECRET (secret da aplicação)
echo.

pause
