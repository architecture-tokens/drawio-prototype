# Architecture Tokens 剩余工作

> 2026-08-24 基线。本文只列下一阶段尚未完成的 Architecture Tokens 工作；不再扩展 showcase 数量，先把今天验证的方法变成产品能力。

## 当前基线

五个 `final-reproduce.svg` 均已通过完整跨层门禁，但这只证明手工产物可行，不代表 CLI 已能自动生成同等结果。

| 示例                 | `rules-lint --full` 实测结果                 |
| -------------------- | -------------------------------------------- |
| `1-cloud-web-app`    | 15 PASS / 0 FAIL / 1 WARN / 23 NOT-CHECKABLE |
| `2-cicd-flow`        | 16 PASS / 0 FAIL / 0 WARN / 23 NOT-CHECKABLE |
| `3-microservices-c4` | 16 PASS / 0 FAIL / 0 WARN / 23 NOT-CHECKABLE |
| `4-kubernetes`       | 17 PASS / 0 FAIL / 0 WARN / 22 NOT-CHECKABLE |
| `5-event-pipeline`   | 17 PASS / 0 FAIL / 0 WARN / 22 NOT-CHECKABLE |

证据入口：[`examples/showcase/README.md`](examples/showcase/README.md)、[`tools/rules-lint.mjs`](tools/rules-lint.mjs)。

## P0：把已验证的契约纳入正式流水线

### 1. 将 View Layer Contract 产品化

**缺口：** `view.yaml` 目前仍被文档称为 prototype，只由 `tools/rules-lint.mjs` 和 showcase 使用；`src/` 下的正式 CLI 没有读取 view。当前渲染入口实际只有 `model + layout`。

**例子：** `cloud-web-app` 的同一个 `model.yaml` 有 `reproduce` 和 `restyle` 两个 view；AWS 图标、AZ 交叉带、SSL 锁都属于 view，现有 CLI 无法表达或生成它们。

**完成标准：**

- 发布带版本的 view JSON Schema，覆盖 `mode`、`flow.direction`、组件/关系附件及 `visualElements`。
- CLI 支持显式 `--view`，并在调用 planner/renderer 前完成 schema、引用和 attachment 校验。
- 用一个 model 生成两种合法 view 的集成测试，且输出保留 `data-component`、`data-relationship`、`data-view-element` 绑定。

### 2. 将视觉拓扑纳入通用 Layout 校验（已完成）

**原缺口：** [`src/layout.ts`](src/layout.ts) 原先只检查 schema、ID、单一 `parentId` 和父子环；不会发现节点碰撞、无语义线交叉、错误 T-junction 或拆段后漏掉的尖角。

**今天的证据：**

- `cloud-web-app` 的 CDN 路径曾在 `y=560` 穿过 Web 汇流总线和第一条分支，layout 仍合法；恢复到源图对应的 `y=626` 后两个交叉才消失（提交 `013f6a9`）。
- 16 个扇入/扇出直角因分散在多个单段 polyline 中绕过 rule 3a；改成统一半径 5 的 path 后，检查结果才变为 18 条圆角连接线、21 个弯（提交 `f0dab8e`）。

**完成证据：**

- `src/topology.ts` 新增 `NODE_COLLISION`、`EDGE_CROSSING`、`INVALID_EDGE_JUNCTION`；`tools/rules-lint.mjs` 新增 `VISUAL_TOPOLOGY`，并让 rule 3a 识别拆在多个 SVG 元素中的扇形尖角。
- 历史 `y=560` fixture 会报告 `(259.5,593)`、`(236.5,560)` 两处交叉；当前 `y=626` 通过。
- 共享语义端点、真正总线/T-junction、父子包含、包含至少两个节点的结构 overlay 自动允许；无法推断的 source-faithful 交叉只能用精确 edge-pair 声明。
- 五例完整门禁保持 0 FAIL。详见 [`docs/visual-topology.md`](docs/visual-topology.md)。

### 3. 让 renderer 真正由 token + view 驱动

**缺口：** [`src/drawio.ts`](src/drawio.ts) 目前只为 database、actor、service 提供少量基本样式，关系也只有两种 edge style；showcase 的高保真 SVG 仍需手工应用图标、颜色、附件和容器，再从 diagrams.net 导出。

**例子：** 官方 AWS 图标、环境/领域颜色、SSL edge badge、AZ band 都已在 showcase 证明可行，但 `archtokens generate` 还不会生成这些视觉语义。

**完成标准：** 建立 component/relationship/token 到 draw.io style、官方 icon、badge 和 container 的注册表；`archtokens generate model --view view --out out.drawio` 无需手改即可生成可编辑且跨层绑定完整的结果。

## P1：把转换和 AI 规划变成可重复能力

### 4. 产品化 source → census → model/view/layout 的导入流程（已完成首版）

**缺口：** `--census-dump` 已能枚举 draw.io/Mermaid 源元素，但 census 分类、model/view 绑定和 layout 提取仍是逐例手工工作。

**例子：** `cloud-web-app` 的 51 个源元素已经证明“一源元素一个 primary bucket + trace links”可行；今天的错误也说明人工坐标提取会把源 edge 38 的 `y=760` 错译成 `y=560`。

**完成标准：** 提供 import/scaffold 命令，生成稳定 source id 清单、census 草稿和未决项；机器可确定的节点、边、坐标与方向自动提取，所有无法判断的分类必须显式留为待决，禁止静默 drop。

**完成证据：** `archtokens import-source` 现可读取 draw.io/mxGraph XML、Mermaid flowchart 与 Mermaid C4，输出 byte-deterministic inventory/source-layout；`archtokens scaffold-census` 把未分类元素保留为 `TODO`，完整 mappings 则生成可通过 `CENSUS_MISMATCH` 的正式 census。真实 cloud 源实测为 28 vertex + 23 edge = 51，并由回归测试锁定 edge 38 的 `{x:230,y:760}`，禁止退回历史错误 `y=560`。详见 [`docs/source-import.md`](docs/source-import.md)。

### 5. 建立 planner 基准，而不是继续手写 layout

**缺口：** showcase 明确说明 layout 是 hand-authored；[`src/planner.ts`](src/planner.ts) 的真实 OpenAI 调用也被测试刻意跳过。因此目前只验证了 planner 的 JSON/schema 接口，没有验证其图质量。

**完成标准：** 以五个 showcase 为固定 benchmark，保存 planner 原始 layout，并自动评估：ID 完整、方向一致、0 非语义交叉、0 碰撞、统一拐角、跨层 full gate 0 FAIL；一次 repair 后仍不合格必须失败，不能输出“schema 合法但视觉错误”的图。

## P2：需要进入 spec/ADR 的契约决策

- **多重视觉归属：** layout v0.1 只有一个 `parentId`，无法表达 `cloud-web-app` 中实例同时属于 AZ 与 Auto Scaling Group；需要决定采用多 membership、独立 visual grouping，还是保持 view-only overlay。
- **Presentation vocabulary：** 明确“类型定义在 token library、应用存在 view”的正式边界，并将 icon、badge、九宫格 anchor、flow direction 纳入可版本化契约。
- **v1 非目标继续锁定：** ports、ER 属性端口、statechart AND-region、force-directed mesh、Sankey 暂不进入实现，直到相应契约存在。

## 开工顺序

1. 修正文档漂移并生成一张自动 gate matrix——目前 `2-cicd-flow`、`5-event-pipeline` 的部分说明仍写着旧的 `--full` 失败，而本次实测均为 0 FAIL。
2. View schema + CLI 输入。
3. 通用 layout/route 诊断。
4. token/view 驱动 renderer。
5. import/census scaffold。
6. 五例 planner benchmark，随后再决定是否增加新 diagram 类型。
