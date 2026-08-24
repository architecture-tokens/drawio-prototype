# Architecture View rendering contract

The draw.io renderer has two deliberately separate compatibility paths:

- Without `--view`, it uses the original model-only renderer. The checked-in
  `examples/golden.drawio` test requires byte-for-byte stability.
- With a validated Architecture View, it uses the closed renderer registry in
  `src/renderer-registry.ts`. The registry maps declared view vocabulary to
  editable draw.io stencil styles; it never embeds a remote image and never
  silently drops an unknown icon or visual-element kind.

## Deterministic precedence

For a component in view mode, rendering precedence is:

1. a registered component icon attachment;
2. a structural visual-element binding, when one layout component contains all
   declared members;
3. semantic component type and token styles.

Relationship types select the base arrow style. Semantic applications such as
`security:security.encryption.in-transit` and
`cicd:pipeline.stage-transition` add deterministic stroke styles. Registered
edge attachments become editable vertex cells positioned on the routed edge.

Visual groups are inferred without model-specific IDs. If the smallest model
component geometrically contains every member, that component is dual-bound to
the visual element. Otherwise, the renderer creates a non-interactive overlay
around the member union. This is why the cloud example reuses its Web/App ASG
components but creates separate crossing Availability Zone overlays. Empty
groups such as a title band use a deterministic canvas-relative box.

## Trace bindings

View-mode XML carries inspectable bindings on ordinary `mxCell` attributes:

| Binding                                                    | Emitted on                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `data-component`, `data-component-type`                    | every model component                                               |
| `data-relationship`, `data-relationship-type`              | every model relationship                                            |
| `data-token-refs`                                          | every component and relationship, including an empty value          |
| `data-view-icons`                                          | every component and relationship                                    |
| `data-view-element`, `data-view-kind`, `data-view-members` | every visual element, whether an overlay or structural dual binding |
| `data-view-attachment`, `data-view-attachment-owner`       | editable attachment cells                                           |

These attributes are metadata only: draw.io preserves them while users move,
resize, reconnect, or restyle the native cells.

## Closed visual vocabulary

The current registry covers the checked-in Architecture Views:

- AWS user, Route 53, ELB, CloudFront, static resource, S3, EC2, RDS and SSL
  padlock stencils;
- GCP Kubernetes Engine, laptop and platform-logo stencils;
- generic API, database and encrypted-link entries used by the minimal example;
- Availability Zone, Autoscaling Group, pipeline stage, C4 container,
  environment, platform, namespace and title-band groups.

AWS and GCP entries use draw.io's built-in `mxgraph.aws4.*` and
`mxgraph.gcp2.*` stencil namespaces, keeping the result recognizable and
editable. A view icon or group kind outside this registry raises an
`UnknownVisualVocabularyError` containing the exact view path. Adding visual
vocabulary therefore requires an explicit registry and test change.

## Offline reproduction

The cloud showcase can be regenerated without an API key or hand-edited XML:

```sh
npm run build
node tools/offline-generate.mjs \
  examples/showcase/1-cloud-web-app/model.yaml \
  examples/showcase/1-cloud-web-app/layout-reproduce.json \
  --view examples/showcase/1-cloud-web-app/view-reproduce.yaml \
  --library examples/showcase/1-cloud-web-app/tokens.yaml \
  --out examples/showcase/1-cloud-web-app/out-reproduce.drawio
```

The resulting XML contains AWS stencil styles, two relationship-bound SSL
attachments, crossing AZ × ASG visual bindings, and the corrected `user-cdn`
route through `(259,626)` rather than the old crossing route through y=560.
