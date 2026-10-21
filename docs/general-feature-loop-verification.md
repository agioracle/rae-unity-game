# 0.5 通用功能逆向与迁移验证

2026-10-19。产品为 rea-unity-game；工作目录名保持 rae-unity-game。当前修改未提交、未发布；原 rea、原 APK、历史0.3/0.4验证产物保持不变。

## 结果与范围

已将公开调查/迁移入口改为声明式配置，移除金币类名、地址、PathID、ABI和目标版本的内置选择。金币驱动保留为可选示例；新增技能生命周期案例的所有游戏配置和目标代码位于 `examples/ability-lifecycle/`。

本次完整链路由宿主智能体执行：原 APK → 新 metadata39 地址索引 → 有界 ARM64 指令调查 → 新生成空方法体 schema DLL → 自定义组件解码与资源引用调查 → 现有 Unity 项目适配 → 实际 Editor/PlayMode → 干净构建 → 原 Android 和目标 Player 正常输入 → 五个状态画面对比。它是智能体编排的实际案例，不是一个从任意问题确定性生成游戏代码的 CLI。REA原始工具仍保持完整。

验证功能为**技能生命周期**：双控蓄力、提前释放取消、合格释放激活、独立按钮长按、标准化冷却、再次使用、单次策略和生命周期输入清理。角色攻击、伤害、VFX和原始美术不在本次复刻范围。目标使用自己的输入和显示；没有把这些未实现的消费者标为通过。

## 通用变化

- `investigate-feature`：严格配置、唯一快照/提取物后缀及可选哈希选择、显式ABI/方法查询/程序集、可选资源根。保留宿主语义调查状态。
- `inspect-native`：显式程序集/token选择，独立ELF文件偏移，保留别名与直接分支候选；64KiB总窗口和预分配前4MiB输出预算。范围是下一唯一指针，不声称方法体边界；当前适配器支持ARM64，其他架构明确拒绝并由REA其他分析器处理。
- `decode-component`：带来源schema、实际MonoScript身份、原始native头、Unity版本和完整字节消费检查。schema生成及反汇编不执行游戏DLL。
- `android-scenario`：画面条件等待，超时后即使画面匹配也拒绝后续输入。颜色条件由案例审查，未声称通用场景识别。
- `compare-ui-signals`：独立原图哈希、区域、RGB范围及像素比例；状态语义由宿主关联输入/原生代码/日志确认。
- `apply-feature-transfer.mjs`：使用已有声明或新声明和宿主编写的目标文件；先保留create-only输出，再执行迁移。不存在内置技能/金币代码生成器。

操作参数与可重放命令见 [工具契约](unity-domain-tools.md)。

## 从原 APK 恢复的证据

原游戏：Siege Squad，`com.luckykat.siegesquad`，Unity6000.3.12f1，ARM64，metadata39。原APK拆分集的所有叶子哈希与模拟器已安装字节逐一匹配。native SHA-256为 `7f5aeba49747124d51a9544be3aadb838ca3305d61179ef5ccce4f65ed06be95`；metadata为 `8f34dfe7085e9fd863577c95ab762a06d3ea1ae53dc3ebc5b2035797cf017ead`。

新LibCpp2IL索引包含103475个方法声明。选择26个指令窗口，涉及25个唯一声明，1656条ARM64指令，共6624字节；包含CoreNode、AbilityButton、ControlsCanvas、PlayerDriver及角色默认值/控制分支。原始声明与native映射、ABI和提供者归属保留在报告中。

| 原生入口 | token | ELF VA |
| --- | --- | --- |
| CoreNode.Update | 0x060003DC | 0x22ca384 |
| CoreNode.CanPrimeAbility | 0x060003EE | 0x22ccd24 |
| CoreNode.PrimeAbility | 0x060003F0 | 0x22caa38 |
| CoreNode.CancelAbility | 0x060003F1 | 0x22ca9f4 |
| CoreNode.ActivateAbility | 0x060003F2 | 0x22ca790 |

CoreNode以unscaledDelta/rechargeTime补充charge；可控制且未锁定时冷却；低于1禁止再次激活。双控按住时开始蓄力，后续帧累积时间，释放时根据primeTime取消或激活。AbilityButton有独立长按计时，达到阈值直接调用激活。激活会归零charge/prime；singleUse才锁定后续使用。目标保留这些状态和事件顺序，效果消费者为目标集成边界。

基类构造默认值不能替代实际prefab配置。`sharedassets2.assets` PathID1975的WarriorCore实际配置为recharge10、prime0.5、singleUse=false、初始charge1；其MonoScript在globalgamemanagers.assets PathID1038。UI实例为level4 PathID816，MonoScript PathID234。

最初使用历史注解DLL进行调查。随后从本次原始binary/metadata，用版本兼容Cpp2IL的 `attributeanalyzer` + `dll_empty` 新生成79个schema库；没有导入历史DLL。TypeTreeGeneratorAPI0.0.10从新库生成110节点WarriorCore与25节点AbilityButton schema。共享解码操作完整消费对象字节，且两个组件的全部解码字段与早期历史schema结果完全一致。最终流程不依赖历史注解；它们仅作交叉对照。直接TypeTreeGeneratorAPI IL2CPP入口实际失败，失败日志保留，没有把接口存在当作兼容性证明。

schema布局仍是提供者推导，不是原始嵌入TypeTree或原始C#。实际native字段访问、原头、完整消费和运行观察共同支持本案例，不能据此保证所有类型均正确。

资源引用方面，从组件解码得到的显式PPtr根继续追踪：abilityIcon→Sprite/Texture链完整（2节点1边）。buttonInner可追踪到76节点191边但有自定义TypeTree缺失；chargeImage/primeImage也保留partial。完整美术/动态加载依赖闭包未声称恢复。原PathID不会被当成目标工程GUID。

## 原 APK 正常输入

使用自有ReaVerification AVD，API35，serial emulator-5560，2400×1080。未修改APK、未注入游戏逻辑。双指输入来自本仓库shell InputManager辅助DEX；安装身份、前台包、工具和帧哈希均保留。

成功案例 `source-gated3.json` 先等待实际红色技能控件出现，再按如下输入执行，同一回合中保留35张帧图：

1. 双控60ms后释放：图标仍可用。
2. 双控1000ms后释放：进入冷却。
3. 左方向保持8000ms，等待图标自然恢复可用。
4. 中央技能按钮保持1000ms：再次进入冷却。

原进程自带Unity日志显示，同一个实例 `-156676` 在19:50:51.320激活、19:51:01.453恢复（10.133秒）、19:51:04.715由AbilityButton再次激活，19:51:14.891再次恢复。它支持同一实例的复用；不能用其他实例的日志替代。

## 目标项目与实际验证

目标为历史已验证项目的**新副本** `VerifiedTarget`，Unity2022.3.62f3。原14个Assets文件逐一哈希完全一致。技能被create-only迁入新的Assets/AbilityLifecycle，并用目标namespace、Space双控输入、鼠标独立技能按钮、实例状态与IMGUI显示适配。PlayerSettings沿用目标前台执行策略；后台截图保持旧帧不代表冷却失效，前台运行检查单独保留。没有改变用户正在使用的Unity Editor项目。

21项实际Editor/PlayMode检查通过，包括提前取消、阈值释放、直接长按、冷却/钳制/重复事件、控制开关、singleUse、UI比例、旧功能/场景保留、实际PlayMode初始化、禁用/启用、timeScale0下unscaled冷却。新的macOS Player构建结果为Succeeded。

真实输入使用用户已授权的系统鼠标路线，仅限精确路径/PID/窗口的本次测试Player；键盘使用cua。可见记录包括：

- 鼠标60ms：Activations0，保持Ready。
- 鼠标900ms：Activations1，进入Recharging。
- 前台运行冷却后：Activations1，恢复Ready。
- 连续两次900ms：仅增至Activations2；额外一次被冷却阻止。
- 双控60ms的明确前后基线：Activations保持3，Cancelled从1增至2，保持Ready。
- 双控900ms：Activations从3增至4，进入Recharging。

鼠标/键盘不是直接调用组件方法。纯状态检查与真实输入证据分开保留。中间一次cua窗口状态失效错误可能已产生输入，因此没有把该失败尝试当作断言；后续建立新的前后基线才验证取消/释放。旧Player一次100ms键盘尝试也不算取消通过。

## 五个画面检查点

以下使用同一个成功原APK回合的有界帧和新构建目标截图。颜色区域表达“所审查的可用/不可用指示”，没有比较原始美术、伤害或内部计数的同义性。短输入/取消和两种激活路径还由上面的原生证据及目标检查分别支持。

| 检查点 | 原图匹配比例 | 目标匹配比例 | 结果 |
| --- | --- | --- | --- |
| short-input-keeps-ready | 0.31953125 | 1 | passed |
| dual-cancel-keeps-ready | 0.31953125 | 1 | passed |
| qualified-dual-enters-cooldown | 0 | 0 | passed |
| recharge-returns-ready | 0.31953125 | 1 | passed |
| button-reuse-enters-cooldown | 0.004609375 | 0 | passed |

原游戏选区为红色技能指示；目标选区为自己的绿色状态块。首轮目标RGB上界R<=80是错误的线性颜色假设，导致3个Ready检查失败。独立且早于最终Player案例的active-ready基准图实际RGB范围为R98–99、G225–226、B77–79；已记录校准来源/哈希和固定新阈值，再重放五项检查全部通过。原mismatch配置和结果均保留。没有修改截图或把不匹配结果改写为通过。

## 失败、边界与审查

固定等待曾将输入发送到选部件/结算画面，这些执行完成记录未标为语义通过。两次视觉阶段等待未达到前置条件，都停止后续输入并保留failed。第三次从已确认比赛转场开始，实际阶段到达后才执行完整周期。

独立审查的三项Important已修复且见到对应RED→GREEN：超时后匹配不得继续输入；native共享别名乘法展开必须在序列化前限额；示例Editor验证不得覆盖既有prefab/scene且须检查保存返回值。真实Unity副本覆盖复现后，修复运行明确拒绝，两个既有资产哈希不变。目录快照还补足了原始文件选择测试，发现并修复desktop原始文件未被调查选择的问题。迁移驱动增加占用输出先拒绝测试。

最终自动回归：51项JavaScript +35项Python全部通过，未跳过；原33份vendored实践文件哈希一致。另有21项实际Unity检查、干净构建及5个原图/目标图状态检查点。Synthetic demo单独通过，其结果不冒充真实游戏验证。打包安装MCP检查在本记录末尾补充。

## 本地证据入口

证据根为 `.verification/general-feature-loop/`，没有随npm包分发原APK、DLL、DEX、私有构建或截图。

- `verification-record.json`：哈希汇总、来源、新旧schema一致性、21项Unity结果、输入与五项比较，保留失败项且human_acceptance为not_recorded。
- `run/investigation.json`、`native-inspection.json`、`derived-native-inspection.json`：新索引及明确窗口。
- `fresh-schema-provenance.json`、`fresh-schema-recovery.log`、`WarriorCore-fresh-components.json`、`AbilityButton-fresh-components.json`：新schema链。
- `resource-roots.json`：完整/部分引用范围。
- `final-transfer-result.json`：不可变迁移计划和收据。收据本身validation_status仍为not_run；后续实际执行证据独立关联，不改写历史收据。
- `VerifiedTarget/ability-validation.json`、`VerifiedTarget/ability-build.txt`、`final-target-green.log`、`final-player-build.log`。
- `source-gated3-result.json`、`source-unity-gated.log`、`verified-*-trace.json`、`run/source-workspace/reports/verified-target-*.jpg`。
- `signal-calibration.json`、`signal-checkpoints-calibrated.json`、`signal-results-calibrated.json`、`existing-target-preservation.json`。
- `VerifiedTarget/` 和 `VerifiedAbilityPlayer.app`：可检查的最终目标项目与Player。

没有记录人类验收或任意Unity游戏的普适成功保证。代码语义调查、目标适配和真实输入仍由宿主智能体执行；工具负责边界、来源、操作和结果保留。

打包后的独立临时目录安装已通过：241个MCP工具，其中34个Unity工具；实际REA managed parser调用通过，包为0.5.0，共210项文件。新四项工具均在安装后的目录中检查存在。离线安装读取包自身shrinkwrap，结果见package-smoke.log。
