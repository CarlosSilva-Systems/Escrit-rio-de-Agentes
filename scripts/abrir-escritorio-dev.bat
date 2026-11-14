@echo off
rem Opens the Team Office (Escritorio da Equipe) -- dev launcher.
rem Starts the server if it is down; if it is already running it only opens the browser.
rem The browser receives a single-use 60 s ticket: the long-lived token is never put in the URL.
rem Abre o Escritorio da Equipe: liga o servidor se estiver desligado, senao so abre o navegador.
setlocal
cd /d "%~dp0.."

if not exist "dist\cli.js" (
  echo Building the project / Compilando o projeto...
  call npm run build
  if errorlevel 1 (
    echo Build failed / Falha na compilacao.
    exit /b 1
  )
)

node "dist\cli.js" open %*
exit /b %errorlevel%
