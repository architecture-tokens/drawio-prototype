# Architecture Tokens 剩余工作

> 2026-08-24 集成基线。这里只保留尚未决定或尚未用真实 planner 验证的工作；今天已经落地的能力不再列为 TODO。

## 已完成且有证据的基线

一条离线命令现在贯通 source evidence、spec/view 校验、layout/topology 校验、token/view renderer 和 cross-layer full gate：

```sh
npm run pipeline -- --all --out-dir /tmp/architecture-pipeline --matrix-out docs/gate-matrix.md
```

实际生成的 [`docs/gate-matrix.md`](docs/gate-matrix.md) 显示五例全部生成成功且 **0 FAIL**。关键例子：

- `cloud-web-app`：导入 28 vertex + 23 edge；输出 19 个 component、22 个 relationship、4 个 visual-element trace binding；AWS stencil、两个 SSL badge、AZ × ASG overlay 均由 renderer 生成。`user-cdn` 使用修正后的 `(259,626)`，历史 y=560 路线不再出现。
- `event-pipeline`：直接导入 Mermaid 的 6 vertex + 5 edge；Mermaid 没有坐标，所以 `source-layout.json` 如实保留 `null`，renderer 使用独立且已验证的 `layout-reproduce.json`；full gate 为 17 PASS / 0 FAIL。

对应实现和证据：

- View validation 与 CLI `--view`：[`src/view.ts`](src/view.ts)、[`test/view.test.ts`](test/view.test.ts)。
- 通用 collision/crossing/T-junction：[`src/topology.ts`](src/topology.ts)、[`docs/visual-topology.md`](docs/visual-topology.md)。
- token/view 驱动可编辑 draw.io：[`src/renderer-registry.ts`](src/renderer-registry.ts)、[`docs/view-rendering.md`](docs/view-rendering.md)。
- draw.io/Mermaid source import 与 census scaffold：[`src/source-import.ts`](src/source-import.ts)、[`docs/source-import.md`](docs/source-import.md)。
- ChatGPT Subscription benchmark harness：[`docs/subscription-planner-benchmark.md`](docs/subscription-planner-benchmark.md)。fixture 五例均为 100 分；live 实测只接受 3/5，另外 2 例在一次 repair 后按设计 fail-closed。

### Live Subscription planner 实测（redacted evidence）

| 示例             | 结果        | 分数 | Repair | Full-gate FAIL | 仍失败的 geometry                         |
| ---------------- | ----------- | ---: | -----: | -------------: | ----------------------------------------- |
| cloud-web-app    | PASS        |  100 |      1 |              0 | —                                         |
| cicd-flow        | FAIL-CLOSED |   30 |      1 |              1 | containment、crossing/junction、direction |
| microservices-c4 | FAIL-CLOSED |   80 |      1 |              0 | containment、collision                    |
| kubernetes       | PASS        |  100 |      1 |              0 | —                                         |
| event-pipeline   | PASS        |  100 |      0 |              0 | —                                         |

结论是 **3/5 accepted，2/5 correctly rejected**，不是五例 planner quality 通过。证据包为 `task6-live-summary.md` 与五份 schema-checked redacted report；不包含 raw prompt、raw response 或 auth 输出。C4 的 source-only topology allowlist 由 follow-up `1fc059b` 修正后复测，candidate layout 仍独立接受 collision/containment 校验。

## 真正剩余的契约选择

### 1. 发布 Architecture View / presentation vocabulary

当前 View v0.1 已由 pinned `@architecture-tokens/spec` commit 的 `architecture-view.schema.json`、引用与 anchor 校验执行，但仍是 prototype 版本，还没有稳定 release/migration 承诺。需要 ADR 决定：

- icon/badge/group vocabulary 由 spec、独立 presentation library，还是 renderer capability manifest 拥有；
- 未知 vocabulary 是否永远 hard-fail，还是允许显式 fallback；
- registry 版本如何写入 view，避免同一 view 随 renderer 升级发生无声明变化。

### 2. 多重视觉归属的正式语义

layout v0.1 仍只有一个 `parentId`。cloud 实例同时属于 AZ 和 ASG；当前可靠实现是一个结构 container 加一个 view-only overlay，并用几何 containment 自动 dual-bind。需要决定 spec 是否增加 multi-membership，还是把 crossing groups 永久定义为 View 能力。

### 3. source classification 的人工边界

importer 能无损列出 source IDs、geometry、direction 与 TODO census，但不会猜 component/token/visual/drop。需要确定产品 UX：mapping 文件评审、交互式确认，或带置信度的建议；无论选择哪种，未确认项仍必须显式 TODO，不能 silent drop。

## 真正剩余的产品验证

### 4. 修复两个被拒绝的 live planner case

harness 已限制为单例 foreground、最多一次 repair、最长 600 秒，并且不使用 API key。当前不是扩大 benchmark，而是针对 CI/CD 的 containment + crossing/junction + direction，以及 C4 的 containment + collision 改进 planner prompt/layout strategy；每次修改都必须重新跑同一 redacted gate。2/5 失败转绿前，不应宣称 planner 已产品化，也不能降低 fail-closed 阈值来换取通过。

### 5. renderer vocabulary 的扩展治理

当前 closed registry 覆盖五个 showcase 和 payments 示例，并对未知 icon/group 显式失败。进入产品前仍需决定新增 AWS/GCP/Azure/Kubernetes stencil 的审核、license/provenance、alias/deprecation 和视觉回归流程；这不是继续手写 showcase，而是治理可扩展 vocabulary。

### 6. pipeline 的发布形态

`tools/architecture-pipeline.mjs` 已证明完整离线链路，但目前按 showcase 目录约定发现 `model.yaml`、`view-reproduce.yaml`、`census.yaml`、`layout-reproduce.json` 和最终 SVG。需要决定正式 CLI 是 manifest 驱动、显式参数，还是保留目录约定；同时明确哪些 gate 必须阻止产物写出。

## v1 非目标

ports、ER 属性端口、statechart AND-region、force-directed mesh、Sankey 暂不进入实现，直到对应的 layout、membership 与 presentation 契约存在。
