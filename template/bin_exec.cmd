@IF EXIST "%~dp0\node.exe" (
  "%~dp0\node.exe"  "%~dp0\<%= bin %>" %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "%~dp0\<%= bin %>" %*
)