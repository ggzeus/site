@echo off
echo ========================================
echo  Compilando Scarlet Auth Loader...
echo ========================================
echo.

REM Verifica se g++ está instalado
where g++ >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] g++ nao encontrado! Instale MinGW ou use Visual Studio.
    pause
    exit /b 1
)

echo [*] Compilando com g++...
g++ main.cpp -o ScarletLoader_%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%.exe -lwininet -static -O2

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [+] Compilacao concluida com sucesso!
    echo [+] Executavel: ScarletLoader.exe
    echo.
    echo Deseja executar agora? (S/N)
    set /p choice=
    if /i "%choice%"=="S" (
        ScarletLoader.exe
    )
) else (
    echo.
    echo [-] Erro na compilacao!
)

pause
