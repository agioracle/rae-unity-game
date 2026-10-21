# REA Unity Game

**以完整 REA 为底座，加入 Unity 领域工具和实战经验。**

目标是：提供 APK，询问其中某个功能如何实现，由宿主智能体调用 REA 追踪证据，再按目标 Unity 游戏的架构复刻并验证。

0.2 版本将完整 `rea-agents@6.7.0` 作为必需运行时。统一 MCP 包含原始 REA 工具，以及 Unity 领域扩展；原有反编译、交叉引用、追踪、分析会话和 Evidence 不再被缩减为两个可选检查命令。宿主智能体负责推理、代码编写和工具编排。

仓库目录、产品与命令统一为 `rea-unity-game`。[English](README.md)

## 使用

Node 要求与 REA 相同：22.x ≥22.19、24.x ≥24.11，或 26+。Python ≥3.10。使用 `.nvmrc` 可选择已验证的 Node 22.23.1。

```bash
npm ci --ignore-scripts --omit=optional
npm run build
# 原始 REA 命令：直接使用，无需另装 REA
node dist/cli.js inspect-managed-artifact /路径/Assembly-CSharp.dll --json
node dist/cli.js decompile /路径/libil2cpp.so 0x1234 --provider ghidra --json
# Unity 领域操作：使用 unity 命名空间
node dist/cli.js unity inspect --input /路径/game.apk
node dist/cli.js unity init --input /路径/game.apk \
  --workspace /路径/restoration --authorization "已授权的调查与实现范围"
node dist/cli.js unity feature-context --workspace /路径/restoration \
  --question "这个功能如何实现？" --target-project /路径/我的另一个Unity游戏
```

原生分析仍需配置 REA 支持的引擎；工具存在与引擎可用是不同状态。可选依赖如 Frida 按需准备，不能从其工具出现在目录中推断已经安装。

## MCP

```json
{
  "mcpServers": {
    "rea-unity-game": {
      "command": "node",
      "args": ["/绝对路径/rea-unity-game/dist/cli.js", "mcp"]
    }
  }
}
```

上游 setup/update 命令保留原来的安装身份；接入 Unity 增量时请使用上面的发行版 MCP 配置。

一个端点提供完整 REA 原始工具和 `unity_*` 工具，并保留同一个核心分析会话、原始结果与 Evidence。用 `investigate-unity-feature` 提示词或直接告诉智能体：

> 分析 /path/game.apk 中这个功能的实现，给出源码/IL/原生函数与资源证据；然后在 /path/my-game 中按现有架构复刻，执行正常输入与生命周期验证。不要把推测写成原版结论。

读取 `unity-reconstruction://rea-core-skill` 与 Unity 技能，具体流程见 [功能调查与复刻](skills/unity-game-reconstruction/references/feature-investigation.md)。目标项目的实际修改和测试由宿主的文件工具、Unity MCP/CLI 执行。

## Unity 增量

- APK/XAPK/APKS/APKM/AAB/ZIP、split 与桌面 Player 证据接入。
- Mono/IL2CPP 识别、原包快照、提取来源和哈希。
- `feature-context`：关联功能问题、候选文件和已有目标项目版本。
- `inspect-objects` / `inspect-object`：读取实际序列化对象、64 位 PathID、原始数据哈希和可用字段。
- 恢复覆盖率、证据结论、验证标记和明确用户验收。
- Unity 对象、脚本、配置、生命周期、资源依赖和跨项目集成的实战技能。

序列化解析器按需安装在本地环境：

```bash
python3 -m venv .tools/python
.tools/python/bin/python -m pip install -r requirements-unity.txt
export REA_UNITY_PYTHON="$PWD/.tools/python/bin/python"
```

当前解析器支持单个已提取 SerializedFile 的 9–22 格式版本。Bundle、媒体导出、IL2CPP 地址映射等由相应领域工具补充；技能指导智能体按证据需要准备和调用。

## 验证

```bash
npm run check
npm run demo
node scripts/package-smoke.mjs
```

已测试真实 REA 进程的完整工具目录和实际 managed PE 解析，也测试了统一协议中的回调、进度与取消，以及 UnityPy 对有效序列化格式样本的读取。这些测试不等于任意真实游戏的功能都已复刻成功。真实功能仍需目标包、可用引擎、目标项目和实际行为验证。

[详细工作流](docs/workflow.md) · [架构](docs/architecture.md) · [验证范围](docs/verification.md)

0.4 补齐：metadata39 的新索引恢复、原 APK 正常输入与安装身份验证、目标 Player 真实点击，以及带置信度和原图哈希的数值画面对比。已在独立 Unity 项目中完成待领取金币案例：10 项 PlayMode 检查及 5 个真实画面数值检查点通过。工具由宿主智能体编排；其他功能仍需实际调查、实现和验证。[工具契约](docs/unity-domain-tools.md) · [0.4 完整闭环验证](docs/automatic-loop-verification.md) · [0.3 历史验证](docs/feature-transfer-verification.md)。

0.5 将金币案例移至可选示例，公开调查与迁移入口改为声明式 JSON。新增通用 ARM64 指令窗口、带来源的组件字段解码、画面阶段等待和颜色状态对比。第二个实际案例覆盖技能蓄力取消、双控释放、独立按钮长按、10 秒冷却及复用，并迁入保留原功能的 Unity 项目；宿主智能体负责证据解释、实现及 Editor/Player 编排。[完整验证与边界](docs/general-feature-loop-verification.md) · [通用操作与命令](docs/unity-domain-tools.md#general-feature-investigation-05)。

新包验证补充：ARM32 ARM/Thumb 指令窗口、严格注册结构恢复、独立 Cpp2IL schema 运行环境、显式大资源预算、字符串列表 schema 修复及安装前 ABI 检查。新 XAPK 的普通三选一分支已迁入全新 Unity 目标并执行真实输入；原包 ARMv7 运行对照和 Showdown/成长覆盖仍有缺口。[结果和限制](docs/draft-three-choice-verification.md)。
