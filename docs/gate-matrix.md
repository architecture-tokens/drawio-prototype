# Architecture Tokens gate matrix

> This file is generated from actual pipeline reports; do not edit gate counts by hand.

| Example            | Source format     | Vertices / edges | PASS | FAIL | WARN | NOT-CHECKABLE | Generate |
| ------------------ | ----------------- | ---------------: | ---: | ---: | ---: | ------------: | -------- |
| 1-cloud-web-app    | mxgraph           |          28 / 23 |   15 |    0 |    1 |            23 | PASS     |
| 2-cicd-flow        | mermaid-flowchart |          12 / 10 |   16 |    0 |    0 |            23 | PASS     |
| 3-microservices-c4 | mermaid-c4        |           9 / 10 |   16 |    0 |    0 |            23 | PASS     |
| 4-kubernetes       | mxgraph           |           21 / 9 |   17 |    0 |    0 |            22 | PASS     |
| 5-event-pipeline   | mermaid-flowchart |            6 / 5 |   17 |    0 |    0 |            22 | PASS     |

Each row was produced by importing the checked-in source, validating the model and Architecture View, rendering with `layout-reproduce.json`, and running `rules-lint --full` against the cross-layer evidence.
