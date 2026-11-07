# 環境セットアップ状況（2026-10-14 PCローカルで実施）

## 完了
- リポジトリ取得: `C:\Users\User\desktop-tutorial`（ブランチ `claude/quirky-babbage-3w9i14`）
- Roblox Studio: インストール済み。作業用Place: `C:\Users\User\ゲーム\Place1.rbxl`
- Rojo CLI 7.7.1: `C:\Users\User\tools\rojo\rojo.exe`（ユーザーPATH登録済み。新しい端末で `rojo` が使える）
- Rojoプラグイン: `%LOCALAPPDATA%\Roblox\Plugins\RojoManagedPlugin.rbxm`
- Studio内蔵MCP: ユーザー設定に `Roblox_Studio` として登録済み（接続確認OK）
  - コマンド: `cmd.exe /c "cd /d %LOCALAPPDATA%\Roblox && .\mcp.bat"`
  - 前提: StudioでPlaceを開き、Assistant →「…」→ Manage MCP Servers →「StudioをMCPサーバーとして有効化する」がオン

## 注意
- 引継ぎ書にある `.claude/skills/design-best-practices` はブランチ上に存在しない。デザイン方針は HANDOFF.md の「デザイン方針」を使う。
- Git Bash では `/c` が `C:/` に書き換わる。MCPの登録など `/c` を含むコマンドはPowerShellで実行する。
- 未導入: VS Code、`luau-analyze`（必須ではない）。
- コードはまだ1行も書いていない。次は HANDOFF.md「7. 最初の依頼文」から。
