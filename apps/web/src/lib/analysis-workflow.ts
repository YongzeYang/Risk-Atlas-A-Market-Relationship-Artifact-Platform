import type { WorkflowStripItem } from '../components/ui/WorkflowStrip';

type WorkflowStage = 'snapshot' | 'groups' | 'compare' | 'relationships' | 'spillover';

type WorkflowLinks = {
  snapshotTo?: string;
  groupsTo?: string;
  compareTo?: string;
  relationshipsTo?: string;
  spilloverTo?: string;
};

function buildWorkflowItem(
  current: WorkflowStage | null,
  stage: WorkflowStage,
  label: string,
  title: string,
  description: string,
  actionLabel: string,
  to?: string
): WorkflowStripItem {
  return {
    id: stage,
    label,
    title,
    description,
    actionLabel: current === stage ? 'Current stage' : actionLabel,
    to,
    current: current === stage
  };
}

export function buildAnalysisWorkflowItems(
  current: Exclude<WorkflowStage, 'snapshot'> | null,
  links: WorkflowLinks = {}
): WorkflowStripItem[] {
  const groupsTo = links.groupsTo ?? '/structure';
  const compareTo = links.compareTo ?? '/compare';
  const relationshipsTo = links.relationshipsTo ?? '/divergence';
  const spilloverTo = links.spilloverTo ?? '/exposure';

  return [
    buildWorkflowItem(
      current,
      'groups',
      'Step 1 · Groups',
      'See the hidden blocs first',
      'Reorder one snapshot so crowded blocs and loose outliers show up before you compare anything else.',
      'Open Groups',
      groupsTo
    ),
    buildWorkflowItem(
      current,
      'compare',
      'Step 2 · What changed',
      'Check whether the structure drifted',
      'Bring in a second finished read only when the question is change rather than one snapshot by itself.',
      'Open What changed',
      compareTo
    ),
    buildWorkflowItem(
      current,
      'relationships',
      'Step 3 · Relationships',
      'Narrow the drift to the pair level',
      'Use the saved snapshot to surface which pairs tightened, broke, or stretched relative to the wider basket read.',
      'Open Relationships',
      relationshipsTo
    ),
    buildWorkflowItem(
      current,
      'spillover',
      'Step 4 · Spillover',
      'Trace who echoes one name',
      'Start from an anchor stock when you need the risk circle around one name rather than one pair or one bloc.',
      'Open Spillover',
      spilloverTo
    )
  ];
}

export function buildSnapshotWorkflowItems(
  current: WorkflowStage | null,
  links: WorkflowLinks = {}
): WorkflowStripItem[] {
  const snapshotTo = links.snapshotTo ?? '/builds';

  return [
    buildWorkflowItem(
      current,
      'snapshot',
      'Base read',
      'Anchor on one finished snapshot',
      'Start with one basket, one date, and one lookback before you branch into groups, comparison, pair drift, or spillover.',
      'Open snapshot',
      snapshotTo
    ),
    ...buildAnalysisWorkflowItems(
      current === 'snapshot' ? null : (current as Exclude<WorkflowStage, 'snapshot'> | null),
      links
    )
  ];
}