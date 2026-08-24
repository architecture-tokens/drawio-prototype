import type { ArchitectureView, ViewAttachment } from './types.js';

export type VisualVocabularyEntry = {
  style: string;
  role: 'component-icon' | 'badge' | 'visual-icon' | 'visual-group';
};

/**
 * Deterministic, closed rendering vocabulary for Architecture View chrome.
 *
 * Styles use draw.io's built-in AWS4/GCP2 stencils, so the output remains
 * editable and does not rely on remote image URLs or embedded raster payloads.
 */
export const attachmentRegistry: Readonly<Record<string, VisualVocabularyEntry>> = {
  api: {
    role: 'component-icon',
    style:
      'shape=hexagon;perimeter=hexagonPerimeter2;fillColor=#EAF2FF;strokeColor=#2F5597;fontColor=#1F2937;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  database: {
    role: 'component-icon',
    style:
      'shape=cylinder3;boundedLbl=1;backgroundOutline=1;fillColor=#F3E8FF;strokeColor=#7E57C2;fontColor=#1F2937;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  'encrypted-link': {
    role: 'badge',
    style:
      'shape=mxgraph.aws4.ssl_padlock;outlineConnect=0;fillColor=#232F3E;gradientColor=none;strokeColor=none;aspect=fixed;html=1;connectable=0;pointerEvents=0;',
  },
  'actor.user': {
    role: 'component-icon',
    style:
      'shape=mxgraph.aws4.user;outlineConnect=0;fillColor=#232F3E;strokeColor=none;fontColor=#232F3E;aspect=fixed;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  'aws.route53': {
    role: 'component-icon',
    style:
      'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.route_53;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  'aws.elb': {
    role: 'component-icon',
    style:
      'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elastic_load_balancing;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  'aws.cloudfront': {
    role: 'component-icon',
    style:
      'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudfront;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  'aws.static-assets': {
    role: 'component-icon',
    style:
      'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.general;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  'aws.s3': {
    role: 'component-icon',
    style:
      'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  'aws.ec2-instance': {
    role: 'component-icon',
    style:
      'shape=mxgraph.aws4.m4_instance;outlineConnect=0;fillColor=#F58534;gradientColor=none;strokeColor=none;fontColor=#232F3E;aspect=fixed;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  'aws.rds': {
    role: 'component-icon',
    style:
      'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.database;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  'security.ssl-padlock': {
    role: 'badge',
    style:
      'shape=mxgraph.aws4.ssl_padlock;outlineConnect=0;fillColor=#232F3E;gradientColor=none;strokeColor=none;aspect=fixed;html=1;connectable=0;pointerEvents=0;',
  },
  'gcp.kubernetes-engine': {
    role: 'component-icon',
    style:
      'shape=mxgraph.gcp2.kubernetes_engine;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  'gcp.laptop': {
    role: 'component-icon',
    style: 'shape=mxgraph.gcp2.laptop;html=1;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  'gcp.cloud-logo': {
    role: 'visual-icon',
    style: 'shape=mxgraph.gcp2.google_cloud_platform;html=1;connectable=0;pointerEvents=0;',
  },
};

export const visualElementRegistry: Readonly<Record<string, VisualVocabularyEntry>> = {
  'environment-band': {
    role: 'visual-group',
    style:
      'rounded=1;arcSize=8;strokeColor=#5A6C86;fillColor=#F5F8FC;opacity=35;dashed=1;strokeWidth=2;html=1;pointerEvents=0;',
  },
  'availability-zone-band': {
    role: 'visual-group',
    style:
      'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_availability_zone;strokeColor=#5A6C86;fillColor=none;dashed=1;strokeWidth=2;html=1;pointerEvents=0;',
  },
  'autoscaling-group-band': {
    role: 'visual-group',
    style:
      'shape=mxgraph.aws4.groupCenter;grIcon=mxgraph.aws4.group_auto_scaling_group;strokeColor=#D86613;fillColor=none;dashed=1;strokeWidth=2;verticalAlign=top;spacingTop=8;fontStyle=1;html=1;pointerEvents=0;',
  },
  'pipeline-stage-container': {
    role: 'visual-group',
    style:
      'rounded=1;arcSize=8;strokeColor=#6B7280;fillColor=none;dashed=1;strokeWidth=2;html=1;pointerEvents=0;',
  },
  'c4-container-boundary': {
    role: 'visual-group',
    style:
      'rounded=1;arcSize=6;strokeColor=#1168BD;fillColor=none;dashed=1;strokeWidth=2;html=1;pointerEvents=0;',
  },
  'platform-boundary': {
    role: 'visual-group',
    style:
      'rounded=1;arcSize=6;strokeColor=#4285F4;fillColor=none;strokeWidth=2;html=1;pointerEvents=0;',
  },
  'namespace-boundary': {
    role: 'visual-group',
    style:
      'rounded=1;arcSize=6;strokeColor=#7B61A8;fillColor=none;dashed=1;strokeWidth=2;html=1;pointerEvents=0;',
  },
  'title-band': {
    role: 'visual-group',
    style:
      'rounded=0;strokeColor=#263238;fillColor=#263238;fontColor=#FFFFFF;fontStyle=1;align=left;spacingLeft=16;html=1;pointerEvents=0;',
  },
};

export class UnknownVisualVocabularyError extends Error {
  constructor(kind: 'icon' | 'visual element kind', value: string, location: string) {
    super(`Unknown Architecture View ${kind} "${value}" at ${location}`);
    this.name = 'UnknownVisualVocabularyError';
  }
}

const assertAttachmentsKnown = (attachments: ViewAttachment[], location: string) => {
  attachments.forEach((attachment, index) => {
    if (!attachmentRegistry[attachment.icon])
      throw new UnknownVisualVocabularyError('icon', attachment.icon, `${location}[${index}]`);
  });
};

export function assertKnownVisualVocabulary(view: ArchitectureView): void {
  for (const [componentId, attachments] of Object.entries(view.components))
    assertAttachmentsKnown(attachments, `components.${componentId}`);
  for (const [relationshipId, attachments] of Object.entries(view.relationships))
    assertAttachmentsKnown(attachments, `relationships.${relationshipId}`);
  view.visualElements.forEach((element, index) => {
    if (element.kind && !visualElementRegistry[element.kind])
      throw new UnknownVisualVocabularyError(
        'visual element kind',
        element.kind,
        `visualElements[${index}].kind`,
      );
    assertAttachmentsKnown(element.attachments ?? [], `visualElements[${index}].attachments`);
  });
}
