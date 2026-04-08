@echo off
cd /d "%~dp0"
echo Instalando dependencias si hace falta...
call npm install
echo.
echo Arrancando MySQL local y creando la base si hace falta...
call npm run setup
echo.
echo Iniciando servidor API + interfaz web...
call npm run dev
pause
