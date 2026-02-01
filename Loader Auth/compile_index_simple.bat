@echo off
echo ========================================
echo   Compilando Scarlet Menu Fetcher
echo ========================================
echo.

echo [1/2] Compilando index.cpp...
g++ -o ScarletMenuFetcher.exe index.cpp -lwininet -static -O2 -s 2>&1

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha na compilação!
    echo.
    echo Se aparecer 'g++ nao e reconhecido', adicione o MinGW ao PATH
    echo ou compile usando o mesmo método que usou para o main.cpp
    pause
    exit /b 1
)

echo [2/2] Compilação concluída!
echo.
echo ========================================
echo   Executável: ScarletMenuFetcher.exe
echo ========================================
echo.

pause
